const NAME = "WebOS";
const VERSION = "1.18";
const CACHE_NAME = `${NAME}-v${VERSION}`;

const CORE_ASSETS = [
  "/", "/index.html", "/mobile.html", "/html/mobileHome.html",
  "/html/mobile/mobileLauncher.html", "/site.webmanifest",
  "/html/BootScreen_popcorn.html", "/html/DisplayManager_PopIT.html",
  "/js/os/desktop/app-registry.js", "/js/os/desktop/filesystem.js",
  "/js/os/desktop/Permissions.js", "/js/os/desktop/DeviceInfo.js", "/js/os/desktop/CloudSync.js",
  "/js/os/desktop/WASMRuntime.js", "/js/os/desktop/Notifications.js",
  "/js/os/desktop/Appearance.js", "/js/os/desktop/DesktopInteractions.js", "/js/os/window/Launcher.js",
  "/js/os/window/WindowManager.js", "/js/os/window/SystemApps.js", "/js/os/window/NotesStudio.js", "/js/os/window/MediaApps.js",
  "/js/os/window/Documentation.js", "/js/os/window/AnimationStudio.js",
  "/js/os/mobile/mobile-runtime.js",
  "/css/display/regular_theme.css", "/css/display/wasm_runtime.css",
  "/css/display/appearance_bridge.css", "/css/display/settings_session.css",
  "/css/display/notifications.css", "/css/display/system_monitor.css",
  "/css/display/developer_platform.css", "/css/display/files_explorer.css",
  "/css/display/experience_motion.css", "/css/display/mobile_shell.css",
  "/css/boot/boot.css", "/css/display/glass_base.css", "/css/display/tasbar_dock.css",
  "/css/display/launcher.css", "/css/display/window.css", "/css/display/markdown_note.css",
  "/css/display/desktop.css", "/css/display/desktop_refresh.css", "/css/display/root.css",
  "/css/display/utility.css", "/css/display/motion_system.css", "/css/display/liquid_glass.css",
  "/css/display/animation_studio.css",
  "/html/Launcher_Popo.html", "/html/apps/emulator_debian/index.html",
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
    const previous = keys.filter(key => key.startsWith(NAME + "-") && key !== CACHE_NAME);
    await Promise.all(previous.map(key => caches.delete(key)));
    await self.clients.claim();
    if (previous.length) broadcastStatus("WEBOS_UPDATE_AVAILABLE", { version: VERSION });
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith("/api/")) return;
  if (request.method !== "GET" || requestUrl.pathname.endsWith(".iso") || requestUrl.pathname.endsWith(".img")) return;

  // Always refresh navigation entry points so the desktop shell cannot mask newer app code.
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
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
