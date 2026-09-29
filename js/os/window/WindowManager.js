/* WINDOW CREATION */

let windowCount = 0;
let topWindowLayer = 20;

function focusWindow(win) {
    topWindowLayer += 1;
    win.style.zIndex = topWindowLayer;
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
        titleBar.addEventListener("pointermove", move);
        titleBar.addEventListener("pointerup", () => titleBar.removeEventListener("pointermove", move), { once: true });
    });
}

/* RESIZING */

function makeWindowResizable(win) {
    const handle = win.querySelector(".ResizeHandle");
    handle.addEventListener("pointerdown", (event) => {
        if (win.classList.contains("is-maximized")) return;
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        const resize = (resizeEvent) => {
            win.style.width = Math.max(260, resizeEvent.clientX - win.offsetLeft) + "px";
            win.style.height = Math.max(150, resizeEvent.clientY - win.offsetTop) + "px";
        };
        handle.addEventListener("pointermove", resize);
        handle.addEventListener("pointerup", () => handle.removeEventListener("pointermove", resize), { once: true });
    });
}

/* WINDOW BUTTONS */

function wireWindowButtons(win) {
    const closeBtn = win.querySelector(".Close");
    const minimizeBtn = win.querySelector(".Minimize");
    const maximizeBtn = win.querySelector(".Maximize");

    closeBtn.onclick = () => {
        win.remove();
        document.querySelector(`.TaskButton[data-window-id="${win.id}"]`)?.remove();
    };
    minimizeBtn.onclick = () => {
        win.classList.add("is-minimized");
        document.querySelector(`.TaskButton[data-window-id="${win.id}"]`)?.classList.remove("active");
    };
    maximizeBtn.onclick = () => {
        win.classList.toggle("is-maximized");
        focusWindow(win);
    };
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
    closeLauncher();
    return createWindow("About WebOS", '<div class="AppPanel"><h2>WebPopcorn OS</h2><p>A browser-based desktop for experiments, apps, and virtual machines.</p><ul class="AppList"><li><span>Shell</span><small>DisplayManager</small></li><li><span>Storage</span><small>Local device</small></li><li><span>Version</span><small>1.0</small></li></ul></div>');
}

function openCalculator() {
    closeLauncher();
    const content = '<iframe src="https://www.desmos.com/calculator" style="width:100%;height:100%;border:none;border-radius:12px;"></iframe>';
    createWindow("Calculator", content);
}

function openCalendar() {
    closeLauncher();
    const win = createWindow("Calendar", '<div class="AppPanel"><h2>Calendar</h2><input id="calendar-date" type="date"><textarea id="calendar-note" placeholder="Add a note for this date..."></textarea><button type="button" id="calendar-save">Save event</button><p id="calendar-status" aria-live="polite"></p></div>');
    const date = win.querySelector("#calendar-date");
    const note = win.querySelector("#calendar-note");
    date.value = new Date().toISOString().slice(0, 10);
    const key = () => "/Documents/Calendar/" + date.value + ".txt";
    date.onchange = async () => { note.value = (await WebOSFileSystem.read(key()))?.content || ""; };
    date.onchange();
    win.querySelector("#calendar-save").onclick = async () => {
        await WebOSFileSystem.putText(key(), note.value);
        win.querySelector("#calendar-status").textContent = "Saved for " + date.value;
    };
    return win;
}

function openSystemMonitor() {
    closeLauncher();
    const win = createWindow("System Monitor", '<div class="AppPanel"><h2>System Monitor</h2><ul class="AppList" id="system-stats"></ul></div>');
    const stats = win.querySelector("#system-stats");
    const update = () => {
        const rows = [
            ["Windows", document.querySelectorAll(".WindowDesign:not(#WindowTemplate):not(.is-minimized)").length],
            ["Storage", "IndexedDB filesystem"],
            ["Memory", performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + " MB" : "Browser managed"]
        ];
        stats.replaceChildren(...rows.map(([label, value]) => {
            const item = document.createElement("li");
            item.innerHTML = `<span>${label}</span><small>${value}</small>`;
            return item;
        }));
    };
    update();
    return win;
}

function openWasmLab() {
    closeLauncher();
    const win = createWindow("WASM Lab", '<div class="AppPanel"><h2>WASM Lab</h2><input id="wasm-file" type="file" accept=".wasm,application/wasm"><select id="wasm-export"><option>Load a module first</option></select><button type="button" id="wasm-run">Run export</button><pre id="wasm-output" class="AppOutput">Select a local WebAssembly module.</pre></div>');
    const picker = win.querySelector("#wasm-file");
    const exportsMenu = win.querySelector("#wasm-export");
    const output = win.querySelector("#wasm-output");
    let instance;
    picker.onchange = async () => {
        const file = picker.files[0];
        if (!file) return;
        try {
            const bytes = await file.arrayBuffer();
            const result = await WebAssembly.instantiate(bytes, {});
            instance = result.instance;
            exportsMenu.replaceChildren(...Object.keys(instance.exports).map((name) => new Option(name, name)));
            output.textContent = "Loaded " + file.name + ". Select an exported function.";
        } catch (error) {
            output.textContent = "WASM load failed: " + error.message;
        }
    };
    win.querySelector("#wasm-run").onclick = () => {
        if (!instance) return;
        const name = exportsMenu.value;
        const exported = instance.exports[name];
        if (typeof exported !== "function") {
            output.textContent = name + " is not a callable function.";
            return;
        }
        try {
            output.textContent = name + "() => " + String(exported());
        } catch (error) {
            output.textContent = "Export failed: " + error.message;
        }

            .AppIcon.is-selected {
                outline: 2px solid var(--accent);
                outline-offset: 3px;
                transform: translateY(-3px);
            }
    };
    return win;
}
            const launcherSearch = document.getElementById("launcher-search");

function openBrowser(initialUrl) {
    closeLauncher();
                launcherSearch.focus();
                launcherSearch.select();
    win.style.width = Math.min(window.innerWidth - 40, 900) + "px";
    win.style.height = Math.min(window.innerHeight - 110, 620) + "px";
            launcherSearch.addEventListener("input", (event) => {
    win.style.top = "68px";

                    icon.hidden = query !== "" && !icon.dataset.search.includes(query);
    const frame = win.querySelector(".BrowserFrame");
                const firstVisible = document.querySelector(".AppIcon:not([hidden])");
                document.querySelectorAll(".AppIcon").forEach((icon) => icon.classList.remove("is-selected"));
                if (firstVisible) firstVisible.classList.add("is-selected");
    const hint = win.querySelector(".BrowserHint");

            launcherSearch.addEventListener("keydown", (event) => {
                const visibleApps = [...document.querySelectorAll(".AppIcon:not([hidden])")];
                if (!visibleApps.length) return;
                const selectedIndex = visibleApps.findIndex((icon) => icon.classList.contains("is-selected"));
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    const direction = event.key === "ArrowDown" ? 1 : -1;
                    const nextIndex = (selectedIndex + direction + visibleApps.length) % visibleApps.length;
                    visibleApps.forEach((icon, index) => icon.classList.toggle("is-selected", index === nextIndex));
                    visibleApps[nextIndex].scrollIntoView({ block: "nearest" });
                }
                if (event.key === "Enter") {
                    event.preventDefault();
                    visibleApps[selectedIndex < 0 ? 0 : selectedIndex].click();
                }
            });
    const externalButton = win.querySelector(".BrowserOpenExternal");
    let currentUrl = "";
    let frameTimer;
    const navigate = (url) => {
        try {
            const parsed = new URL(url);
            if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("unsupported protocol");
            address.value = parsed.href;
            currentUrl = parsed.href;
            hint.classList.remove("visible");
            clearTimeout(frameTimer);
            frame.src = parsed.href;
            frameTimer = setTimeout(() => hint.classList.add("visible"), 1800);
        } catch (error) {
            address.value = "";
            address.placeholder = "Only http:// and https:// URLs are supported";
        }
    };
    externalButton.addEventListener("click", () => window.open(currentUrl, "_blank", "noopener,noreferrer"));
    frame.addEventListener("load", () => {
        try {
            const title = frame.contentDocument?.title || "";
            if (title.toLowerCase().includes("refused") || title.toLowerCase().includes("blocked")) hint.classList.add("visible");
        } catch (error) {}
    });
    win.querySelector(".BrowserBar").addEventListener("submit", (event) => {
        event.preventDefault();
        navigate(address.value);
    });
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
</script>