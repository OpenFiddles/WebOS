function openDocumentation() {
    if (typeof closeLauncher === "function") closeLauncher();
    const shell = document.createElement("div");
    shell.className = "docs-app";
    shell.innerHTML = [
      '<aside class="docs-sidebar">',
      '<div class="docs-brand"><span>W</span><div><b>WebOS Docs</b><small>Help & developer guide</small></div></div>',
      '<label class="docs-search-wrap">⌕ <input id="docs-search" type="search" placeholder="Search documentation…"></label>',
      '<nav class="docs-nav" aria-label="Documentation sections">',
      '<button class="docs-nav-item active" data-doc="welcome">⌂ <span>Welcome</span></button>',
      '<button class="docs-nav-item" data-doc="desktop">▦ <span>Desktop basics</span></button>',
      '<button class="docs-nav-item" data-doc="windows">▣ <span>Windows & multitasking</span></button>',
      '<button class="docs-nav-item" data-doc="launcher">☷ <span>Launcher & apps</span></button>',
      '<button class="docs-nav-item" data-doc="files">▤ <span>Files & storage</span></button>',
      '<button class="docs-nav-item" data-doc="notes">✎ <span>Notes & Markdown</span></button>',
      '<button class="docs-nav-item" data-doc="creator">⌘ <span>App Creator</span></button>',
      '<button class="docs-nav-item" data-doc="developers">〈/〉 <span>Developer guide</span></button>',
      '<button class="docs-nav-item" data-doc="architecture">◇ <span>Architecture</span></button>',
      '<button class="docs-nav-item" data-doc="api">⌘ <span>API reference</span></button>',
      '<button class="docs-nav-item" data-doc="permissions">♢ <span>Permissions</span></button>',
      '<button class="docs-nav-item" data-doc="hardware">🔌 <span>Hardware APIs</span></button>',
      '<button class="docs-nav-item" data-doc="processes">▤ <span>Processes</span></button>',
      '<button class="docs-nav-item" data-doc="storageApi">💾 <span>Storage services</span></button>',
      '<button class="docs-nav-item" data-doc="network">🌐 <span>Network services</span></button>',
      '<button class="docs-nav-item" data-doc="examples">⌁ <span>Examples</span></button>',
      '<button class="docs-nav-item" data-doc="shortcuts">⌨ <span>Keyboard shortcuts</span></button>',
      '<button class="docs-nav-item" data-doc="troubleshooting">ⓘ <span>Troubleshooting</span></button>',
      '<button class="docs-nav-item" data-doc="updates">↻ <span>Updates & exports</span></button>',
      '</nav><div class="docs-sidebar-foot">OPENFIDDLES · WEBOS</div></aside>',
      '<main class="docs-main"><header class="docs-topbar"><span id="docs-breadcrumb">Documentation / Welcome</span><button id="docs-print" type="button">Print / Save PDF</button></header>',
      '<article id="docs-content" class="docs-content"></article><footer class="docs-footer"><span>WebOS Documentation</span><span id="docs-result-count">19 topics</span></footer></main>'
    ].join("");
    const win = createWindow("WebOS Documentation", shell);
    if (!win) return null;
    win.classList.add("docs-window");
    win.style.width = Math.min(window.innerWidth - 24, 1120) + "px";
    win.style.height = Math.min(window.innerHeight - 76, 780) + "px";
    const content=win.querySelector("#docs-content"), search=win.querySelector("#docs-search");
    const crumb=win.querySelector("#docs-breadcrumb"), nav=[...win.querySelectorAll(".docs-nav-item")];
    const pages = {
      welcome:["Welcome to WebOS","START HERE","Your browser-based desktop environment: launch tools, manage files, and build your own apps.",'<div class="docs-hero"><span>OPENFIDDLES / WEBOS</span><h1>A desktop that works<br>the way you do.</h1><p>Explore the workspace, launch tools, manage files, and build your own apps.</p></div><div class="docs-card-grid"><button class="docs-card" data-goto="desktop"><b>01 · Desktop basics</b><span>Workspace, shortcuts and context menu.</span></button><button class="docs-card" data-goto="files"><b>02 · Files & storage</b><span>Organize your virtual files.</span></button><button class="docs-card" data-goto="creator"><b>03 · Build an app</b><span>Get started with App Creator.</span></button></div><h2>What is WebOS?</h2><p>WebOS is a browser-based desktop environment. Windows, launcher, dock, built-in apps, and virtual file system run inside your browser.</p><div class="docs-callout"><b>Storage note</b><p>WebOS stores virtual files and preferences in this browser. Clearing site data can remove locally stored content.</p></div>'],
      desktop:["Desktop basics","THE WORKSPACE","The desktop is the open area behind your app windows.",'<h2>Desktop shortcuts</h2><p>Select a desktop shortcut to launch its app.</p><h2>Right-click menu</h2><p>Right-click an empty area of the desktop for quick actions such as opening the launcher, Files, Notes, and Settings. Inside a window, the app may provide its own context menu.</p><h2>Taskbar</h2><p>The top taskbar contains the launcher, open-window buttons, connection indicator, and clock. Select a window button to bring it forward.</p><h2>Dock</h2><p>The dock contains pinned apps. Select an icon to launch it.</p>'],
      windows:["Windows & multitasking","WORK WITH WINDOWS","Keep several tools open and arrange them around your workspace.",'<h2>Move and resize</h2><p>Drag a window by its title bar. Use the edge and corner handles to resize it.</p><h2>Window controls</h2><ul><li><b>Minimize:</b> hide the window but keep its taskbar button.</li><li><b>Maximize:</b> expand to the workspace; maximize again to restore.</li><li><b>Close:</b> close the window.</li></ul><h2>Focus</h2><p>Click inside a window or select its taskbar button to bring it to the front.</p>'],
      launcher:["Launcher & applications","FIND YOUR TOOLS","The launcher lists installed WebOS applications in one searchable place.",'<h2>Open the launcher</h2><p>Select the WebOS button in the taskbar, or press <kbd>Ctrl</kbd> + <kbd>Space</kbd> (or <kbd>⌘</kbd> + <kbd>Space</kbd>).</p><h2>Search apps</h2><p>Search by app name, description, or ID. Select a tile to launch. Press <kbd>Esc</kbd> to close.</p><h2>Built-in apps</h2><ul><li><b>Files:</b> manage folders and text files.</li><li><b>Notes:</b> write and preview Markdown.</li><li><b>FlairOS Emulator:</b> open the hosted FlairOS environment.</li><li><b>App Creator:</b> create custom app definitions.</li><li><b>System Monitor:</b> inspect desktop information.</li><li><b>App Manager:</b> review installed apps and uninstall custom apps or WASM packages.</li></ul>'],
      files:["Files & storage","YOUR VIRTUAL FILE SYSTEM","Files helps organize content stored locally by WebOS.",'<h2>Organize</h2><p>Navigate folders, search the current folder, sort items, and switch between list and grid views.</p><h2>Manage items</h2><p>Create folders and text files, rename, delete, download, and edit supported text files.</p><div class="docs-callout"><b>Supported file types</b><p>The current importer supports text formats such as TXT, Markdown, JSON, JavaScript, HTML, CSS, SVG, CSV, YAML, and XML. Binary files such as images are supported by the virtual filesystem and can be previewed or downloaded.</p></div><h2>Where files live</h2><p>Files are stored in the browser local WebOS virtual file system, not automatically uploaded to a cloud drive.</p>'],
      notes:["Notes & Markdown","WRITE & PREVIEW","Notes combines a Markdown editor with a live preview.",'<h2>Formatting</h2><p>Use toolbar buttons for headings, bold, italic, inline code, lists, and quotes. Supported syntax also includes fenced code blocks, links, images, task lists, tables, and horizontal rules.</p><h2>Save and export</h2><p>Notes autosaves and has a Save button. Export a <code>.md</code> file for a separate copy. The default note path is <code>/Documents/Notes.md</code>.</p>'],
      creator:["App Creator","MAKE SOMETHING","Define a custom app and register it in the current WebOS session.",'<h2>App identity</h2><p>Choose a unique ID, display name, icon, description, and whether to pin it to the dock. Use letters, numbers, hyphens, or underscores in the ID.</p><h2>Handler code</h2><p>The handler is JavaScript called with an API client and optional argument.</p><pre><code>function (api, argument) {\n  const win = window.createWindow("My App", "&lt;div&gt;&lt;h2&gt;Hello!&lt;/h2&gt;&lt;/div&gt;");\n  return win;\n}</code></pre><h2>Install</h2><p>The generated JavaScript is saved under <code>/Desktop/Apps/</code> and the app is registered in the current session.</p><div class="docs-callout"><b>Important</b><p>Custom handlers execute JavaScript in the WebOS page context. Only install code you understand. Saved app files are not automatically reloaded as installed apps after a browser refresh yet.</p></div>'],
      developers:["Developer guide","BUILD FOR WEBOS","Build apps with the registry, the documented app client, and capability-based permission requests.",`<h2>Quick start</h2><pre><code>function openExample(api, argument) {
  const win = window.createWindow("Example", "&lt;main&gt;&lt;h2&gt;Hello WebOS&lt;/h2&gt;&lt;/main&gt;");
  return win;
}
WebOSAppRegistry.register({
  id: "example", name: "Example", icon: "✨",
  description: "A sample app", handler: "openExample"
});
WebOSAppRegistry.render();</code></pre><h2>Handler contract</h2><p>Handlers receive <code>(api, argument)</code>. The first argument is a WebOSAppClient instance. Register a globally named handler before registering the app.</p><h2>Runtime security</h2><p>Registered app handlers currently execute in the WebOS page JavaScript context. URL-based windows can load iframe content, but that does not mean every registered app is iframe-isolated. Permission checks are cooperative API gates, not a secure sandbox. Do not run untrusted app code.</p><h2>Source map</h2><ul><li><code>public/js/os/desktop/app-registry.js</code> — app registration and API client.</li><li><code>public/js/os/desktop/Permissions.js</code> — permission prompt and decisions.</li><li><code>public/js/os/desktop/filesystem.js</code> — virtual filesystem.</li><li><code>public/js/os/window/WindowManager.js</code> — window creation.</li><li><code>public/js/os/desktop/Notifications.js</code> — notifications.</li></ul>`],
      architecture:["Platform architecture","THE THREE LAYERS","WebOS runs inside a host browser. The host browser remains the authority for operating-system and device permissions.",`<h2>Capability flow</h2><pre><code>WebOS app
  → WebOS API
  → WebOS permission prompt
  → host browser API
  → browser-native permission (when required)
  → available device capability</code></pre><h2>WebOS layer</h2><p>Owns app registration, windows, virtual files, notifications and app-level permission prompts.</p><h2>Host browser layer</h2><p>Enforces origin security, secure-context rules, iframe policies, user-gesture requirements and native permission prompts.</p><h2>Operating system layer</h2><p>Hardware and operating-system features are exposed only through APIs the browser supports. WebOS cannot override browser security, access arbitrary host files, or silently install software.</p>`],
      api:["API reference","WEBOS APP CLIENT","The app handler receives a WebOSAppClient instance as its first argument. Methods return Promises unless otherwise noted.",`<h2>Core methods</h2><pre><code>await api.permissions.request(name, reason)
api.permissions.query(name)
api.permissions.revoke(name)
api.permissions.list()
// Legacy convenience aliases:
await api.requestPermission(name, reason)
api.getPermissionState(name)
await api.read(path)              // filesystem.read
await api.putText(path, content)  // filesystem.write
await api.notify(title, message, options)</code></pre><h2>App registry export</h2><pre><code>const manifest = WebOSAppRegistry.exportManifest();
WebOSAppRegistry.downloadManifest();</code></pre><p>Registry exports contain app metadata only. They do not serialize executable handler functions; use App Creator or WASM Lab for complete app packages.</p><h2>Filesystem namespace</h2><pre><code>await api.filesystem.list("/Documents")
await api.filesystem.read("/Documents/readme.txt")
await api.filesystem.writeText("/Documents/readme.txt", "Hello")
await api.filesystem.makeDirectory("/Documents/Demo")
await api.filesystem.remove("/Documents/old.txt")
await api.filesystem.exists("/Documents/readme.txt")
await api.filesystem.copy("/Documents/a.txt", "/Documents/b.txt")
await api.filesystem.move("/Documents/a.txt", "/Documents/b.txt")</code></pre><p>These paths address the WebOS virtual filesystem, not the host computer&#39;s files. Read, write and delete operations request separate permissions.</p><h2>Build UI with HTML elements</h2><pre><code>const heading = api.ui.createElement("h2", {
  className: "welcome-title",
  text: "Hello WebOS"
});
const button = api.ui.createElement("button", {
  text: "Click me",
  attributes: { type: "button", "aria-label": "Say hello" }
});
button.addEventListener("click", () => {
  heading.textContent = "It works!";
});
const root = api.ui.createElement("section", {
  className: "my-app"
}, [heading, button]);
api.windows.create("My HTML App", root);</code></pre><p>The helper uses DOM creation and textContent instead of injecting HTML strings. It supports a limited safe attribute allowlist. Build richer interfaces with standard HTML, CSS classes and event listeners.</p><h2>Window namespace</h2><pre><code>const root = api.ui.createElement("main", {}, [
  api.ui.createElement("p", { text: "A WebOS window" })
]);
api.windows.create("Example", root);</code></pre><p>Window content must be a DOM Node. Raw HTML strings are intentionally not accepted by this helper.</p><h2>System information</h2><pre><code>const info = api.system.getInfo();
console.log(info.name, info.runtime, info.secureContext);</code></pre><p>Returns basic runtime information and the host browser user-agent string. It does not expose private device identifiers.</p><h2>Geolocation</h2><pre><code>const position = await api.geolocation.getCurrentPosition({
  enableHighAccuracy: false, timeout: 10000
});
console.log(position.coords.latitude, position.coords.longitude);</code></pre><p>Requests WebOS approval first, then calls the host browser API. The browser may show its own native prompt. A secure context and browser support are required.</p><h2>Clipboard</h2><pre><code>const text = await api.clipboard.readText();
await api.clipboard.writeText("Copied from WebOS");</code></pre><p>Clipboard access is browser-dependent and may require a secure context, native permission and a user gesture.</p><h2>Permission identifiers</h2><ul><li><code>filesystem.read</code></li><li><code>filesystem.write</code></li><li><code>filesystem.delete</code></li><li><code>notifications</code></li><li><code>geolocation</code></li><li><code>clipboard.read</code></li><li><code>clipboard.write</code></li></ul>`],
      permissions:["Permissions & security","ASK BEFORE ACCESS","Apps should request only the capabilities they need and explain why.",`<h2>Request access</h2><pre><code>await api.requestPermission(
  "geolocation",
  "Show nearby places on the map."
);</code></pre><h2>Permission states</h2><pre><code>api.getPermissionState("geolocation");
// "granted", "denied", or "prompt"</code></pre><h2>Two permission layers</h2><p>WebOS identifies the requesting app and asks the user. If approved, the app API calls the browser capability. The browser can still show its own native prompt and can deny access.</p><h2>Current limitations</h2><ul><li>Decisions are session-scoped and reset on a full reload.</li><li>These prompts gate documented API methods; they do not isolate JavaScript.</li><li>Apps currently run in the same page realm and can bypass cooperative checks by using global browser APIs directly.</li><li>The host browser remains responsible for device security.</li></ul><h2>Best practices</h2><p>Ask at the moment a feature is used, explain the reason, handle denial gracefully, and never assume a capability is available.</p>`],
      hardware:["Hardware APIs","HOST DEVICE ACCESS","Hardware access is capability-based and always mediated by the browser.",'<h2>Supported integrations</h2><ul><li><b>WebGPU:</b> adapter information, rendering and compute.</li><li><b>WebUSB:</b> user-selected USB peripherals.</li><li><b>Web Serial:</b> user-selected serial ports.</li><li><b>WebHID:</b> user-selected supported HID devices.</li><li><b>Web Bluetooth:</b> user-selected Bluetooth peripherals.</li><li><b>WebCodecs:</b> encoder and decoder configuration support.</li><li><b>WebXR:</b> immersive sessions when supported.</li></ul><h2>Rules</h2><p>Use HTTPS or another secure context. Device chooser calls must be initiated by a user action and the browser may show its own permission prompt. Device access can be unavailable because of browser, operating-system, policy, or hardware restrictions. WebOS cannot bypass those controls.</p>'],
      processes:["Process manager","RUNNING APPS & WINDOWS","WebOS tracks active windows and app tasks that register with the runtime.",'<h2>What is tracked</h2><p>Task Manager shows WebOS windows, registered background tasks, start times, and their current lifecycle state. It does not have access to operating-system process tables or reliable per-app CPU and RAM usage.</p><h2>Lifecycle</h2><p>Apps can register tasks with the process API, update their state, and end them when work finishes. Closing a WebOS window removes its tracked window task.</p>'],
      storageApi:["Storage services","LOCAL DATA & QUOTAS","WebOS combines its IndexedDB virtual filesystem with optional browser storage APIs.",'<h2>Virtual filesystem</h2><p>Files in the WebOS Explorer are stored in IndexedDB. Use the filesystem API for user documents and app data.</p><h2>Origin Private File System</h2><p>OPFS is a separate origin-scoped storage area for app-managed binary data. It is not the same as the visible WebOS file tree.</p><h2>Quota and persistence</h2><p>The browser may report an approximate storage quota and can grant persistent storage on request. The browser and user remain in control of eviction and site-data clearing.</p>'],
      network:["Network services","CONNECTIVITY STATUS","WebOS reports only network details exposed by the browser.",'<h2>Available information</h2><p>Online/offline events are broadly available. Some browsers expose connection type, estimated downlink, round-trip time, and data-saving hints through the Network Information API.</p><h2>Privacy limits</h2><p>Ordinary web pages cannot read Wi-Fi names, passwords, or signal strength. Network hints are optional, approximate, and not supported in every browser.</p>'],
      examples:["Developer examples","COPY, ADAPT, BUILD","Patterns for common WebOS app tasks.",`<h2>Read a file</h2><pre><code>async function readWelcome(api) {
  const file = await api.filesystem.read("/Documents/Welcome.txt");
  if (!file) throw new Error("File not found");
  return file.content;
}</code></pre><h2>Save a file</h2><pre><code>async function saveText(api, text) {
  await api.filesystem.writeText("/Documents/MyNote.txt", text);
}</code></pre><h2>Notify the user</h2><pre><code>await api.notify("Export complete", "Your file is ready.");</code></pre><h2>Handle denied access</h2><pre><code>async function locate(api) {
  try { return await api.geolocation.getCurrentPosition(); }
  catch (error) {
    console.warn("Location unavailable:", error.message);
    return null;
  }
}</code></pre><h2>Register an app</h2><pre><code>function openDemo(api, argument) {
  const root = document.createElement("section");
  root.textContent = "Hello " + (argument || "WebOS");
  return window.createWindow("Demo App", root);
}
WebOSAppRegistry.register({
  id: "demo-app", name: "Demo App", icon: "🧪",
  description: "API example", handler: "openDemo"
});</code></pre>`],
      shortcuts:["Keyboard shortcuts","WORK FASTER","A few shortcuts make the desktop easier to navigate.",'<div class="docs-shortcut-list"><div><span>Open / close launcher</span><kbd>Ctrl</kbd> + <kbd>Space</kbd></div><div><span>Close launcher</span><kbd>Esc</kbd></div><div><span>Save in Notes</span><kbd>Ctrl</kbd> + <kbd>S</kbd></div><div><span>Indent in Notes</span><kbd>Tab</kbd></div></div><p>Command-key equivalents are also supported on macOS-style keyboards.</p>'],
      troubleshooting:["Troubleshooting","WHEN THINGS GO WRONG","Checks for common WebOS issues.",'<h2>An app does not appear</h2><p>Close and reopen the launcher. Check that the app registered and its ID is unique.</p><h2>A window is missing</h2><p>Look for its taskbar button and select it to bring the window forward.</p><h2>Files did not import</h2><p>Check that the extension is a supported text format. Binary formats are not supported by the current importer.</p><h2>Changes are not visible</h2><p>Wait for hosting deployment to finish, then reload. A hard refresh may clear stale cached assets.</p>'],
      updates:["Updates & exports","KEEP YOUR WORK PORTABLE","WebOS refreshes its cached shell when a new service-worker build activates.",`<h2>Update notifications</h2><p>When a newer WebOS build activates over an existing installation, Notification Center announces the update. Use the notification action to reload into the new version.</p><h2>Export app registry metadata</h2><pre><code>const manifest = WebOSAppRegistry.exportManifest();
WebOSAppRegistry.downloadManifest();
WebOSAppRegistry.validateManifest(manifest);
// WASM package operations:
await WebOSWASM.exportPackage("my-wasm-app");
await WebOSWASM.uninstallApp("my-wasm-app");</code></pre><p>The registry export contains app metadata, not executable JavaScript or private data. Export a complete app package from App Creator or WASM Lab.</p><h2>Full system backup</h2><p>Settings → Backup & Recovery exports the virtual filesystem and supported WebOS preferences. It does not include browser credentials, device files, or the host operating system.</p><h2>Notification API</h2><pre><code>WebOSNotifications.notify("Updated", "WebOS is ready.", {
  icon: "↻", level: "success",
  actionLabel: "Reload", onAction: () => location.reload()
});</code></pre`],
    };
    function show(id) {
      const page=pages[id]; if(!page)return;
      content.innerHTML='<div class="docs-eyebrow">'+page[1]+'</div><h1>'+page[0]+'</h1><p class="docs-intro">'+page[2]+'</p>'+page[3];
      crumb.textContent="Documentation / "+page[0];
      nav.forEach(button=>button.classList.toggle("active",button.dataset.doc===id));
      win.querySelectorAll("[data-goto]").forEach(button=>button.addEventListener("click",()=>show(button.dataset.goto)));
    }
    nav.forEach(button=>button.addEventListener("click",()=>show(button.dataset.doc)));
    search.addEventListener("input",()=>{
      const q=search.value.trim().toLowerCase();let count=0;
      nav.forEach(button=>{const page=pages[button.dataset.doc];const text=page.join(" ").replace(/<[^>]*>/g," ").toLowerCase();const match=!q||text.includes(q);button.hidden=!match;if(match)count++;});
      win.querySelector("#docs-result-count").textContent=count+" matching topics";
    });
    win.querySelector("#docs-print").addEventListener("click",()=>{
      const w=window.open("","_blank");if(!w)return;
      w.document.write("<!doctype html><html><head><title>WebOS Documentation</title><style>body{font:15px/1.6 system-ui;max-width:850px;margin:40px auto;padding:0 20px;color:#182235}pre{background:#eef2f8;padding:14px;white-space:pre-wrap}code{font-family:monospace}</style></head><body>"+content.innerHTML+"</body></html>");
      w.document.close();w.focus();w.print();
    });
    show("welcome");
    return win;
}
