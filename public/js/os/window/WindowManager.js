
let windowCount = 0;
const BASE_WINDOW_LAYER = 20;

function focusWindow(win) {
    // 1. Gather all open windows except the one being focused
    const allWindows = Array.from(document.querySelectorAll("[id^='Window_']"))
        .filter(w => w !== win)
        // Sort them by their current layer depth to preserve history
        .sort((a, b) => (parseInt(a.style.zIndex) || BASE_WINDOW_LAYER) - (parseInt(b.style.zIndex) || BASE_WINDOW_LAYER));

    // 2. Re-index remaining windows linearly starting from the base layer
    allWindows.forEach((w, index) => {
        w.style.zIndex = BASE_WINDOW_LAYER + index;
    });

    // 3. Place the focused window exactly on top of the stacked list
    win.style.zIndex = BASE_WINDOW_LAYER + allWindows.length;

    // 4. Update the taskbar buttons
    document.querySelectorAll(".TaskButton").forEach((button) => {
        button.classList.toggle("active", button.dataset.windowId === win.id && !win.classList.contains("is-minimized"));
    });
}

function createWindow(title, content) {
    const template = document.getElementById("WindowTemplate");
    if (!template) {
        console.error("System Error: WindowTemplate missing from DOM.");
        return null;
    }

    // Clone from template.content to extract the inner elements cleanly
    const winClone = template.content.cloneNode(true);
    const win = winClone.querySelector(".window-shell");
    if (!win) {
        console.error("System Error: .window-shell missing inside WindowTemplate.");
        return null;
    }

    // Assign a unique runtime system tracking ID
    win.id = "Window_" + Date.now() + "_" + (typeof windowCount !== "undefined" ? windowCount++ : 0);

    // Populate metadata utilizing your exact lowercase template classes
    const titleText = win.querySelector(".window-title-text");
    if (titleText) titleText.textContent = title;

    // Check if content looks like a URL or relative HTML path, if so render isolated application iframe
    const bodyContainer = win.querySelector(".window-body");
    const isUrl = typeof content === "string" && /^(https?:\/\/|\.{0,2}\/|.*\.html(\?.*)?$)/i.test(content.trim());

    if (bodyContainer) {
        if (isUrl) {
            const iframe = document.createElement("iframe");
            iframe.src = content.trim();
            iframe.loading = "lazy";
            bodyContainer.appendChild(iframe);
        } else if (content instanceof HTMLElement) {
            bodyContainer.appendChild(content);
        } else {
            bodyContainer.innerHTML = content ?? "";
        }
    }

    // Dynamic cascade window positioning offsets
    win.style.left = (40 + Math.random() * 80) + "px";
    win.style.top = (80 + Math.random() * 80) + "px";

    // Bind operational controllers safely
    if (typeof makeWindowDraggable === "function") makeWindowDraggable(win);
    if (typeof makeWindowResizable === "function") makeWindowResizable(win);
    if (typeof wireWindowButtons === "function") wireWindowButtons(win);

    // Mount inside workspace layer instead of the unconstrained body root
    const workspace = document.getElementById("window-workspace") || document.body;
    workspace.appendChild(win);

    // Generate responsive task tray navigation items
    const taskButton = document.createElement("button");
    taskButton.className = "TaskButton";
    taskButton.type = "button";
    taskButton.dataset.windowId = win.id;
    taskButton.textContent = title;
    taskButton.title = title;
    taskButton.addEventListener("click", () => {
        if (win.classList.contains("is-minimized")) {
            win.classList.remove("is-minimized");
        }
        win.classList.remove("is-closing");
        focusWindow(win);
    });

    const taskbarApps = document.getElementById("taskbar-apps");
    if (taskbarApps) taskbarApps.appendChild(taskButton);

    // Focus tracking mechanics execution hooks
    const titleBar = win.querySelector(".window-titlebar");
    if (titleBar) {
        titleBar.addEventListener("pointerdown", () => focusWindow(win));
    }
    win.addEventListener("pointerdown", () => focusWindow(win));

    focusWindow(win);
    return win;
}

function makeWindowDraggable(win) {
    // FIX: Changed selector from .WindowTitleBar to .window-titlebar to match your HTML
    const titleBar = win.querySelector(".window-titlebar");
    if (!titleBar) return; // Fail-safe to prevent crashes if template structure alters

    titleBar.addEventListener("pointerdown", (event) => {
        // FIX: Changed selector from .WindowButtons to .window-controls to match your HTML
        if (event.target.closest(".window-controls") || win.classList.contains("is-maximized")) return;
        
        const offsetX = event.clientX - win.offsetLeft;
        const offsetY = event.clientY - win.offsetTop;
        
        titleBar.setPointerCapture(event.pointerId);
        
        const move = (moveEvent) => {
            win.style.left = Math.max(8, moveEvent.clientX - offsetX) + "px";
            win.style.top = Math.max(48, moveEvent.clientY - offsetY) + "px";
        };
        
        const up = () => {
            titleBar.removeEventListener("pointermove", move);
            titleBar.removeEventListener("pointerup", up);
            titleBar.releasePointerCapture(event.pointerId); 
        };
        
        titleBar.addEventListener("pointermove", move);
        titleBar.addEventListener("pointerup", up);
    });
}

function makeWindowResizable(win) {
    // FIX: Select all lowercase resize handles defined in your HTML template
    const handles = win.querySelectorAll(".resize-handle");
    if (handles.length === 0) return; // Safeguard if an app window structure doesn't include handles

    handles.forEach(handle => {
        handle.addEventListener("pointerdown", (event) => {
            if (win.classList.contains("is-maximized")) return;
            event.preventDefault();
            event.stopPropagation(); // Stops interaction bubbling up to window focus rules
            
            const direction = handle.getAttribute("data-direction");
            
            // Capture the exact starting geometry of the window
            const startWidth = win.offsetWidth;
            const startHeight = win.offsetHeight;
            const startLeft = win.offsetLeft;
            const startTop = win.offsetTop;
            
            // Capture the initial pointer position
            const startX = event.clientX;
            const startY = event.clientY;
            
            // Safety constraints
            const minWidth = 260;
            const minHeight = 150;
            const topBoundary = 48; // Keeps window from sliding under your 48px taskbar

            handle.setPointerCapture(event.pointerId);
            
            const resize = (resizeEvent) => {
                // Calculate how far the mouse has moved since clicking
                const deltaX = resizeEvent.clientX - startX;
                const deltaY = resizeEvent.clientY - startY;
                
                let newWidth = startWidth;
                let newHeight = startHeight;
                let newLeft = startLeft;
                let newTop = startTop;
                
                // --- HORIZONTAL RESIZING ---
                // East (Right Edge)
                if (direction.includes("e")) {
                    newWidth = Math.max(minWidth, startWidth + deltaX);
                }
                // West (Left Edge) - Must shift 'left' position as width changes
                if (direction.includes("w")) {
                    const potentialWidth = startWidth - deltaX;
                    if (potentialWidth >= minWidth) {
                        newWidth = potentialWidth;
                        newLeft = startLeft + deltaX;
                    }
                }
                
                // --- VERTICAL RESIZING ---
                // South (Bottom Edge)
                if (direction.includes("s")) {
                    newHeight = Math.max(minHeight, startHeight + deltaY);
                }
                // North (Top Edge) - Must shift 'top' position as height changes
                if (direction.includes("n")) {
                    const potentialHeight = startHeight - deltaY;
                    if (potentialHeight >= minHeight && (startTop + deltaY) >= topBoundary) {
                        newHeight = potentialHeight;
                        newTop = startTop + deltaY;
                    }
                }
                
                // Apply the updated calculations to your window style layout
                win.style.width = newWidth + "px";
                win.style.height = newHeight + "px";
                win.style.left = newLeft + "px";
                win.style.top = newTop + "px";
            };
            
            const up = () => {
                handle.removeEventListener("pointermove", resize);
                handle.removeEventListener("pointerup", up);
                handle.releasePointerCapture(event.pointerId);
            };
            
            handle.addEventListener("pointermove", resize);
            handle.addEventListener("pointerup", up);
        });
    });
}

function wireWindowButtons(win) {
    const closeBtn = win.querySelector(".close");
    const minimizeBtn = win.querySelector(".minimize");
    const maximizeBtn = win.querySelector(".maximize");

    if (closeBtn) {
        closeBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            if (win.classList.contains("is-closing")) return;
            win.dispatchEvent(new CustomEvent("webos:window-close"));
            win.classList.add("is-closing");
            document.querySelector(`.TaskButton[data-window-id="${win.id}"]`)?.classList.remove("active");

            window.setTimeout(() => {
                win.remove();
                document.querySelector(`.TaskButton[data-window-id="${win.id}"]`)?.remove();
                const remaining = Array.from(document.querySelectorAll("[id^='Window_']"))
                    .filter((item) => !item.classList.contains("is-minimized") && !item.classList.contains("is-closing"))
                    .sort((a, b) => (parseInt(b.style.zIndex) || 0) - (parseInt(a.style.zIndex) || 0));
                if (remaining.length) focusWindow(remaining[0]);
            }, 190);
        });
    }

    if (minimizeBtn) {
        minimizeBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            win.classList.add("is-minimized");
            document.querySelector(`.TaskButton[data-window-id="${win.id}"]`)?.classList.remove("active");
            const remaining = Array.from(document.querySelectorAll("[id^='Window_']"))
                .filter((item) => item !== win && !item.classList.contains("is-minimized") && !item.classList.contains("is-closing"))
                .sort((a, b) => (parseInt(b.style.zIndex) || 0) - (parseInt(a.style.zIndex) || 0));
            if (remaining.length) focusWindow(remaining[0]);
        });
    }

    if (maximizeBtn) {
        maximizeBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            win.classList.toggle("is-maximized");
            focusWindow(win);
        });
    }
}




function launchApp(app) {
    return WebOSAppRegistry.launch((app || "terminal").toLowerCase());
}

window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || !event.data || event.data.source !== "webos-terminal") return;
    if (event.data.action === "open-url") {
        openBrowser(event.data.url);
    } else if (event.data.action === "launch-app") {
        launchApp(event.data.app);
    }
});

function openEmulator() {
    if (typeof closeLauncher === "function") closeLauncher();

    const shell = document.createElement("section");
    shell.className = "FlairOS-shell";

    const toolbar = document.createElement("div");
    toolbar.className = "EmulatorToolbar";

    const status = document.createElement("span");
    status.className = "EmulatorStatus";
    status.textContent = "FlairOS · hosted emulator";

    const makeButton = (label, title) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "EmulatorToolbarButton";
        button.textContent = label;
        button.title = title;
        return button;
    };

    const reloadButton = makeButton("↻", "Reload FlairOS");
    const openButton = makeButton("↗", "Open FlairOS in a new tab");
    const fullscreenButton = makeButton("⛶", "Enter fullscreen");
    toolbar.append(status, reloadButton, openButton, fullscreenButton);

    const frame = document.createElement("iframe");
    frame.className = "EmulatorFrame";
    frame.src = "/api/browser-proxy?url=" + encodeURIComponent("https://openfiddles.github.io/FlairOS/");
    frame.title = "FlairOS emulator";
    frame.loading = "eager";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.allowFullscreen = true;
    frame.setAttribute("allow", "fullscreen; clipboard-read; clipboard-write");
    frame.setAttribute("sandbox", "allow-scripts allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-downloads");

    shell.appendChild(toolbar);
    shell.appendChild(frame);

    const win = createWindow("FlairOS Emulator", shell);
    if (!win) return;
    win.classList.add("EmulatorWindow");
    win.style.width = Math.min(window.innerWidth - 32, 1040) + "px";
    win.style.height = Math.min(window.innerHeight - 100, 720) + "px";
    win.style.left = Math.max(16, (window.innerWidth - parseInt(win.style.width, 10)) / 2) + "px";
    win.style.top = "58px";

    reloadButton.addEventListener("click", () => {
        frame.src = frame.src;
        status.textContent = "Reloading FlairOS…";
    });
    openButton.addEventListener("click", () => {
        window.open(frame.src, "_blank", "noopener,noreferrer");
    });
    fullscreenButton.addEventListener("click", async () => {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await win.requestFullscreen();
        } catch (error) {
            status.textContent = "Fullscreen is unavailable in this browser.";
        }
    });
    frame.addEventListener("load", () => {
        status.textContent = "FlairOS loaded · hosted on GitHub Pages";
    });
}

[
    ["alpine", "FlairOS Emulator", "F", "Launch your hosted FlairOS environment", "openEmulator", true],
    ["browser", "Browser", "B", "Browse the web", "openBrowser", true],
    ["files", "Files", "F", "Manage local files", "openFiles", true],
    ["notes", "Notes", "N", "Write and save notes", "openNotes", false],
    ["settings", "Better Settings", "S", "Tune your WebOS", "openSettings", true],
    ["wasm", "WASM Lab", "W", "Run local .wasm modules", "openWasmLab", false],
    ["calendar", "Calendar", "D", "Save dated events", "openCalendar", false],
    ["monitor", "System Monitor", "M", "Inspect desktop state", "openSystemMonitor", false],
    ["calculator", "Calculator", "C", "Open the calculator", "openCalculator", false],
    ["about", "About", "i", "About WebOS", "openAbout", false],
    ["appcreator", "App Creator", "🧩", "Build and install custom WebOS apps", "openAppCreator", false]
].forEach(([id, name, icon, description, handler, dock]) => {
    WebOSAppRegistry.register({ id, name, icon, description, handler, dock });
});
WebOSFileSystem.ensureSeeded();
WebOSAppRegistry.render();

function updateClock() {
    document.getElementById("clock").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

document.body.dataset.theme = localStorage.getItem("webos-theme") || "ocean";
document.body.dataset.motion = localStorage.getItem("webos-motion-style") || "smooth";
document.body.dataset.reducedMotion = localStorage.getItem("webos-reduced-motion") === "true" ? "true" : "false";
const savedAccent = localStorage.getItem("webos-accent");
if (savedAccent) document.body.style.setProperty("--accent", savedAccent);
const savedWallpaper = localStorage.getItem("webos-wallpaper") || "aurora";
const savedCustomWallpaper = localStorage.getItem("webos-custom-wallpaper");
document.body.dataset.wallpaper = savedCustomWallpaper ? "custom" : savedWallpaper;
if (savedCustomWallpaper) {
    document.body.style.backgroundImage = `linear-gradient(135deg, rgba(4, 10, 20, .30), rgba(4, 10, 20, .55)), url("${savedCustomWallpaper}")`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
}
updateClock();
setInterval(updateClock, 30000);


