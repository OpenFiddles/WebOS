const NAME = "WebOS";
const VERSION = "0.8";
const CACHE_NAME = `${NAME}-v${VERSION}`;

const CORE_ASSETS = [
  "/", "/index.html", "/mobile.html", "/html/mobileHome.html",
  "/html/mobile/mobileLauncher.html", "/site.webmanifest",
  "/html/BootScreen_popcorn.html", "/html/DisplayManager_PopIT.html",
  "/js/os/desktop/app-registry.js", "/js/os/desktop/filesystem.js",
  "/html/Launcher_Popo.html", "/html/apps/emulator_alpine/index.html",
  "/css/universal_css_native_stuff.css", "/js/app.js"
];

function broadcastStatus(type, data) {
  self.clients.matchAll().then(clients => clients.forEach(client => client.postMessage({ type, data })));
}

async function cacheCoreAssetsWithProgress() {
  const cache = await caches.open(CACHE_NAME);
  let loadedCount = 0;
  broadcastStatus("CACHE_START", { total: CORE_ASSETS.length });
  await Promise.all(CORE_ASSETS.map(async url => {
    try {
      const response = await fetch(url, { cache: "reload" });
      if (!response.ok) throw new Error(`Failed to load asset: ${url}`);
      await cache.put(url, response);
    } catch (err) {
      broadcastStatus("CACHE_ERROR", { url, error: err.message });
    } finally {
      loadedCount++;
      broadcastStatus("CACHE_PROGRESS", {
        url, percent: Math.round(loadedCount / CORE_ASSETS.length * 100),
        loaded: loadedCount, total: CORE_ASSETS.length
      });
    }
  }));
  broadcastStatus("CACHE_COMPLETE", { success: true });
}

self.addEventListener("install", event => {
  event.waitUntil(cacheCoreAssetsWithProgress());
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(NAME + "-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  if (request.referrer && request.referrer.includes("/api/browser-proxy")) {
    try {
      const referrerUrl = new URL(request.referrer);
      const original = referrerUrl.searchParams.get("url");
      if (original) {
        const targetOrigin = new URL(original).origin;
        if (requestUrl.origin === self.location.origin && !requestUrl.pathname.startsWith("/api/")) {
          const remote = targetOrigin + requestUrl.pathname + requestUrl.search;
          event.respondWith(fetch("/api/browser-proxy?url=" + encodeURIComponent(remote)));
          return;
        }
      }
    } catch (error) {
      console.error("WebOS proxy URL rewrite failed:", error);
    }
  }

  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith("/api/")) return;
  if (request.method !== "GET" || requestUrl.pathname.endsWith(".iso")) return;

  if (requestUrl.pathname === "/html/apps/emulator_alpine/alpine.ext2" && request.headers.has("range")) {
    event.respondWith(serveRange(request));
    return;
  }

  // Always refresh navigation entry points so an old cached desktop shell cannot mask mobile routing.
  if (request.mode === "navigate" && (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request, { cache: "no-store" });
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        return (await cache.match(request)) || (await cache.match("/index.html")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  })());
});

async function serveRange(request) {
  const cache = await caches.open(CACHE_NAME);
  let response = await cache.match("/html/apps/emulator_alpine/alpine.ext2");
  if (!response) {
    response = await fetch("/html/apps/emulator_alpine/alpine.ext2");
    if (!response.ok) return response;
    await cache.put("/html/apps/emulator_alpine/alpine.ext2", response.clone());
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const range = request.headers.get("range").match(/bytes=(\\d+)-(\\d*)/);
  if (!range) return new Response(bytes, { status: 200, headers: response.headers });
  const start = Number(range[1]);
  const requestedEnd = range[2] ? Number(range[2]) : bytes.length - 1;
  const end = Math.min(requestedEnd, bytes.length - 1);
  if (start >= bytes.length || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
  }
  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
      "Content-Type": "application/octet-stream",
      "ETag": "webos-alpine-ext2"
    }
  });
}
