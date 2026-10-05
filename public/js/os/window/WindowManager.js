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
    if (!template) return console.error("System Error: WindowTemplate missing from DOM.");
    
    // CRITICAL FIX: Clone from template.content to extract the inner elements cleanly
    const winClone = template.content.cloneNode(true);
    const win = winClone.querySelector(".window-shell");

    // Assign a unique runtime system tracking tracker ID
    win.id = "Window_" + Date.now() + "_" + (typeof windowCount !== 'undefined' ? windowCount++ : 0);

    // Populate metadata utilizing your exact lowercase template classes
    win.querySelector(".window-title-text").textContent = title;
    
    // Check if content looks like a URL string, if so render isolated application iframe
    const bodyContainer = win.querySelector(".window-body");
    if (typeof content === "string" && (content.startsWith("http") || content.startsWith("/") || content.endsWith(".html"))) {
        const iframe = document.createElement("iframe");
        iframe.src = content;
        iframe.loading = "lazy";
        bodyContainer.appendChild(iframe);
    } else {
        bodyContainer.innerHTML = content;
    }

    // Dynamic cascade window positioning offsets
    win.style.left = (40 + Math.random() * 80) + "px";
    win.style.top = (80 + Math.random() * 80) + "px";

    // Bind operational controllers
    makeWindowDraggable(win);
    makeWindowResizable(win);
    wireWindowButtons(win);

    // CRITICAL FIX: Mount inside workspace layer instead of the unconstrained body root
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


/* DRAGGING */

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

/* RESIZING */

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


/* WINDOW BUTTONS */
function wireWindowButtons(win) {
    // FIX: Changed selectors to lowercase (.close, .minimize, .maximize) to match your HTML template
    const closeBtn = win.querySelector(".close");
    const minimizeBtn = win.querySelector(".minimize");
    const maximizeBtn = win.querySelector(".maximize");

    if (closeBtn) {
        closeBtn.addEventListener("pointerdown", (e) => {
            e.stopPropagation(); 
            win.remove();
            document.querySelector(`.TaskButton[data-window-id="${win.id}"]`)?.remove();
            
            const remainder = Array.from(document.querySelectorAll("[id^='Window_']"))
                .filter(w => !w.classList.contains("is-minimized"))
                .sort((a, b) => (parseInt(b.style.zIndex) || 0) - (parseInt(a.style.zIndex) || 0));
                
            if (remainder.length > 0) {
                focusWindow(remainder[0]);
            }
        });
    }

    if (minimizeBtn) {
        minimizeBtn.addEventListener("pointerdown", (e) => {
            e.stopPropagation();
            win.classList.add("is-minimized");
            document.querySelector(`.TaskButton[data-window-id="${win.id}"]`)?.classList.remove("active");
            
            const remainder = Array.from(document.querySelectorAll("[id^='Window_']"))
                .filter(w => w !== win && !w.classList.contains("is-minimized"))
                .sort((a, b) => (parseInt(b.style.zIndex) || 0) - (parseInt(a.style.zIndex) || 0));
                
            if (remainder.length > 0) {
                focusWindow(remainder[0]);
            }
        });
    }

    if (maximizeBtn) {
        maximizeBtn.addEventListener("pointerdown", (e) => {
            e.stopPropagation();
            win.classList.toggle("is-maximized");
            focusWindow(win);
        });
    }
}


/* LAUNCHER LOGIC */

const launcher = document.getElementById("Launcher");
const launcherBtn = document.getElementById("open-launcher");

launcherBtn.onclick = () => {
    launcher.classList.add("active");
    document.getElementById("launcher-search").focus();
};

launcher.onclick = (e) => {
    if (e.target === launcher) {
        launcher.classList.remove("active");
    }
};

document.getElementById("launcher-search").addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    document.querySelectorAll(".AppIcon").forEach((icon) => {
        icon.hidden = query !== "" && !icon.dataset.app.includes(query) && !icon.textContent.toLowerCase().includes(query);
    });
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") launcher.classList.remove("active");
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "space") {
        event.preventDefault();
        launcherBtn.click();
    }
});

/* CALCULATOR (simple iframe window) */

function closeLauncher() {
    launcher.classList.remove("active");
}

function openNotes() {
    closeLauncher();
    const win = createWindow("Notes", '<div class="AppPanel"><h2>Notes</h2><textarea id="notes-editor" placeholder="Write something worth keeping..."></textarea><button type="button" id="notes-save">Save note</button><p id="notes-status" aria-live="polite"></p></div>');
    const editor = win.querySelector("#notes-editor");
    const status = win.querySelector("#notes-status");
    WebOSFileSystem.read("/Documents/Notes.txt").then((entry) => {
        editor.value = entry?.content || localStorage.getItem("webos-notes") || "";
    });
    win.querySelector("#notes-save").addEventListener("click", () => {
        WebOSFileSystem.putText("/Documents/Notes.txt", editor.value).then(() => {
            localStorage.setItem("webos-notes", editor.value);
            status.textContent = "Saved to Documents/Notes.txt at " + new Date().toLocaleTimeString();
        });
    });
    return win;
}

function openFiles() {
    closeLauncher();
    const win = createWindow("Files", '<div class="AppPanel"><h2>Home</h2><div class="FileToolbar"><button type="button" id="new-file">New file</button><button type="button" id="upload-file">Import</button><input id="file-picker" type="file" hidden></div><ul class="AppList" id="file-list"></ul><p id="file-status" aria-live="polite">IndexedDB filesystem</p></div>');
    const list = win.querySelector("#file-list");
    const status = win.querySelector("#file-status");
    const renderFiles = async () => {
        list.replaceChildren();
        const entries = await WebOSFileSystem.list("/");
        entries.forEach((entry) => {
            const item = document.createElement("li");
            const name = document.createElement("span");
            name.textContent = entry.path.split("/").pop() || "/";
            const type = document.createElement("small");
            type.textContent = entry.type === "directory" ? "Folder" : "File";
            item.append(name, type);
            if (entry.type === "file") {
                item.title = "Double-click to open";
                item.ondblclick = async () => {
                    const file = await WebOSFileSystem.read(entry.path);
                    const editor = createWindow(entry.path.split("/").pop(), `<div class="AppPanel"><textarea class="file-editor"></textarea><button type="button" class="save-file">Save file</button></div>`);
                    editor.querySelector(".file-editor").value = file?.content || "";
                    editor.querySelector(".save-file").onclick = () => WebOSFileSystem.putText(entry.path, editor.querySelector(".file-editor").value);
                };
            }
            list.appendChild(item);
        });
    };
    win.querySelector("#new-file").onclick = async () => {
        const name = window.prompt("File name", "Documents/New file.txt");
        if (!name) return;
        await WebOSFileSystem.putText("/" + name.replace(/^\/+/, ""), "");
        status.textContent = "Created " + name;
        renderFiles();
    };
    const picker = win.querySelector("#file-picker");
    win.querySelector("#upload-file").onclick = () => picker.click();
    picker.onchange = async () => {
        const file = picker.files[0];
        if (!file) return;
        await WebOSFileSystem.putText("/Downloads/" + file.name, await file.text());
        status.textContent = "Imported " + file.name;
        renderFiles();
    };
    renderFiles();
    return win;
}

function openSettings() {
    closeLauncher();
    const selectedTheme = localStorage.getItem("webos-theme") || "ocean";
    const win = createWindow("Better Settings", `<div class="AppPanel"><h2>Better Settings</h2><label for="theme-choice">Accent theme</label><select id="theme-choice"><option value="ocean">Ocean</option><option value="mint">Mint</option><option value="sunset">Sunset</option></select><label><input id="motion-choice" type="checkbox"> Reduce motion</label><button type="button" id="clear-storage">Reset WebOS data</button><p id="settings-status">Changes are saved on this device.</p></div>`);
    const choice = win.querySelector("#theme-choice");
    choice.value = selectedTheme;
    choice.addEventListener("change", () => {
        localStorage.setItem("webos-theme", choice.value);
        document.body.dataset.theme = choice.value;
    });
    const motion = win.querySelector("#motion-choice");
    motion.checked = localStorage.getItem("webos-reduced-motion") === "true";
    motion.addEventListener("change", () => {
        localStorage.setItem("webos-reduced-motion", motion.checked);
        document.documentElement.style.setProperty("--motion-scale", motion.checked ? "0" : "1");
    });
    win.querySelector("#clear-storage").onclick = async () => {
        await WebOSFileSystem.remove("/Documents/Notes.txt");
        localStorage.removeItem("webos-notes");
        win.querySelector("#settings-status").textContent = "Notes data reset.";
    };
    return win;
}

function openAbout() {
    // here you can modify the About OS's window page!
    const about_dialog = {
        "OS_NAME": "WebOS",
        "Codename": "Webion",
        "Version": "web-0.5",
        "About": "WebOS is an OS... In the browser! Consider supporting us to help keep it going!",
        "DonationPage": ":[",
        "MainPage": ":["
    };

    closeLauncher();

    // here you can modifiy it's html!
    var html = `
        <div class="AboutOS">
            <h1>${about_dialog.OS_NAME}</h1>
            <p><strong>Codename:</strong> ${about_dialog.Codename}</p>
            <p><strong>Version:</strong> ${about_dialog.Version}</p>
            <p>${about_dialog.About}</p>
        </div>
    `;

    return createWindow("About WebOS", html);
}


function openCalculator() {
    closeLauncher();
    const content = '<iframe src="https://www.desmos.com/calculator" style="width:100%;height:100%;border:none;border-radius:12px;"></iframe>';
    createWindow("Calculator", content);
}

function openCalendar() {
    closeLauncher();

    // 1. Clean, readable HTML template
    const htmlTemplate = `
        <div class="AppPanel">
            <h2>Calendar</h2>
            <input id="calendar-date" type="date">
            <textarea id="calendar-note" placeholder="Add a note for this date..."></textarea>
            <button type="button" id="calendar-save">Save event</button>
            <p id="calendar-status" aria-live="polite"></p>
        </div>
    `;

    const win = createWindow("Calendar", htmlTemplate);
    
    // Elements caching
    const dateInput = win.querySelector("#calendar-date");
    const noteInput = win.querySelector("#calendar-note");
    const saveButton = win.querySelector("#calendar-save");
    const statusText = win.querySelector("#calendar-status");

    // Set today's date automatically
    dateInput.value = new Date().toISOString().slice(0, 10);

    // Helper to generate the exact file path key
    const getFilePath = () => `/Documents/Calendar/${dateInput.value}.txt`;

    // 2. Load existing note when date changes
    dateInput.onchange = async () => {
        noteInput.disabled = true; // Disable inputs to prevent typing while fetching
        statusText.textContent = "Loading event...";
        
        try {
            const file = await WebOSFileSystem.read(getFilePath());
            noteInput.value = file?.content || "";
            statusText.textContent = "";
        } catch (error) {
            console.error("Failed to read calendar data:", error);
            statusText.textContent = "Error loading event.";
        } finally {
            noteInput.disabled = false;
        }
    };

    // Trigger initial load for today's date
    dateInput.onchange();

    // 3. Save note event listener
    saveButton.onclick = async () => {
        saveButton.disabled = true;
        statusText.textContent = "Saving...";

        try {
            await WebOSFileSystem.putText(getFilePath(), noteInput.value);
            statusText.textContent = `Saved successfully for ${dateInput.value}!`;
        } catch (error) {
            console.error("Failed to save calendar data:", error);
            statusText.textContent = "Error saving event. Please try again.";
        } finally {
            saveButton.disabled = false;
        }
    };

    return win;
}


function openSystemMonitor() {
    closeLauncher();

    // 1. Clean HTML wrapper structure
    const htmlTemplate = `
        <div class="AppPanel">
            <h2>System Monitor</h2>
            <ul class="AppList" id="system-stats"></ul>
        </div>
    `;

    const win = createWindow("System Monitor", htmlTemplate);
    const statsContainer = win.querySelector("#system-stats");

    // 2. Real-time metrics collector
    const updateStats = () => {
        // Fallback for memory reporting across different browsers
        const memoryUsage = window.performance?.memory 
            ? `${Math.round(window.performance.memory.usedJSHeapSize / 1048576)} MB` 
            : "Unsupported by browser";

        const openWindowsCount = document.querySelectorAll(".WindowDesign:not(#WindowTemplate):not(.is-minimized)").length;

        const metrics = [
            { label: "Active Windows", value: openWindowsCount },
            { label: "Storage Engine", value: "IndexedDB Filesystem" },
            { label: "Memory Allocation", value: memoryUsage }
        ];

        // 3. Efficient UI rendering
        statsContainer.innerHTML = metrics
            .map(item => `<li><span>${item.label}</span><small>${item.value}</small></li>`)
            .join("");
    };

    // Initial render
    updateStats();

    // 4. Live tracking loop (updates metrics every 1 second)
    const intervalId = setInterval(updateStats, 1000);

    // 5. Memory leak prevention: clear the interval when the window is destroyed
    // Assuming your custom window component emits an onclose or close listener hook:
    if (typeof win.addEventListener === "function") {
        win.addEventListener("close", () => clearInterval(intervalId));
    } else {
        // Fallback custom property hook if addEventListener isn't standard on your win object
        win.onCloseHook = () => clearInterval(intervalId);
    }

    return win;
}


function openWasmLab() {
    closeLauncher();

    // 1. Clean HTML template matching your .WindowBody insertion setup
    const htmlTemplate = `
        <div class="AppPanel" style="padding: 15px; font-family: sans-serif; display: flex; flex-direction: column; gap: 12px; height: 100%; box-sizing: border-box;">
            <h2 style="margin: 0 0 5px 0; font-size: 1.2rem;">WASM Lab</h2>
            <input id="wasm-file" type="file" accept=".wasm,application/wasm" style="width: 100%;">
            <select id="wasm-export" disabled style="padding: 6px; width: 100%; border-radius: 4px; border: 1px solid #ccc; background: #fff; color: #000;">
                <option value="">Load a module first</option>
            </select>
            <button type="button" id="wasm-run" disabled style="padding: 8px 12px; font-weight: bold; border-radius: 4px; cursor: pointer; border: none; background: #007acc; color: #fff;">Run export</button>
            <pre id="wasm-output" class="AppOutput" style="margin: 0; padding: 10px; flex-grow: 1; overflow: auto; background: #1e1e1e; color: #d4d4d4; font-family: monospace; border-radius: 4px; font-size: 0.9rem; min-height: 100px; white-space: pre-wrap; word-break: break-all;">Select a local WebAssembly module.</pre>
        </div>
    `;

    // Initialize using your template manager
    const win = createWindow("WASM Lab", htmlTemplate);
    
    // Explicit scoped context selections within this specific clone instance
    const filePicker = win.querySelector("#wasm-file");
    const exportsMenu = win.querySelector("#wasm-export");
    const runButton = win.querySelector("#wasm-run");
    const outputArea = win.querySelector("#wasm-output");
    
    let instance = null;

    // 2. Handle parsing and instantiating the uploaded binary file safely
    filePicker.onchange = async () => {
        // FIX: Extract item index zero from file list array collection
        const file = filePicker.files[0];
        if (!file) return;

        outputArea.textContent = "Compiling and instantiating module...";
        
        // Reset UI state controllers
        exportsMenu.disabled = true;
        runButton.disabled = true;
        instance = null;

        try {
            // Read binary buffer data from selected disk source
            const bytes = await file.arrayBuffer();
            
            // Standard execution logging channel mapping directly to your window app pane
            const systemLog = (msg) => {
                outputArea.textContent += `\n[System Out] ${msg}`;
            };

            // Sandbox compilation context wrapper
            const importObject = {
                env: {
                    abort: (msg) => console.warn(`WASM module called abort: ${msg}`),
                    print: systemLog,
                    printErr: systemLog
                }
            };

            // Compile byte block streaming buffers natively 
            const result = await WebAssembly.instantiate(bytes, importObject);
            instance = result.instance;

            // Extract valid callable executions while stripping out internal raw memory markers
            const exportNames = Object.keys(instance.exports).filter(name => {
                return typeof instance.exports[name] === "function";
            });
            
            if (exportNames.length === 0) {
                outputArea.textContent = `Loaded ${file.name}, but it exports no callable execution endpoints.`;
                return;
            }

            // Build dynamic target selector parameters
            exportsMenu.innerHTML = exportNames
                .map(name => `<option value="${name}">${name}</option>`)
                .join("");

            // Elevate system state back to live interaction mode
            exportsMenu.disabled = false;
            runButton.disabled = false;
            outputArea.textContent = `Successfully loaded ${file.name}.\nSelect an exported function function block below to trigger run loop context routines.`;

        } catch (error) {
            exportsMenu.innerHTML = '<option value="">Load failed</option>';
            outputArea.textContent = `WASM instantiation failed:\n${error.message}`;
        }
    };

    // 3. Execution logic wrapper triggered by clicking run button
    runButton.onclick = () => {
        if (!instance) return;

        const targetFunctionName = exportsMenu.value;
        const exportedItem = instance.exports[targetFunctionName];

        if (typeof exportedItem !== "function") {
            outputArea.textContent = `Error: "${targetFunctionName}" is not a valid callable method engine.`;
            return;
        }

        try {
            outputArea.textContent = `Executing ${targetFunctionName}()...\n`;
            
            // Trigger raw WebAssembly binary runtime cycle execution context loop natively
            const result = exportedItem();
            
            outputArea.textContent += `\nExecution Complete.\nResult: ${result !== undefined ? String(result) : "void (no return value)"}`;
        } catch (error) {
            outputArea.textContent = `Runtime Execution Error:\n${error.message}`;
        }
    };

    return win;
}



const launcherSearch = document.getElementById("launcher-search");

function openBrowser(initialUrl) {
    closeLauncher();
    const htmlTemplate = `
    <div class="AppPanel BrowserApp" style="display: flex; flex-direction: column; width: 100%; height: 100%; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1e1e1e; color: #fff; user-select: none;">
        
        <!-- 🌐 CHROME-STYLE TAB ROW CONTAINER -->
        <div class="BrowserTabBar" style="display: flex; background: #141414; padding: 6px 6px 0 6px; gap: 4px; align-items: flex-end; overflow-x: auto; border-bottom: 1px solid #2d2d2d;">
            <div class="TabContainer" style="display: flex; gap: 4px; align-items: flex-end;"></div>
            <button type="button" class="NewTabBtn" title="New Tab" style="background: #2d2d2d; color: #fff; border: none; padding: 6px 10px; cursor: pointer; border-radius: 4px; font-weight: bold; margin-bottom: 4px; font-size: 14px; display: flex; align-items: center; justify-content: center; height: 28px; width: 28px; transition: background 0.2s;">+</button>
        </div>

        <!-- 🛠️ INTERACTION CONTROLS BAR -->
        <form class="BrowserBar" action="javascript:void(0);" style="display: flex; gap: 6px; padding: 8px; background: #1e1e1e; align-items: center;">
            <div class="BrowserNavigationControls" style="display: flex; gap: 4px;">
                <button type="button" class="BrowserBack" title="Back" style="background: #2d2d2d; color: #fff; border: none; padding: 6px 12px; cursor: pointer; border-radius: 4px; transition: background 0.2s; font-size: 12px;">◀</button>
                <button type="button" class="BrowserForward" title="Forward" style="background: #2d2d2d; color: #fff; border: none; padding: 6px 12px; cursor: pointer; border-radius: 4px; transition: background 0.2s; font-size: 12px;">▶</button>
                <button type="button" class="BrowserReload" title="Reload" style="background: #2d2d2d; color: #fff; border: none; padding: 6px 10px; cursor: pointer; border-radius: 4px; transition: background 0.2s; font-size: 12px;">🔄</button>
            </div>
            <input type="text" name="url" class="BrowserAddressInput" id="browser-address" placeholder="Search Google or enter web address..." required style="flex-grow: 1; padding: 7px 14px; border: 1px solid #3a3a3a; border-radius: 6px; background: #2a2a2a; color: #fff; outline: none; font-size: 13px; transition: border-color 0.2s;">
            <button type="button" class="BrowserOpenExternal" title="Open in physical browser tab" style="background: #2d2d2d; border: none; padding: 6px 10px; cursor: pointer; border-radius: 4px; transition: background 0.2s; font-size: 12px;">🌐</button>
        </form>

        <!-- 🖼️ IFRAME WORKSPACE ZONE -->
        <div class="BrowserFramesContainer" style="position: relative; width: 100%; flex-grow: 1; background: #fff;">
            <div class="BrowserHint" style="display: none; position: absolute; top: 0; left: 0; right: 0; background: #cf3c3c; color: #fff; padding: 10px; text-align: center; font-size: 13px; z-index: 100; font-weight: 500; box-shadow: 0 4px 10px rgba(0,0,0,0.2);">
                The proxy server is taking too long to load this website or connection was refused.
            </div>
        </div>
    </div>
    `;
    // 1. Initialize the window container layout
    const win = createWindow("Browser", htmlTemplate);
    win.style.width = Math.min(window.innerWidth - 40, 1000) + "px";
    win.style.height = Math.min(window.innerHeight - 110, 700) + "px";
    win.style.top = "68px";

    // 2. Cache Core DOM Handles scoped specifically to this window
    const tabContainer = win.querySelector(".TabContainer");
    const newTabBtn = win.querySelector(".NewTabBtn");
    const addressBar = win.querySelector("#browser-address");
    const framesContainer = win.querySelector(".BrowserFramesContainer");
    const hint = win.querySelector(".BrowserHint");
    const searchForm = win.querySelector(".BrowserBar");
    
    const backButton = win.querySelector(".BrowserBack");
    const forwardButton = win.querySelector(".BrowserForward");
    const reloadButton = win.querySelector(".BrowserReload");
    const externalButton = win.querySelector(".BrowserOpenExternal");

    // 3. Tab Engine State Management Properties
    let tabs = [];
    let activeTabId = null;
    let tabIdCounter = 0;

    // 1. IMPROVED HTML: Added layout support for Back, Forward, and Reload controls
    


    // 5. Navigation Controller
    const navigate = (url, trackingEnabled = true) => {
        try {
            // Auto-prepend protocol format layers
            if (!/^https?:\/\//i.test(url)) {
                url = "https://" + url;
            }

            const parsed = new URL(url);
            if (!["http:", "https:"].includes(parsed.protocol)) {
                throw new Error("Unsupported protocol");
            }

            // Sync state elements
            addressBar.value = parsed.href;
            
            // Manage custom history array stacks manually for sandboxed proxies
            if (trackingEnabled && !isNavigatingFromHistory) {
                // If we navigate to a new site while sitting back in history, slice the forward chain
                historyStack = historyStack.slice(0, historyPointer + 1);
                historyStack.push(parsed.href);
                historyPointer = historyStack.length - 1;
            }

            // Update state tracking
            isNavigatingFromHistory = false;
            hint.style.display = "none";
            clearTimeout(frameTimer);

            // Execute conditional source load routing rules
            if (parsed.origin === window.location.origin) {
                frame.src = parsed.href;
            } else {
                frame.src = `/api/browser-proxy?url=${encodeURIComponent(parsed.href)}`;
            }

            // Network failure boundary safety trigger
            frameTimer = setTimeout(() => {
                hint.style.display = "block";
            }, 6000);

            // Update layout button disabled statuses cleanly
            backButton.style.opacity = historyPointer > 0 ? "1" : "0.4";
            forwardButton.style.opacity = historyPointer < historyStack.length - 1 ? "1" : "0.4";

        } catch (error) {
            addressBar.value = "";
            addressBar.placeholder = "Invalid URL. Use http:// or https:// formats.";
        }
    };

    // 6. Navigation Button Direct Bindings
    backButton.addEventListener("click", () => {
        if (historyPointer > 0) {
            isNavigatingFromHistory = true;
            historyPointer--;
            navigate(historyStack[historyPointer], false);
        }
    });

    forwardButton.addEventListener("click", () => {
        if (historyPointer < historyStack.length - 1) {
            isNavigatingFromHistory = true;
            historyPointer++;
            navigate(historyStack[historyPointer], false);
        }
    });

    reloadButton.addEventListener("click", () => {
        if (historyStack[historyPointer]) {
            navigate(historyStack[historyPointer], false);
        }
    });

    externalButton.addEventListener("click", () => {
        if (historyStack[historyPointer]) {
            window.open(historyStack[historyPointer], "_blank", "noopener,noreferrer");
        }
    });

    // 7. System Iframe Content Listener Optimization
    frame.addEventListener("load", () => {
        clearTimeout(frameTimer);
        
        try {
            // Monitor same-origin title fallbacks cleanly
            const title = frame.contentDocument?.title || "";
            if (title.toLowerCase().includes("refused") || title.toLowerCase().includes("blocked")) {
                hint.style.display = "block";
            }
        } catch (crossOriginError) {
            // standard cross-origin boundaries prevent parent DOM scanning. 
            // This is completely expected for external proxy sites.
        }
    });

    newTabBtn.addEventListener("click", () => createNewTab("https://example.com"));

    searchForm.addEventListener("submit", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab) {
            navigate(activeTab, addressBar.value);
        }
    });

    setupStaticControls(backButton, forwardButton, reloadButton, externalButton, () => tabs.find(t => t.id === activeTabId));

    // Run core initialization sequence
    navigate(initialUrl || "https://example.com");

    return win;
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
    closeLauncher();
    const content = '<iframe class="EmulatorFrame" src="/html/apps/emulator_alpine/index.html" title="Alpine Linux emulator" allow="fullscreen"></iframe>';
    const win = createWindow("Alpine Linux", content);

    win.classList.add("EmulatorWindow");
    win.style.width = Math.min(window.innerWidth - 40, 820) + "px";
    win.style.height = Math.min(window.innerHeight - 110, 560) + "px";
    win.style.left = Math.max(20, (window.innerWidth - parseInt(win.style.width, 10)) / 2) + "px";
    win.style.top = "68px";
}

[
    ["alpine", "Alpine Linux", "A", "Run the Alpine CheerpX guest", "openEmulator", true],
    ["browser", "Browser", "B", "Browse the web", "openBrowser", true],
    ["files", "Files", "F", "Manage local files", "openFiles", true],
    ["notes", "Notes", "N", "Write and save notes", "openNotes", false],
    ["settings", "Better Settings", "S", "Tune your WebOS", "openSettings", true],
    ["wasm", "WASM Lab", "W", "Run local .wasm modules", "openWasmLab", false],
    ["calendar", "Calendar", "D", "Save dated events", "openCalendar", false],
    ["monitor", "System Monitor", "M", "Inspect desktop state", "openSystemMonitor", false],
    ["calculator", "Calculator", "C", "Open the calculator", "openCalculator", false],
    ["about", "About", "i", "About WebPopcorn OS", "openAbout", false]
].forEach(([id, name, icon, description, handler, dock]) => {
    WebOSAppRegistry.register({ id, name, icon, description, handler, dock });
});
WebOSFileSystem.ensureSeeded();
WebOSAppRegistry.render();

function updateClock() {
    document.getElementById("clock").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

document.body.dataset.theme = localStorage.getItem("webos-theme") || "ocean";
updateClock();
setInterval(updateClock, 30000);
