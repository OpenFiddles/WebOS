const NAME = "WebOS"; 
const VERSION = "0.7"; // Matches versioning strings accurately
const CACHE_NAME = `${NAME}-v${VERSION}`; 

const CORE_ASSETS = [ 
    '/', 
    '/index.html', 
    '/mobile.html', 
    '/html/mobileHome.html', 
    '/site.webmanifest', 
    '/html/BootScreen_popcorn.html', 
    '/html/DisplayManager_PopIT.html', 
    '/js/os/desktop/app-registry.js', 
    '/js/os/desktop/filesystem.js', 
    '/html/Launcher_Popo.html', 
    '/html/apps/emulator_alpine/index.html', 
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

// Custom progress-tracking cache populator 
async function cacheCoreAssetsWithProgress() { 
    const cache = await caches.open(CACHE_NAME); 
    let loadedCount = 0; 
    broadcastStatus('CACHE_START', { total: CORE_ASSETS.length }); 
    
    // Fetch each file individually to log the system loading status 
    const promises = CORE_ASSETS.map(async (url) => { 
        try { 
            const response = await fetch(url); 
            if (!response.ok) throw new Error(`Failed to load asset: ${url}`); 
            await cache.put(url, response); 
        } catch (err) { 
            broadcastStatus('CACHE_ERROR', { url, error: err.message }); 
        } finally { 
            // Always increment & calculate percentage even if a single asset breaks 
            loadedCount++; 
            const percent = Math.round((loadedCount / CORE_ASSETS.length) * 100); 
            broadcastStatus('CACHE_PROGRESS', { url, percent, loaded: loadedCount, total: CORE_ASSETS.length }); 
        } 
    }); 
    await Promise.all(promises); 
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

/* ---------- CORE WORKSPACE NETWORK INTERCEPTOR ---------- */

self.addEventListener('fetch', (event) => { 
    const request = event.request; 
    const requestUrl = new URL(request.url); 

    // 1. IFRAME BROWSER PROXY LAYER: Intercept secondary requests fired inside proxy contexts
    // If a request is pointing to your backend proxy, or is an internal frame element asset request
    if (request.referrer && request.referrer.includes('/api/browser-proxy')) {
        const referrerUrl = new URL(request.referrer);
        const originalUrlParam = referrerUrl.searchParams.get('url');

        if (originalUrlParam) {
            try {
                const targetOrigin = new URL(originalUrlParam).origin;
                
                // If the app tries to fetch a local resource relative to your backend path (e.g. /static/logo.png),
                // resolve it against the target website's true remote host address origin context
                if (requestUrl.origin === self.location.origin && !requestUrl.pathname.startsWith('/api/')) {
                    const resolvedRemoteUrl = `${targetOrigin}${requestUrl.pathname}${requestUrl.search}`;
                    
                    // Rewrite request pipeline and route back cleanly via server.js proxy configuration
                    const proxyUrl = `/api/browser-proxy?url=${encodeURIComponent(resolvedRemoteUrl)}`;
                    event.respondWith(fetch(proxyUrl));
                    return;
                }
            } catch (e) {
                console.error("Proxy URL parser conversion mismatch boundary failed:", e);
            }
        }
    }

    // Exclude explicit web proxy API router calls from caching operations
    if (requestUrl.pathname === '/api/browser-proxy' || requestUrl.pathname.startsWith('/api/')) { 
        return; 
    } 

    // Skip POST/PUT operations, cross-origin sources, or raw large system ISO binaries 
    if (request.method !== 'GET' || requestUrl.origin !== self.location.origin || requestUrl.pathname.endsWith('.iso')) { 
        return; 
    } 

    // Intercept and stream virtual ranges for Alpine storage images 
    if (requestUrl.pathname === '/html/apps/emulator_alpine/alpine.ext2' && request.headers.has('range')) { 
        event.respondWith(serveRange(request)); 
        return; 
    } 

    // Standard static asset filesystem caching retrieval wrapper fallbacks
    event.respondWith( 
        caches.match(request).then((cachedResponse) => { 
            if (cachedResponse) { 
                return cachedResponse; 
            } 
            return fetch(request).then((networkResponse) => { 
                if (networkResponse.ok) { 
                    const responseCopy = networkResponse.clone(); 
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy)); 
                } 
                return networkResponse; 
            }); 
        }) 
    ); 
}); 

/* ---------- VIRTUAL BLOCK ARCHIVE BYTE RANGE TRACKER ---------- */

async function serveRange(request) { 
    const cache = await caches.open(CACHE_NAME); 
    let response = await cache.match('/html/apps/emulator_alpine/alpine.ext2'); 
    if (!response) { 
        response = await fetch('/html/apps/emulator_alpine/alpine.ext2'); 
        if (!response.ok) return response; 
        await cache.put('/html/apps/emulator_alpine/alpine.ext2', response.clone()); 
    } 
    
    const bytes = new Uint8Array(await response.arrayBuffer()); 
    const range = request.headers.get('range').match(/bytes=(\d+)-(\d*)/); 
    if (!range) return new Response(bytes, { status: 200, headers: response.headers }); 
    
    const start = Number(range[1]); 
    const requestedEnd = range[2] ? Number(range[2]) : bytes.length - 1; 
    const end = Math.min(requestedEnd, bytes.length - 1); 
    
    if (start >= bytes.length || start > end) { 
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } }); 
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
}
