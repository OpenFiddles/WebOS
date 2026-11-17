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
                    getInfo: () => Object.freeze({
                        name: "WebOS",
                        runtime: "browser",
                        browser: navigator.userAgent,
                        secureContext: window.isSecureContext === true,
                        language: navigator.language || "en"
                    })
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

    function register(definition) {
        definitions.set(definition.id, Object.freeze({ ...definition }));
    }

    function all() {
        return [...definitions.values()];
    }

    /**
     * Processes execution invocation context hooks to open a standard window framework instance.
     * MODIFIED: Natively wraps and passes a custom API wrapper to the launching app.
     */
    function launch(id, argument) {
        const definition = definitions.get(id);
        if (!definition) {
            return window.createWindow("WebOS", "Unknown app: " + id);
        }
        
        let handler = definition.handler;
        if (typeof handler === "string") {
            handler = window[handler];
        }
        
        if (typeof handler !== "function") {
            return window.createWindow("WebOS", "App handler is unavailable: " + definition.name);
        }
        
        // ================================================================
        // API INJECTION ENGINE
        // Dynamically instantiate a custom sandboxed API context client 
        // using the app's unique registry id token metadata boundary.
        // ================================================================
        const appAPIInstance = new window.WebOSAppClient(definition.id);
        
        // Execute app logic: Passes the API proxy first, then any custom initial arguments
        return handler(appAPIInstance, argument);
    }

    function render() {
        // FIX: Match the exact uppercase class name from your index.html layout template
        const grid = document.querySelector(".LauncherGrid"); 
        const dock = document.getElementById("dock");
        if (!grid || !dock) return;
        
        grid.replaceChildren();
        dock.replaceChildren();
        
        all().forEach((definition) => {
            const launcherButton = document.createElement("button");
            launcherButton.className = "AppIcon";
            launcherButton.type = "button";
            launcherButton.dataset.app = definition.id;
            
            const rawSearchToken = [definition.name, definition.description, definition.id].join(" ").toLowerCase();
            launcherButton.dataset.search = rawSearchToken;
            launcherButton.setAttribute("aria-label", `${definition.name}: ${definition.description}`);
            
            const iconNode = document.createElement("strong");
            iconNode.textContent = definition.icon;
            const nameNode = document.createElement("span");
            nameNode.textContent = definition.name;
            const descriptionNode = document.createElement("small");
            descriptionNode.textContent = definition.description;
            launcherButton.append(iconNode, nameNode, descriptionNode);
            
            launcherButton.addEventListener("click", () => launch(definition.id));
            grid.appendChild(launcherButton);
            
            if (definition.dock) {
                const dockButton = document.createElement("button");
                dockButton.className = "DockIcon";
                dockButton.type = "button";
                dockButton.title = definition.name;
                dockButton.textContent = definition.icon;
                
                dockButton.addEventListener("click", () => launch(definition.id));
                dock.appendChild(dockButton);
            }
        });
    }


    window.WebOSAppRegistry = Object.freeze({ register, all, launch, render });
})();
