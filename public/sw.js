const NAME = "WebOS";
const VERSION = "0.5"; // Matches versioning strings accurately
const CACHE_NAME = `${NAME}-v${VERSION}`;

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/html/BootScreen_popcorn.html',
  '/html/DisplayManager_PopIT.html',
  '/js/os/desktop/app-registry.js',
  '/js/os/desktop/filesystem.js',
  '/html/Launcher_Popo.html',
  '/html/apps/emulator_alpine/index.html',
  '/html/apps/emulator_alpine/asset-config.js',
  '/html/apps/emulator_alpine/alpine.ext2', // Large image file tracked via byte-stream
  '/css/universal_css_native_stuff.css',
  '/js/app.js'
];

// Helper to broadcast progress messages back to WebOS windows
function broadcastStatus(type, data) {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({ type, data });
    });
  });
}

// Advanced fetch helper to track raw download progress using ReadableStream
async function fetchWithProgress(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load asset: ${url}`);

  const contentLength = response.headers.get('content-length');
  if (!contentLength || !response.body) {
    return response;
  }

  const totalBytes = parseInt(contentLength, 10);
  let loadedBytes = 0;

  const reader = response.body.getReader();
  const stream = new ReadableStream({
    async start(controller) {
      while (true) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            break;
          }
          loadedBytes += value.byteLength;
          
          broadcastStatus('CACHE_FILE_STREAM', {
            url,
            loadedBytes,
            totalBytes,
            percent: Math.round((loadedBytes / totalBytes) * 100)
          });

          controller.enqueue(value);
        } catch (streamError) {
          controller.error(streamError);
          break;
        }
      }
    }
  });

  // Construct a new response passing the tracked stream along with original headers
  return new Response(stream, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText
  });
}

// Custom progress-tracking cache populator with complete network fault-tolerance
async function cacheCoreAssetsWithProgress() {
  const cache = await caches.open(CACHE_NAME);
  let loadedCount = 0;
  
  broadcastStatus('CACHE_START', { total: CORE_ASSETS.length });

  // Map files out individually into isolated execution safety containers
  const promises = CORE_ASSETS.map(async (url) => {
    try {
      const response = await fetchWithProgress(url);
      
      // CRITICAL FIX: Cache storage engines consume responses. We must clone 
      // the streaming object safely to protect the runtime memory space.
      await cache.put(url, response.clone());
      return { url, success: true };
    } catch (err) {
      // Robust Fallback: If a file cannot be fetched, flag it but do NOT crash the boot loader loop
      console.error(`[WebOS Kernel] Skipping unmounted asset: ${url} ->`, err.message);
      broadcastStatus('CACHE_ERROR', { url, error: err.message });
      return { url, success: false, error: err.message };
    } finally {
      // Always increment progress meters even if an asset fails to load
      loadedCount++;
      const percent = Math.round((loadedCount / CORE_ASSETS.length) * 100);
      broadcastStatus('CACHE_PROGRESS', { 
        url, 
        percent, 
        loaded: loadedCount, 
        total: CORE_ASSETS.length 
      });
    }
  });

  // CRITICAL FIX: Changed from Promise.all to Promise.allSettled so the boot loop 
  // finishes and transitions to the desktop even if some network files fail.
  await Promise.allSettled(promises);
  broadcastStatus('CACHE_COMPLETE', { success: true });
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheCoreAssetsWithProgress());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((cacheName) => cacheName !== CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  if (requestUrl.pathname === '/api/browser-proxy') {
    return;
  }

  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin || requestUrl.pathname.endsWith('.iso')) {
    return;
  }

  if (requestUrl.pathname === '/html/apps/emulator_alpine/alpine.ext2' && request.headers.has('range')) {
    event.respondWith(serveRange(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((networkResponse) => {
        if (networkResponse.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse.clone()));
        }
        return networkResponse;
      }).catch((fetchErr) => {
        console.warn(`[WebOS Fetch Fallback] File offline: ${requestUrl.pathname}`, fetchErr);
        // Returns a safe empty 404 response framework instead of locking up the iframe pipeline
        return new Response('Asset unavailable offline', { status: 404, statusText: 'Offline Missing' });
      });
    })
  );
});

async function serveRange(request) {
  const cache = await caches.open(CACHE_NAME);
  let response = await cache.match('/html/apps/emulator_alpine/alpine.ext2');

  if (!response) {
    try {
      response = await fetchWithProgress('/html/apps/emulator_alpine/alpine.ext2');
      if (!response.ok) return response;
      await cache.put('/html/apps/emulator_alpine/alpine.ext2', response.clone());
    } catch (fallbackError) {
      return new Response(null, { status: 404, statusText: 'Virtual Disk Image Offline' });
    }
  }

  try {
    const bytes = new Uint8Array(await response.arrayBuffer());
    const range = request.headers.get('range').match(/bytes=(\d+)-(\d*)/);

    if (!range) return new Response(bytes, { status: 200, headers: response.headers });

    const start = Number(range[1]);
    const requestedEnd = range[2] ? Number(range[2]) : bytes.length - 1;
    const end = Math.min(requestedEnd, bytes.length - 1);

    if (start >= bytes.length || start > end) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${bytes.length}` }
      });
    }

    return new Response(bytes.slice(start, end + 1), {
      status: 206,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${bytes.length}`,
        'Content-Type': 'application/octet-stream',
        'ETag': 'webos-alpine-ext2'
      }
    });
  } catch (bufferError) {
    return new Response(null, { status: 500, statusText: 'Internal Disk Streaming Error' });
  }
}
