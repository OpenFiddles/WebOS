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
      '<button class="docs-nav-item" data-doc="shortcuts">⌨ <span>Keyboard shortcuts</span></button>',
      '<button class="docs-nav-item" data-doc="troubleshooting">ⓘ <span>Troubleshooting</span></button>',
      '</nav><div class="docs-sidebar-foot">OPENFIDDLES · WEBOS</div></aside>',
      '<main class="docs-main"><header class="docs-topbar"><span id="docs-breadcrumb">Documentation / Welcome</span><button id="docs-print" type="button">Print / Save PDF</button></header>',
      '<article id="docs-content" class="docs-content"></article><footer class="docs-footer"><span>WebOS Documentation</span><span id="docs-result-count">10 topics</span></footer></main>'
    ].join("");
    const win = createWindow("WebOS Documentation", shell);
    if (!win) return null;
    win.style.width = Math.min(window.innerWidth - 24, 1120) + "px";
    win.style.height = Math.min(window.innerHeight - 76, 780) + "px";
    const content=win.querySelector("#docs-content"), search=win.querySelector("#docs-search");
    const crumb=win.querySelector("#docs-breadcrumb"), nav=[...win.querySelectorAll(".docs-nav-item")];
    const pages = {
      welcome:["Welcome to WebOS","START HERE","Your browser-based desktop environment: launch tools, manage files, and build your own apps.",'<div class="docs-hero"><span>OPENFIDDLES / WEBOS</span><h1>A desktop that works<br>the way you do.</h1><p>Explore the workspace, launch tools, manage files, and build your own apps.</p></div><div class="docs-card-grid"><button class="docs-card" data-goto="desktop"><b>01 · Desktop basics</b><span>Workspace, shortcuts and context menu.</span></button><button class="docs-card" data-goto="files"><b>02 · Files & storage</b><span>Organize your virtual files.</span></button><button class="docs-card" data-goto="creator"><b>03 · Build an app</b><span>Get started with App Creator.</span></button></div><h2>What is WebOS?</h2><p>WebOS is a browser-based desktop environment. Windows, launcher, dock, built-in apps, and virtual file system run inside your browser.</p><div class="docs-callout"><b>Storage note</b><p>WebOS stores virtual files and preferences in this browser. Clearing site data can remove locally stored content.</p></div>'],
      desktop:["Desktop basics","THE WORKSPACE","The desktop is the open area behind your app windows.",'<h2>Desktop shortcuts</h2><p>Select a desktop shortcut to launch its app.</p><h2>Right-click menu</h2><p>Right-click an empty area of the desktop for quick actions such as opening the launcher, Files, Notes, and Settings. Inside a window, the app may provide its own context menu.</p><h2>Taskbar</h2><p>The top taskbar contains the launcher, open-window buttons, connection indicator, and clock. Select a window button to bring it forward.</p><h2>Dock</h2><p>The dock contains pinned apps. Select an icon to launch it.</p>'],
      windows:["Windows & multitasking","WORK WITH WINDOWS","Keep several tools open and arrange them around your workspace.",'<h2>Move and resize</h2><p>Drag a window by its title bar. Use the edge and corner handles to resize it.</p><h2>Window controls</h2><ul><li><b>Minimize:</b> hide the window but keep its taskbar button.</li><li><b>Maximize:</b> expand to the workspace; maximize again to restore.</li><li><b>Close:</b> close the window.</li></ul><h2>Focus</h2><p>Click inside a window or select its taskbar button to bring it to the front.</p>'],
      launcher:["Launcher & applications","FIND YOUR TOOLS","The launcher lists installed WebOS applications in one searchable place.",'<h2>Open the launcher</h2><p>Select the WebOS button in the taskbar, or press <kbd>Ctrl</kbd> + <kbd>Space</kbd> (or <kbd>⌘</kbd> + <kbd>Space</kbd>).</p><h2>Search apps</h2><p>Search by app name, description, or ID. Select a tile to launch. Press <kbd>Esc</kbd> to close.</p><h2>Built-in apps</h2><ul><li><b>Files:</b> manage folders and text files.</li><li><b>Notes:</b> write and preview Markdown.</li><li><b>Browser:</b> browse supported web pages.</li><li><b>FlairOS Emulator:</b> open the hosted FlairOS environment.</li><li><b>App Creator:</b> create custom app definitions.</li><li><b>System Monitor:</b> inspect desktop information.</li></ul>'],
      files:["Files & storage","YOUR VIRTUAL FILE SYSTEM","Files helps organize content stored locally by WebOS.",'<h2>Organize</h2><p>Navigate folders, search the current folder, sort items, and switch between list and grid views.</p><h2>Manage items</h2><p>Create folders and text files, rename, delete, download, and edit supported text files.</p><div class="docs-callout"><b>Text formats only</b><p>The current importer supports text formats such as TXT, Markdown, JSON, JavaScript, HTML, CSS, SVG, CSV, YAML, and XML. General binary-file storage is not currently supported.</p></div><h2>Where files live</h2><p>Files are stored in the browser local WebOS virtual file system, not automatically uploaded to a cloud drive.</p>'],
      notes:["Notes & Markdown","WRITE & PREVIEW","Notes combines a Markdown editor with a live preview.",'<h2>Formatting</h2><p>Use toolbar buttons for headings, bold, italic, inline code, lists, and quotes. Supported syntax also includes fenced code blocks, links, images, task lists, tables, and horizontal rules.</p><h2>Save and export</h2><p>Notes autosaves and has a Save button. Export a <code>.md</code> file for a separate copy. The default note path is <code>/Documents/Notes.md</code>.</p>'],
      creator:["App Creator","MAKE SOMETHING","Define a custom app and register it in the current WebOS session.",'<h2>App identity</h2><p>Choose a unique ID, display name, icon, description, and whether to pin it to the dock. Use letters, numbers, hyphens, or underscores in the ID.</p><h2>Handler code</h2><p>The handler is JavaScript called with an API client and optional argument.</p><pre><code>function (api, argument) {\n  const win = window.createWindow("My App", "&lt;div&gt;&lt;h2&gt;Hello!&lt;/h2&gt;&lt;/div&gt;");\n  return win;\n}</code></pre><h2>Install</h2><p>The generated JavaScript is saved under <code>/Desktop/Apps/</code> and the app is registered in the current session.</p><div class="docs-callout"><b>Important</b><p>Custom handlers execute JavaScript in the WebOS page context. Only install code you understand. Saved app files are not automatically reloaded as installed apps after a browser refresh yet.</p></div>'],
      developers:["Developer guide","EXTEND WEBOS","A quick overview of the registry and APIs used by built-in apps.",'<h2>Register an app</h2><pre><code>WebOSAppRegistry.register({\n  id: "example", name: "Example App",\n  icon: "✨", description: "Sample application",\n  handler: "openExample", dock: false\n});\nWebOSAppRegistry.render();</code></pre><h2>Launch handlers</h2><p>The handler is a globally named function. It receives <code>(api, argument)</code> and can return a window created with <code>createWindow(title, content)</code>.</p><h2>Filesystem API</h2><pre><code>const text = await api.read("/Documents/example.txt");\nawait api.putText("/Documents/example.txt", "Hello");</code></pre><h2>Core source files</h2><ul><li><code>public/js/os/desktop/app-registry.js</code> — app registration and launch.</li><li><code>public/js/os/window/WindowManager.js</code> — windows and built-in app registry.</li><li><code>public/js/os/window/SystemApps.js</code> — built-in apps.</li><li><code>public/js/os/desktop/filesystem.js</code> — virtual file system.</li></ul>'],
      shortcuts:["Keyboard shortcuts","WORK FASTER","A few shortcuts make the desktop easier to navigate.",'<div class="docs-shortcut-list"><div><span>Open / close launcher</span><kbd>Ctrl</kbd> + <kbd>Space</kbd></div><div><span>Close launcher</span><kbd>Esc</kbd></div><div><span>Save in Notes</span><kbd>Ctrl</kbd> + <kbd>S</kbd></div><div><span>Indent in Notes</span><kbd>Tab</kbd></div></div><p>Command-key equivalents are also supported on macOS-style keyboards.</p>'],
      troubleshooting:["Troubleshooting","WHEN THINGS GO WRONG","Checks for common WebOS issues.",'<h2>An app does not appear</h2><p>Close and reopen the launcher. Check that the app registered and its ID is unique.</p><h2>A window is missing</h2><p>Look for its taskbar button and select it to bring the window forward.</p><h2>A website will not load</h2><p>Some sites block iframe embedding or require browser features a proxy cannot provide. Try opening the site in a separate tab.</p><h2>Files did not import</h2><p>Check that the extension is a supported text format. Binary formats are not supported by the current importer.</p><h2>Changes are not visible</h2><p>Wait for hosting deployment to finish, then reload. A hard refresh may clear stale cached assets.</p>']
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
