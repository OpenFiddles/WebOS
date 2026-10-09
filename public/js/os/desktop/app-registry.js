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
            }

            // Bridge to allow apps to natively read files safely via parent/local scope
            async read(path) {
                const fs = window.WebOSFileSystem || (window.parent && window.parent.WebOSFileSystem);
                if (fs && typeof fs.read === "function") {
                    return await fs.read(path);
                }
                throw new Error(`[WebOS App Client] Read failed: FileSystem layer is missing for app ${this.appId}`);
            }

            // Bridge to allow apps to natively write files safely via parent/local scope
            async putText(path, content) {
                const fs = window.WebOSFileSystem || (window.parent && window.parent.WebOSFileSystem);
                if (fs && typeof fs.putText === "function") {
                    return await fs.putText(path, content);
                }
                throw new Error(`[WebOS App Client] Write failed: FileSystem layer is missing for app ${this.appId}`);
            }
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
            
            launcherButton.innerHTML = `
                <strong>${definition.icon}</strong>
                <span>${definition.name}</span>
                <small>${definition.description}</small>
            `;
            
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
