/**
 * app-registry.js
 * Core Application Registry and Execution Lifecycle for WebOS.
 */
(() => {
    const definitions = new Map();

    /**
     * Registers an application template configuration structure into the system memory cache.
     * @param {Object} definition - The app configuration metrics descriptor object.
     */
    function register(definition) {
        definitions.set(definition.id, Object.freeze({ ...definition }));
    }

    /**
     * Retrieves an array representation of all globally registered app metadata.
     * @returns {Array<Object>} Comprehensive application profile dataset array list.
     */
    function all() {
        return [...definitions.values()];
    }

    /**
     * Processes execution invocation context hooks to open a standard window framework instance.
     * @param {string} id - The specific alphanumeric lookup key matching the app to launch.
     * @param {*} argument - Optional run arguments context state injected into application initializers.
     */
    function launch(id, argument) {
        const definition = definitions.get(id);
        if (!definition) {
            return window.createWindow("WebOS", "Unknown app: " + id);
        }
        
        // FIX: Gracefully extract the operational target callback block structure
        // dynamically resolves if handler parameter was registered as a text key pointer or raw function closure
        let handler = definition.handler;
        if (typeof handler === "string") {
            handler = window[handler];
        }
        
        if (typeof handler !== "function") {
            return window.createWindow("WebOS", "App handler is unavailable: " + definition.name);
        }
        
        return handler(argument);
    }

    /**
     * Clears existing layout nodes and populates the application inventory grid 
     * and hardware quick-action layout launchbars.
     */
    function render() {
        const grid = document.querySelector(".LauncherGrid");
        const dock = document.getElementById("dock");
        if (!grid || !dock) return;
        
        grid.replaceChildren();
        dock.replaceChildren();
        
        all().forEach((definition) => {
            // Build the standard System Launcher Grid element item
            const launcherButton = document.createElement("button");
            launcherButton.className = "AppIcon";
            launcherButton.type = "button";
            launcherButton.dataset.app = definition.id;
            
            // Generate clean indexed text string flags to handle searching safely
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
            
            // Build out persistent Quick-Launch Taskbar Dock configurations dynamically
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

    // Export execution ecosystem namespace safely into the global context space
    window.WebOSAppRegistry = Object.freeze({ register, all, launch, render });
})();
