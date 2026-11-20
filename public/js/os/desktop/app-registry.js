/**
 * app-registry.js (API Subsystem Integrated Lifecycle)
 * Core Application Registry and Execution Lifecycle for WebOS.
 */
(() => {
    // =======================================================================
    // EMBEDDED WEBOS APP CLIENT PROXY
    // Resolves Uncaught ReferenceErrors and bridges app contexts to the FS
    // =======================================================================
    if (typeof window.WebOSAppClient === "undefined") {
        class WebOSAppClient {
            constructor(appId) {
                this.appId = appId;
                this.permissions = Object.freeze({
                    request: (permission, reason) => this.require(permission, reason),
                    query: permission => window.WebOSPermissions?.query(this.appId, permission) || "unavailable",
                    revoke: permission => window.WebOSPermissions?.revoke(this.appId, permission) || false,
                    list: () => window.WebOSPermissions?.list(this.appId) || []
                });
                this.filesystem = Object.freeze({
                    list: async path => { await this.require("filesystem.read"); return this.fs().list(path); },
                    read: async path => { await this.require("filesystem.read"); return this.fs().read(path); },
                    writeText: async (path, content) => { await this.require("filesystem.write"); return this.fs().putText(path, content); },
                    makeDirectory: async path => { await this.require("filesystem.write"); return this.fs().makeDirectory(path); },
                    remove: async path => { await this.require("filesystem.delete"); return this.fs().remove(path); },
                    exists: async path => { await this.require("filesystem.read"); return this.fs().exists(path); },
                    copy: async (from, to) => { await this.require("filesystem.write"); return this.fs().copy(from, to); },
                    move: async (from, to) => { await this.require("filesystem.write"); return this.fs().move(from, to); }
                });
                this.geolocation = Object.freeze({
                    getCurrentPosition: async options => {
                        await this.require("geolocation", "This app wants to access your device location.");
                        if (!navigator.geolocation) throw new Error("Geolocation is unavailable in this browser.");
                        return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
                    }
                });
                this.clipboard = Object.freeze({
                    readText: async () => {
                        await this.require("clipboard.read", "This app wants to read text from your clipboard.");
                        if (!navigator.clipboard?.readText) throw new Error("Clipboard reading is unavailable in this browser.");
                        return navigator.clipboard.readText();
                    },
                    writeText: async value => {
                        await this.require("clipboard.write", "This app wants to write text to your clipboard.");
                        if (!navigator.clipboard?.writeText) throw new Error("Clipboard writing is unavailable in this browser.");
                        return navigator.clipboard.writeText(String(value));
                    }
                });
                this.ui = Object.freeze({
                    createElement: (tag, options = {}, children = []) => {
                        const name = String(tag).toLowerCase();
                        if (!/^[a-z][a-z0-9-]*$/.test(name) || ["script","iframe","object","embed","base","meta","link"].includes(name))
                            throw new Error("Unsupported UI element: " + name);
                        const element = document.createElement(name);
                        if (options.className) element.className = String(options.className);
                        if (options.text !== undefined) element.textContent = String(options.text);
                        if (options.title) element.title = String(options.title);
                        if (options.id) element.id = String(options.id);
                        if (options.attributes && typeof options.attributes === "object") {
                            Object.entries(options.attributes).forEach(([key,value]) => {
                                if (/^(aria-[\w-]+|data-[\w-]+|role|type|name|placeholder|value|alt|href|target|rel|disabled|checked)$/.test(key)) {
                                    if (value === true) element.setAttribute(key, "");
                                    else if (value !== false && value != null) element.setAttribute(key, String(value));
                                }
                            });
                        }
                        const nodes = Array.isArray(children) ? children : [children];
                        nodes.forEach(child => {
                            if (child == null) return;
                            element.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
                        });
                        return element;
                    }
                });
                this.windows = Object.freeze({
                    create: (title, content) => {
                        if (!(content instanceof HTMLElement)) throw new TypeError("Window content must be an HTML element. Use api.ui.createElement() to build it safely.");
                        if (typeof window.createWindow !== "function") throw new Error("WebOS window manager is unavailable.");
                        return window.createWindow(String(title), content);
                    }
                });
                this.system = Object.freeze({
                    getInfo: () => window.WebOS?.system?.getInfo?.() || Object.freeze({
                        name: "WebOS", runtime: "browser", browser: navigator.userAgent,
                        secureContext: window.isSecureContext === true, language: navigator.language || "en"
                    }),
                    capabilities: () => window.WebOS?.capabilities?.() || []
                });
                this.hardware = Object.freeze({
                    capabilities: () => window.WebOS?.hardware?.capabilities?.() || [],
                    requestUSB: async filters => { await this.require("hardware.usb"); if(!window.WebOS?.hardware) throw new Error("Hardware service unavailable."); return window.WebOS.hardware.requestUSB(filters); },
                    requestSerial: async options => { await this.require("hardware.serial"); if(!window.WebOS?.hardware) throw new Error("Hardware service unavailable."); return window.WebOS.hardware.requestSerial(options); },
                    requestHID: async filters => { await this.require("hardware.hid"); if(!window.WebOS?.hardware) throw new Error("Hardware service unavailable."); return window.WebOS.hardware.requestHID(filters); },
                    requestBluetooth: async options => { await this.require("hardware.bluetooth"); if(!window.WebOS?.hardware) throw new Error("Hardware service unavailable."); return window.WebOS.hardware.requestBluetooth(options); },
                    requestGPU: async () => { await this.require("hardware.gpu"); if(!window.WebOS?.hardware) throw new Error("Hardware service unavailable."); return window.WebOS.hardware.requestGPU(); },
                    gpuInfo: () => window.WebOS.hardware.gpuInfo(),
                    codecSupport: async (kind, config) => { await this.require("media.codecs"); return window.WebOS.hardware.codecSupport(kind, config); },
                    requestXR: async (mode, options) => { await this.require("hardware.xr"); return window.WebOS.hardware.requestXR(mode, options); }
                });
                this.storage = Object.freeze({
                    app: Object.freeze({
                        get: async key => { await this.require("storage.app"); return window.WebOSAppStorage.get(this.appId,key); },
                        set: async (key,value) => { await this.require("storage.app"); return window.WebOSAppStorage.set(this.appId,key,value); },
                        delete: async key => { await this.require("storage.app"); return window.WebOSAppStorage.delete(this.appId,key); },
                        keys: async () => { await this.require("storage.app"); return window.WebOSAppStorage.keys(this.appId); },
                        clear: async () => { await this.require("storage.app"); return window.WebOSAppStorage.clear(this.appId); },
                        estimate: async () => { await this.require("storage.app"); return window.WebOSAppStorage.estimate(this.appId); }
                    }),
                    estimate: () => window.WebOS?.storage?.estimate?.() || Promise.resolve(null),
                    persist: async () => { await this.require("storage.persist"); return window.WebOS?.storage?.persist?.() || false; },
                    openPrivateRoot: async () => { await this.require("storage.opfs"); return window.WebOS.storage.openPrivateRoot(); }
                });
                this.processes = Object.freeze({
                    register: info => window.WebOS?.processes?.register?.({...info, detail: "App: " + this.appId}),
                    list: () => window.WebOS?.processes?.list?.() || [],
                    subscribe: fn => window.WebOS?.processes?.subscribe?.(fn) || (()=>{})
                });
                this.network = Object.freeze({
                    isOnline: () => navigator.onLine,
                    onChange: fn => {
                        if(typeof fn!=="function") throw new TypeError("Network listener must be a function.");
                        const online=()=>fn({online:true}),offline=()=>fn({online:false});
                        window.addEventListener("online",online);window.addEventListener("offline",offline);
                        return ()=>{window.removeEventListener("online",online);window.removeEventListener("offline",offline);};
                    }
                });
            }
            fs() {
                if (!window.WebOSFileSystem) throw new Error("WebOS filesystem is unavailable.");
                return window.WebOSFileSystem;
            }
            async require(permission, reason) {
                if (!window.WebOSPermissions?.request) throw new Error("WebOS permission service is unavailable.");
                return window.WebOSPermissions.request(this.appId, permission, reason);
            }
            requestPermission(permission, reason) { return this.require(permission, reason); }
            getPermissionState(permission) { return window.WebOSPermissions?.query(this.appId, permission) || "unavailable"; }
            async read(path) { await this.require("filesystem.read"); return this.fs().read(path); }
            async putText(path, content) { await this.require("filesystem.write"); return this.fs().putText(path, content); }
            async notify(title, message, options = {}) {
                await this.require("notifications");
                if (!window.WebOSNotifications?.notify) throw new Error("WebOS notifications are unavailable.");
                return window.WebOSNotifications.notify(String(title), String(message), options);
            }
            getCurrentPosition(options) { return this.geolocation.getCurrentPosition(options); }
        }
        
        // Expose it globally to the active frame engine environment
        window.WebOSAppClient = WebOSAppClient;
    }

    const definitions = new Map();
    const builtInApps = [
        ["files","File Explorer","Browse, manage, and back up files","📁","openFiles",true],
        ["notes","Notes Studio","Write, organize, and print notes","📝","openNotes",false],
        ["camera","Camera","Capture photos using your device camera","📷","openCamera",false],
        ["recorder","Audio Recorder","Record and save audio clips","🎙️","openAudioRecorder",false],
        ["video","Video Player","Play videos and compress large files","🎬","openVideoPlayer",false],
        ["print","Print Center","Preview and print text documents","🖨️","openPrint",false],
        ["settings","Settings","Personalize and configure WebOS","⚙️","openSettings",true],
        ["about","About WebOS","System information and credits","ℹ️","openAbout",false],
        ["calculator","Calculator","Everyday calculations","🧮","openCalculator",false],
        ["calendar","Calendar","Dates, events, and reminders","📅","openCalendar",true],
        ["monitor","System Monitor","Inspect system and runtime status","📊","openSystemMonitor",false],
        ["wasm","WASM Lab","Build and run WebAssembly projects","🧩","openWasmLab",false],
        ["appcreator","App Creator","Create JavaScript and WASM applications","🛠️","openAppCreator",true],
        ["paint","Paint","Draw and export PNG images","🎨","openPaint",true],
        ["appmanager","App Manager","Review and uninstall installed apps","🗂️","openAppManager",false],
        ["hardware","Hardware Manager","Inspect and connect browser-supported devices","🔌","openHardwareManager",false],
        ["taskmanager","Task Manager","View running WebOS windows and tasks","📋","openTaskManager",false],
        ["storage","Storage Manager","Inspect browser storage and persistence","💾","openStorageManager",false],
        ["network","Network Manager","Inspect connectivity and browser network hints","🌐","openNetworkManager",false]
    ];
    const systemAppIds = new Set([...builtInApps.map(app => app[0]), "alpine", "docs", "animations"]);
    function isBuiltin(id) { return systemAppIds.has(String(id)); }

    function registerBuiltIns() {
        builtInApps.forEach(([id,name,description,icon,handler,dock]) => {
            if (!definitions.has(id)) register({id,name,description,icon,handler,dock});
        });
        render();
    }
    if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", registerBuiltIns, {once:true});
    else registerBuiltIns();

    function register(definition) {
        if (!definition || typeof definition !== "object" || typeof definition.id !== "string" || !definition.id.trim()) {
            throw new TypeError("App registration requires a non-empty id.");
        }
        definitions.set(definition.id, Object.freeze({ ...definition }));
    }

    function all() {
        return [...definitions.values()].map(app => ({...app, builtin:isBuiltin(app.id)}));
    }
    function unregister(id) {
        const appId=String(id);
        if(isBuiltin(appId)) return false;
        const definition=definitions.get(appId);
        if(!definition) return false;
        document.querySelectorAll("#window-workspace .window-shell[data-webos-app-id]").forEach(win=>{
            if(win.dataset.webosAppId===appId) win.querySelector(".win-btn.close")?.click();
        });
        definitions.delete(appId);
        if(typeof definition.handler==="string" && definition.handler.startsWith("WebOS_AppHandler_")) delete window[definition.handler];
        render();
        return true;
    }

    /**
     * Processes execution invocation context hooks to open a standard window framework instance.
     * MODIFIED: Natively wraps and passes a custom API wrapper to the launching app.
     */
    function launch(id, argument) {
        const appId = String(id);
        const definition = definitions.get(appId);
        if (definition) {
            const existing = [...document.querySelectorAll("#window-workspace .window-shell")].find(win => win.dataset.webosAppId === appId && !win.classList.contains("is-closing"));
            if (existing) {
                existing.classList.remove("is-minimized");
                if (typeof focusWindow === "function") focusWindow(existing);
                return existing;
            }
        }
        const windowsBefore = new Set(document.querySelectorAll("#window-workspace .window-shell"));
        const tagWindow = result => {
            let win = result instanceof HTMLElement && result.matches(".window-shell") ? result : null;
            if (!win) win = [...document.querySelectorAll("#window-workspace .window-shell")].find(item => !windowsBefore.has(item)) || null;
            if (win && definition) win.dataset.webosAppId = appId;
            return win || result;
        };
        if (!definition) {
            console.warn("[WebOS App Registry] Unknown app:", id);
            return window.createWindow?.("WebOS", "Unknown app: " + id) || null;
        }
        let handler = definition.handler;
        if (typeof handler === "string") handler = window[handler];
        if (typeof handler !== "function") {
            console.error("[WebOS App Registry] Missing handler for", definition.id, handler);
            return window.createWindow?.("App unavailable", "The handler for " + definition.name + " is not loaded. Refresh WebOS and try again.") || null;
        }
        try {
            const appAPIInstance = new window.WebOSAppClient(definition.id);
            const result = handler(appAPIInstance, argument);
            if (result && typeof result.then === "function") {
                return result.then(tagWindow).catch(error => {
                    console.error("[WebOS App Registry] Async launch failed:", definition.id, error);
                    window.createWindow?.(definition.name + " — Error", "The app could not start: " + (error?.message || String(error)));
                    return null;
                });
            }
            return tagWindow(result);
        } catch (error) {
            console.error("[WebOS App Registry] Launch failed:", definition.id, error);
            return window.createWindow?.(definition.name + " — Error", "The app could not start: " + (error?.message || String(error))) || null;
        }
    }

    function exportManifest() {
        return {format:"webos-app-registry-manifest",version:1,generatedAt:new Date().toISOString(),apps:all().map(app=>({id:app.id,name:app.name||app.id,description:app.description||"",icon:app.icon||"▣",dock:!!app.dock,version:String(app.version||"1.0.0"),runtimeType:app.runtimeType||"js",entry:app.entry||"",permissions:Array.isArray(app.permissions)?app.permissions:[]}))};
    }
    function downloadManifest() {
        const data=exportManifest(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"})),anchor=document.createElement("a");
        anchor.href=url;anchor.download="webos-app-registry.json";anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1200);return data;
    }
    function validateManifest(data) {
        if(!data||data.format!=="webos-app-registry-manifest"||data.version!==1||!Array.isArray(data.apps))throw new TypeError("Unsupported WebOS app registry manifest.");
        if(data.apps.length>500)throw new RangeError("Manifest contains too many app records.");const ids=new Set();
        return data.apps.map(app=>{const id=String(app?.id||"").trim();if(!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(id)||ids.has(id))throw new TypeError("Invalid or duplicate app ID: "+id);ids.add(id);return{id,name:String(app.name||id).slice(0,80),description:String(app.description||"").slice(0,500),icon:String(app.icon||"▣").slice(0,8),dock:!!app.dock,version:String(app.version||"1.0.0"),runtimeType:String(app.runtimeType||"js"),entry:String(app.entry||""),permissions:Array.isArray(app.permissions)?app.permissions.map(x=>String(x).slice(0,80)).slice(0,32):[]};});
    }

    function render() {
        const grid = document.querySelector(".LauncherGrid") || document.getElementById("launcher-grid");
        const dock = document.getElementById("dock");
        if (grid) grid.replaceChildren();
        if (dock) dock.replaceChildren();
        if (!grid && !dock) return;

        all().forEach(definition => {
            if (grid) {
                const launcherButton = document.createElement("button");
                launcherButton.className = "AppIcon";
                launcherButton.type = "button";
                launcherButton.dataset.app = definition.id;
                launcherButton.dataset.search = [definition.name, definition.description, definition.id].join(" ").toLowerCase();
                launcherButton.setAttribute("aria-label", definition.name + ": " + (definition.description || "Open application"));
                const iconNode = document.createElement("strong");
                iconNode.textContent = definition.icon || "▣";
                const nameNode = document.createElement("span");
                nameNode.textContent = definition.name || definition.id;
                const descriptionNode = document.createElement("small");
                descriptionNode.textContent = definition.description || "";
                launcherButton.append(iconNode, nameNode, descriptionNode);
                launcherButton.addEventListener("click", () => launch(definition.id));
                grid.appendChild(launcherButton);
            }
            if (dock && definition.dock) {
                const dockButton = document.createElement("button");
                dockButton.className = "DockIcon";
                dockButton.type = "button";
                dockButton.title = definition.name || definition.id;
                dockButton.setAttribute("aria-label", "Open " + (definition.name || definition.id));
                dockButton.textContent = definition.icon || "▣";
                dockButton.addEventListener("click", () => launch(definition.id));
                dock.appendChild(dockButton);
            }
        });
    }


    window.WebOSAppRegistry = Object.freeze({ register, all, launch, render, exportManifest, downloadManifest, validateManifest, unregister, isBuiltin });
    if (window.WebOSWASM?.restoreApps) window.WebOSWASM.restoreApps().catch(error => console.warn("WASM app restore:", error));
})();
