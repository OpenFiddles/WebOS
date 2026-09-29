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
    const win = template.cloneNode(true);

    win.classList.remove("hidden");
    win.id = "Window_" + Date.now() + "_" + windowCount++;

    win.querySelector(".WindowTitleBar span").textContent = title;
    win.querySelector(".WindowBody").innerHTML = content;

    win.style.left = (40 + Math.random() * 80) + "px";
    win.style.top = (80 + Math.random() * 80) + "px";

    makeWindowDraggable(win);
    makeWindowResizable(win);
    wireWindowButtons(win);

    document.body.appendChild(win);
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
    document.getElementById("taskbar-apps").appendChild(taskButton);
    win.querySelector(".WindowTitleBar").addEventListener("pointerdown", () => focusWindow(win));
    win.addEventListener("pointerdown", () => focusWindow(win));
    focusWindow(win);
    return win;
}

/* DRAGGING */

function makeWindowDraggable(win) {
    const titleBar = win.querySelector(".WindowTitleBar");
    titleBar.addEventListener("pointerdown", (event) => {
        if (event.target.closest(".WindowButtons") || win.classList.contains("is-maximized")) return;
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
            // FIX: Explicitly release the pointer so the browser knows dragging is completely over
            titleBar.releasePointerCapture(event.pointerId); 
        };
        
        titleBar.addEventListener("pointermove", move);
        titleBar.addEventListener("pointerup", up);
    });
}

/* RESIZING */

function makeWindowResizable(win) {
    const handle = win.querySelector(".ResizeHandle");
    if (!handle) return; // Safeguard if an app window structure doesn't include a handle

    handle.addEventListener("pointerdown", (event) => {
        if (win.classList.contains("is-maximized")) return;
        event.preventDefault();
        event.stopPropagation(); // Stops interaction bubbling up to window focus rules
        
        handle.setPointerCapture(event.pointerId);
        
        const resize = (resizeEvent) => {
            win.style.width = Math.max(260, resizeEvent.clientX - win.offsetLeft) + "px";
            win.style.height = Math.max(150, resizeEvent.clientY - win.offsetTop) + "px";
        };
        
        const up = () => {
            handle.removeEventListener("pointermove", resize);
            handle.removeEventListener("pointerup", up);
            // FIX: Explicitly release the pointer capture so the resize bar returns to normal state
            handle.releasePointerCapture(event.pointerId);
        };
        
        handle.addEventListener("pointermove", resize);
        handle.addEventListener("pointerup", up);
    });
}


/* WINDOW BUTTONS */

function wireWindowButtons(win) {
    const closeBtn = win.querySelector(".Close");
    const minimizeBtn = win.querySelector(".Minimize");
    const maximizeBtn = win.querySelector(".Maximize");

    if (closeBtn) {
        closeBtn.addEventListener("pointerdown", (e) => {
            e.stopPropagation(); // Stop the click from focusing a dying window
            win.remove();
            document.querySelector(`.TaskButton[data-window-id="${win.id}"]`)?.remove();
            
            // FIX: Find the next remaining window with the highest z-index layer and focus it
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
            
            // FIX: Drop focus down to the next visible window when minimizing
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

    // 1. Clean HTML template for better maintenance
    const htmlTemplate = `
        <div class="AppPanel">
            <h2>WASM Lab</h2>
            <input id="wasm-file" type="file" accept=".wasm,application/wasm">
            <select id="wasm-export" disabled>
                <option value="">Load a module first</option>
            </select>
            <button type="button" id="wasm-run" disabled>Run export</button>
            <pre id="wasm-output" class="AppOutput">Select a local WebAssembly module.</pre>
        </div>
    `;

    const win = createWindow("WASM Lab", htmlTemplate);
    
    // Element selections
    const filePicker = win.querySelector("#wasm-file");
    const exportsMenu = win.querySelector("#wasm-export");
    const runButton = win.querySelector("#wasm-run");
    const outputArea = win.querySelector("#wasm-output");
    
    let instance = null;

    // 2. Handle parsing and instantiating the WASM file
    filePicker.onchange = async () => {
        const file = filePicker.files[0];
        if (!file) return;

        outputArea.textContent = "Compiling and instantiating module...";
        
        // Reset UI state during load
        exportsMenu.disabled = true;
        runButton.disabled = true;
        instance = null;

        try {
            const bytes = await file.arrayBuffer();
            
            // Basic sandboxed importObject. Many WASM modules expect a minimal environment (like JavaScript console or memory).
            const importObject = {
                env: {
                    memory: new WebAssembly.Memory({ initial: 256 }),
                    abort: () => console.warn("WASM module called abort()")
                }
            };

            const result = await WebAssembly.instantiate(bytes, importObject);
            instance = result.instance;

            // Generate dropdown options cleanly
            const exportNames = Object.keys(instance.exports);
            
            if (exportNames.length === 0) {
                outputArea.textContent = `Loaded ${file.name}, but it exports no properties or functions.`;
                return;
            }

            exportsMenu.innerHTML = exportNames
                .map(name => `<option value="${name}">${name}</option>`)
                .join("");

            // Re-enable controls upon successful mount
            exportsMenu.disabled = false;
            runButton.disabled = false;
            outputArea.textContent = `Successfully loaded ${file.name}. Select an exported function below.`;

        } catch (error) {
            exportsMenu.innerHTML = '<option value="">Load failed</option>';
            outputArea.textContent = `WASM instantiation failed:\n${error.message}`;
        }
    };

    // 3. Execution logic for running functions
    runButton.onclick = () => {
        if (!instance) return;

        const targetFunctionName = exportsMenu.value;
        const exportedItem = instance.exports[targetFunctionName];

        if (typeof exportedItem !== "function") {
            outputArea.textContent = `Error: "${targetFunctionName}" is an exported global/memory object, not a callable function.`;
            return;
        }

        try {
            outputArea.textContent = `Executing ${targetFunctionName}()...\n`;
            
            // Execute the WASM function
            const result = exportedItem();
            
            outputArea.textContent += `Result: ${result !== undefined ? String(result) : "void (execution finished)"}`;
        } catch (error) {
            outputArea.textContent = `Runtime Execution Error:\n${error.message}`;
        }
    };

    return win;
}


const launcherSearch = document.getElementById("launcher-search");

function openBrowser(initialUrl) {
    closeLauncher();

    // 1. Clean HTML template matching your project's architecture
    const htmlTemplate = `
        <div class="AppPanel BrowserApp">
            <form class="BrowserBar">
                <input type="url" id="browser-address" placeholder="Enter URL (https://...)" required>
                <button type="button" class="BrowserOpenExternal" title="Open in new browser tab">🌐</button>
            </form>
            <div class="BrowserContainer" style="position: relative; width: 100%; height: calc(100% - 40px);">
                <iframe class="BrowserFrame" style="width: 100%; height: 100%; border: none;"></iframe>
                <div class="BrowserHint" style="display: none; position: absolute; top: 0; left: 0; right: 0; background: #ffcccc; color: #330000; padding: 8px; text-align: center;">
                    This website might be blocking iframe preview due to X-Frame-Options.
                </div>
            </div>
        </div>
    `;

    // 2. Initialize the window canvas
    const win = createWindow("Browser", htmlTemplate);

    // Dynamic responsive sizing (Cleaned from original fragment)
    win.style.width = Math.min(window.innerWidth - 40, 900) + "px";
    win.style.height = Math.min(window.innerHeight - 110, 620) + "px";
    win.style.top = "68px";

    // 3. Cache DOM Elements
    const addressBar = win.querySelector("#browser-address");
    const frame = win.querySelector(".BrowserFrame");
    const hint = win.querySelector(".BrowserHint");
    const externalButton = win.querySelector(".BrowserOpenExternal");
    const searchForm = win.querySelector(".BrowserBar");

    let currentUrl = "";
    let frameTimer = null;

    // 4. Navigation Controller
    const navigate = (url) => {
        try {
            // Auto-prepend protocol if a user types 'example.com' instead of 'https://example.com'
            if (!/^https?:\/\//i.test(url)) {
                url = "https://" + url;
            }

            const parsed = new URL(url);
            if (!["http:", "https:"].includes(parsed.protocol)) {
                throw new Error("Unsupported protocol");
            }

            addressBar.value = parsed.href;
            currentUrl = parsed.href;
            
            // Hide previous alert banners
            hint.style.display = "none";
            clearTimeout(frameTimer);

            // Execute iframe source allocation
            frame.src = parsed.href;

            // Security warning fallback: If the page doesn't signal a load within 2 seconds,
            // assume it's highly likely being rejected by X-Frame-Options headers.
            frameTimer = setTimeout(() => {
                hint.style.display = "block";
            }, 2000);

        } catch (error) {
            addressBar.value = "";
            addressBar.placeholder = "Invalid URL. Use http:// or https:// formats.";
        }
    };

    // 5. Event Binding
    externalButton.addEventListener("click", () => {
        if (currentUrl) {
            window.open(currentUrl, "_blank", "noopener,noreferrer");
        }
    });

    frame.addEventListener("load", () => {
        // Disarm the fallback timeout warning if the source registers a successful onload trigger
        clearTimeout(frameTimer);
        
        try {
            // Check headers/titles if security context allows it (same-domain testing only)
            const title = frame.contentDocument?.title || "";
            if (title.toLowerCase().includes("refused") || title.toLowerCase().includes("blocked")) {
                hint.style.display = "block";
            }
        } catch (crossOriginError) {
            // Note: Standard browser security will throw a cross-origin DOM exception here
            // if the loaded page works but belongs to a different domain. This is normal.
        }
    });

    searchForm.addEventListener("submit", (event) => {
        event.preventDefault();
        navigate(addressBar.value);
    });

    // Run primary invocation
    navigate(initialUrl || "https://example.com"); //

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
