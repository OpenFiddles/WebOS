import { closeLauncher } from "./Launcher.js"
function openNotes() {
    // Fail-safe launcher check
    if (typeof closeLauncher === "function") closeLauncher();

    // Semantic, split-pane layout structural template
    const notesHTML = `
        <div class="notes-app-container">
            <div class="notes-toolbar">
                <button type="button" class="notes-btn save-btn" id="notes-save">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                    Save Note
                </button>
                <span class="notes-status-text" id="notes-status" aria-live="polite">Ready</span>
            </div>
            <div class="notes-workspace">
                <div class="notes-pane editor-pane">
                    <div class="pane-label">Markdown Input</div>
                    <textarea id="notes-editor" placeholder="# Hello World\\n\\nWrite some **markdown** here...\\n- Bullet items\\n- *Italics* work too!"></textarea>
                </div>
                <div class="notes-pane preview-pane">
                    <div class="pane-label">Live Preview</div>
                    <div id="notes-preview" class="markdown-body"></div>
                </div>
            </div>
        </div>
    `;

    const win = createWindow("Notes & Markdown Editor", notesHTML);
    
    const editor = win.querySelector("#notes-editor");
    const preview = win.querySelector("#notes-preview");
    const saveBtn = win.querySelector("#notes-save");
    const status = win.querySelector("#notes-status");

    // Highly efficient lightweight Vanilla JS Markdown Parser engine
        function parseMarkdown(markdownText) {
            if (!markdownText) return "";
            
            // 1. Sanitize HTML input injection vulnerabilities
            let html = markdownText
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
    
            // 2. Parse Headers, inline text styling, and lists
            html = html
                .replace(/^### (.*)\$/gim, '<h3>\$1</h3>')              // H3 Headers
                .replace(/^## (.*)\$/gim, '<h2>\$1</h2>')               // H2 Headers
                .replace(/^# (.*)\$/gim, '<h1>\$1</h1>')                // H1 Headers
                .replace(/\*\*(.*?)\*\*/gim, '<strong>\$1</strong>')   // Bold text **bold**
                .replace(/\*(.*?)\*/gim, '<em>\$1</em>')               // Italic text *italic*
                .replace(/`(.*?)`/gim, '<code>\$1</code>')             // Inline Code blocks `code`
                .replace(/^\s*-\s(.*)\$/gim, '<li>\$1</li>');           // List items - item
    
            // 3. Wrap adjacent list items gracefully into semantic UL structures
            html = html.replace(/(<li>.*?<\/li>)(?:\s*\n?\s*(<li>.*?<\/li>))*/gim, function(match) {
                return '<ul>' + match + '</ul>';
            });
    
            // 4. Structural paragraph blocks split on double lines breaks or individual cleanup
            return html.split(/\n\n+/).map(p => {
                const trimmed = p.trim();
                if (!trimmed) return '';
                // Skip structural paragraph elements if they are already standard layout blocks
                if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<li')) {
                    return trimmed;
                }
                return `<p>${trimmed.replace(/\n/g, '<br />')}</p>`; // Converts single returns to line breaks inside paragraphs
            }).join('');
        }
    

    // Trigger parsing update dynamically when typing
    editor.addEventListener("input", () => {
        preview.innerHTML = parseMarkdown(editor.value);
    });

    // Unified Virtual File Tree & LocalStorage reading stack
    if (typeof WebOSFileSystem !== "undefined" && WebOSFileSystem.read) {
        WebOSFileSystem.read("/Documents/Notes.md").then((entry) => {
            const rawContent = entry?.content || localStorage.getItem("webos-notes-md") || "";
            editor.value = rawContent;
            preview.innerHTML = parseMarkdown(rawContent);
        }).catch(() => {
            // Fallback safety if file path does not exist yet
            const fallbackContent = localStorage.getItem("webos-notes-md") || "";
            editor.value = fallbackContent;
            preview.innerHTML = parseMarkdown(fallbackContent);
        });
    } else {
        const localOnly = localStorage.getItem("webos-notes-md") || "";
        editor.value = localOnly;
        preview.innerHTML = parseMarkdown(localOnly);
    }

    // Save event processing hook
    saveBtn.addEventListener("click", () => {
        const dataValue = editor.value;
        
        const executeLocalSave = () => {
            localStorage.setItem("webos-notes-md", dataValue);
            status.textContent = "Saved at " + new Date().toLocaleTimeString();
            status.classList.add("success");
            setTimeout(() => status.classList.remove("success"), 3000);
        };

        if (typeof WebOSFileSystem !== "undefined" && WebOSFileSystem.putText) {
            WebOSFileSystem.putText("/Documents/Notes.md", dataValue)
                .then(executeLocalSave)
                .catch(err => {
                    console.error("FS error, saving locally:", err);
                    executeLocalSave();
                });
        } else {
            executeLocalSave();
        }
    });

    return win;
}

function openFiles() {
    if (typeof closeLauncher === "function") closeLauncher();

    // Clean structural template designed to mimic native operating system environments
    const filesAppHTML = `
        <div class="files-app-container">
            <header class="files-app-toolbar">
                <div class="toolbar-nav-group">
                    <button type="button" class="files-icon-btn" id="file-back" title="Go Up A Folder">⬆ Back</button>
                    <span class="files-path-breadcrumb" id="files-current-path">/</span>
                </div>
                <div class="toolbar-action-group">
                    <button type="button" class="files-action-btn" id="new-file">＋ New File</button>
                    <button type="button" class="files-action-btn variant-secondary" id="upload-file">🗂 Import File</button>
                    <input id="file-picker" type="file" style="display: none;">
                </div>
            </header>
            
            <main class="files-grid-workspace">
                <ul class="files-node-list" id="file-list"></ul>
            </main>

            <footer class="files-statusbar">
                <span id="file-status" aria-live="polite">IndexedDB File System Active</span>
            </footer>
        </div>
    `;

    const win = createWindow("File Explorer", filesAppHTML);
    
    const list = win.querySelector("#file-list");
    const status = win.querySelector("#file-status");
    const pathIndicator = win.querySelector("#files-current-path");
    const picker = win.querySelector("#file-picker");
    const backBtn = win.querySelector("#file-back");

    // Keep track of the real state context of directory navigation
    let currentPath = "/";

    const renderFiles = async () => {
        list.replaceChildren();
        pathIndicator.textContent = currentPath;
        
        // Disable back button at root directory index properties
        backBtn.disabled = currentPath === "/";

        try {
            // Read records safely using your database abstraction layers
            const entries = await window.WebOSFileSystem.list(currentPath);
            
            if (entries.length === 0) {
                const emptyMsg = document.createElement("div");
                emptyMsg.className = "files-empty-state-notice";
                emptyMsg.textContent = "This folder workspace is empty.";
                list.appendChild(emptyMsg);
                return;
            }

            entries.forEach((entry) => {
                const item = document.createElement("li");
                item.className = `file-node-item ${entry.type === "directory" ? "node-type-folder" : "node-type-file"}`;
                
                const nodeName = entry.path.split("/").pop() || "/";
                const displaySize = entry.type === "directory" ? "System Folder" : (entry.content ? formatBytes(entry.content.length) : "0 Bytes");
                
                item.innerHTML = `
                    <div class="node-meta-wrapper">
                        <span class="node-graphic-icon">${entry.type === "directory" ? "📁" : "📄"}</span>
                        <div class="node-text-details">
                            <span class="node-filename-label">${nodeName}</span>
                            <small class="node-filesize-sublabel">${displaySize}</small>
                        </div>
                    </div>
                    <button type="button" class="node-delete-trigger-btn" title="Delete Permanent Item">×</button>
                `;

                // Single click routing for directory jumps
                item.addEventListener("click", (e) => {
                    if (e.target.classList.contains("node-delete-trigger-btn")) return;
                    
                    if (entry.type === "directory") {
                        currentPath = entry.path;
                        renderFiles();
                    }
                });

                // Double click behavior mappings
                if (entry.type === "file") {
                    item.title = "Double-click to view asset contents";
                    item.addEventListener("dblclick", async () => {
                        const file = await window.WebOSFileSystem.read(entry.path);
                        
                        // INTEGRATION HOOK: If file extension matches Markdown format rules, trigger notes app!
                        if (nodeName.toLowerCase().endsWith(".md") && typeof openNotes === "function") {
                            openNotes();
                        } else {
                            // Unified plaintext edit interface template fallback
                            const cleanTextValue = file ? file.content : "";
                            const editorWin = createWindow(nodeName, `
                                <div class="file-editor-container">
                                    <textarea class="raw-code-textarea">${cleanTextValue}</textarea>
                                    <div class="editor-action-footer">
                                        <button type="button" class="editor-save-action-btn">Save Changes</button>
                                    </div>
                                </div>
                            `);
                            
                            editorWin.querySelector(".editor-save-action-btn").onclick = async function() {
                                const activeTextData = editorWin.querySelector(".raw-code-textarea").value;
                                await window.WebOSFileSystem.putText(entry.path, activeTextData);
                                status.textContent = `Updates verified on path: ${nodeName}`;
                                renderFiles();
                            };
                        }
                    });
                }

                // Delete behavior linked safely to your background .remove method
                item.querySelector(".node-delete-trigger-btn").onclick = async (e) => {
                    e.stopPropagation();
                    if (confirm(`Confirm permanent erasure sequence for node: ${nodeName}?`)) {
                        await window.WebOSFileSystem.remove(entry.path);
                        status.textContent = `Removed item: ${nodeName}`;
                        renderFiles();
                    }
                };

                list.appendChild(item);
            });
        } catch (err) {
            status.textContent = "Error parsing file nodes layer structures.";
            console.error(err);
        }
    };

    // Navigational directory backtracking algorithm
    backBtn.onclick = () => {
        if (currentPath === "/") return;
        const segments = currentPath.split("/").filter(Boolean);
        segments.pop();
        currentPath = "/" + segments.join("/");
        renderFiles();
    };

    // Virtual asset registration prompt paths matching database logic
    win.querySelector("#new-file").onclick = async () => {
        const name = window.prompt("Enter filename with extension (e.g. todo.txt, readme.md):", "document.txt");
        if (!name) return;
        
        // Calculate correct absolute database path values safely
        const prefixPath = currentPath === "/" ? "" : currentPath;
        const resolvedPath = `${prefixPath}/${name.replace(/^\/+/, "")}`;
        
        await window.WebOSFileSystem.putText(resolvedPath, "");
        status.textContent = `Created asset: ${name}`;
        renderFiles();
    };

    // Bind physical file system multi-format upload loops
    win.querySelector("#upload-file").onclick = () => picker.click();
    picker.onchange = async () => {
        const file = picker.files[0];
        if (!file) return;
        
        const prefixPath = currentPath === "/" ? "" : currentPath;
        const targetPath = `${prefixPath}/${file.name}`;
        const dataBody = await file.text();
        
        await window.WebOSFileSystem.putText(targetPath, dataBody);
        status.textContent = `Successfully uploaded file item: ${file.name}`;
        renderFiles();
    };

    // Human-readable size calculations matching backend properties
    function formatBytes(bytes) {
        if (bytes === 0 || !bytes) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    renderFiles();
    return win;
}

function openSettings() {
    if (typeof closeLauncher === "function") closeLauncher();

    // 1. Separate HTML template definition cleanly inside the functional block
    const htmlTemplate = `
        <div class="AppPanel" style="display: flex; flex-direction: column; gap: 1.5rem; max-width: 500px;">
            <!-- SYSTEM PREFERENCES SECTION -->
            <section class="settings-section" style="display: flex; flex-direction: column; gap: 1rem;">
                <h2>Better Settings</h2>
                
                <div class="setting-field" style="display: flex; flex-direction: column; gap: 0.25rem;">
                    <label for="theme-choice">Accent theme</label>
                    <select id="theme-choice" style="padding: 0.4rem; border-radius: 4px;">
                        <option value="ocean">Ocean</option>
                        <option value="mint">Mint</option>
                        <option value="sunset">Sunset</option>
                    </select>
                </div>
                
                <div class="setting-field">
                    <label style="display: inline-flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input id="motion-choice" type="checkbox"> Reduce motion
                    </label>
                </div>
            </section>

            <hr style="border: 0; border-top: 1px solid rgba(128,128,128,0.2); margin: 0.5rem 0;" />

            <!-- LIVE ELEMENT VISUAL INSPECTOR (SPECTATE) SECTION -->
            <section class="settings-section" style="display: flex; flex-direction: column; gap: 1rem;">
                <h2>Visual CSS Inspector</h2>
                
                <div class="inspector-controls" style="display: flex; align-items: center; gap: 1rem;">
                    <button type="button" id="btn-spectate" style="padding: 0.5rem 1rem; cursor: pointer;">
                        🎯 Start Spectating
                    </button>
                    <span id="inspector-hint" style="font-size: 0.85rem; opacity: 0.7;">Click button, then hover over desktop elements</span>
                </div>

                <div class="setting-field" style="display: flex; flex-direction: column; gap: 0.25rem;">
                    <label for="ins-selector">Selected Element Target</label>
                    <input type="text" id="ins-selector" readonly placeholder="No element selected yet..." style="padding: 0.4rem; background: rgba(0,0,0,0.05); border: 1px solid rgba(128,128,128,0.3); border-radius: 4px;" />
                </div>

                <!-- LAYOUT PROPERTY INPUT GRID -->
                <div class="css-inputs-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                    <div class="setting-field" style="display: flex; flex-direction: column; gap: 0.25rem;">
                        <label for="css-background">Background</label>
                        <input type="text" id="css-background" class="css-prop-field" placeholder="e.g., #222 or red" style="padding: 0.4rem; border-radius: 4px;" />
                    </div>
                    <div class="setting-field" style="display: flex; flex-direction: column; gap: 0.25rem;">
                        <label for="css-color">Text Color</label>
                        <input type="text" id="css-color" class="css-prop-field" placeholder="e.g., #fff" style="padding: 0.4rem; border-radius: 4px;" />
                    </div>
                    <div class="setting-field" style="display: flex; flex-direction: column; gap: 0.25rem;">
                        <label for="css-border">Border</label>
                        <input type="text" id="css-border" class="css-prop-field" placeholder="e.g., 2px solid red" style="padding: 0.4rem; border-radius: 4px;" />
                    </div>
                    <div class="setting-field" style="display: flex; flex-direction: column; gap: 0.25rem;">
                        <label for="css-font-size">Font Size</label>
                        <input type="text" id="css-font-size" class="css-prop-field" placeholder="e.g., 16px" style="padding: 0.4rem; border-radius: 4px;" />
                    </div>
                </div>

                <div class="inspector-actions" style="display: flex; gap: 0.5rem; margin-top: 0.25rem;">
                    <button type="button" id="btn-save-css" disabled style="padding: 0.4rem 0.8rem; cursor: pointer;">Save Styles</button>
                    <button type="button" id="btn-clear-css" style="padding: 0.4rem 0.8rem; cursor: pointer;">Clear All Changes</button>
                </div>
            </section>

            <hr style="border: 0; border-top: 1px solid rgba(128,128,128,0.2); margin: 0.5rem 0;" />

            <!-- SYSTEM DATA MANAGEMENT SECTION -->
            <section class="settings-section" style="display: flex; flex-direction: column; gap: 0.75rem;">
                <button type="button" id="clear-storage">Reset WebOS data</button>
                <p id="settings-status" style="font-size: 0.9rem; margin: 0; opacity: 0.8;">Changes are saved on this device.</p>
            </section>
        </div>
    `;

    // 2. Initialize application UI layout window context
    const win = createWindow("Better Settings", htmlTemplate);
    
    // Ensure our global injection style element target path exists
    let styleElement = document.getElementById("custom-user-styles");
    if (!styleElement) {
        styleElement = document.createElement("style");
        styleElement.id = "custom-user-styles";
        document.head.appendChild(styleElement);
    }

    // 3. Extract active DOM element bindings from compiled frame template
    const choice = win.querySelector("#theme-choice");
    const motion = win.querySelector("#motion-choice");
    const status = win.querySelector("#settings-status");
    
    const btnSpectate = win.querySelector("#btn-spectate");
    const hintText = win.querySelector("#inspector-hint");
    const insSelectorInput = win.querySelector("#ins-selector");
    const cssInputs = win.querySelectorAll(".css-prop-field");
    const btnSaveCss = win.querySelector("#btn-save-css");
    const btnClearCss = win.querySelector("#btn-clear-css");

    let isSpectating = false;
    let selectedDomSelector = "";

    // 4. Set initialization states based on storage settings
    const selectedTheme = localStorage.getItem("webos-theme") || "ocean";
    choice.value = selectedTheme;
    motion.checked = localStorage.getItem("webos-reduced-motion") === "true";

    // 5. System Configuration Event Handlers
    choice.addEventListener("change", () => {
        localStorage.setItem("webos-theme", choice.value);
        document.body.dataset.theme = choice.value;
    });

    motion.addEventListener("change", () => {
        localStorage.setItem("webos-reduced-motion", motion.checked);
        document.documentElement.style.setProperty("--motion-scale", motion.checked ? "0" : "1");
    });

    win.querySelector("#clear-storage").onclick = async () => {
        if (typeof WebOSFileSystem !== "undefined" && WebOSFileSystem.remove) {
            await WebOSFileSystem.remove("/Documents/Notes.txt").catch(() => {});
        }
        localStorage.clear();
        styleElement.textContent = "";
        status.textContent = "All layout styles and application data reset.";
        setTimeout(() => location.reload(), 1200);
    };

    /* ---------- GLOBAL DESKTOP ELEMENT SPECTATOR HOOKS ---------- */

    function generateUniqueSelector(el) {
        if (!(el instanceof Element)) return "";
        if (el.id) return `#${el.id}`;
        
        let path = [];
        while (el && el.nodeType === Node.ELEMENT_NODE) {
            let selector = el.nodeName.toLowerCase();
            if (el.className && typeof el.className === "string") {
                const classes = el.className.trim().split(/\s+/).filter(c => c && !c.includes("inspect"));
                if (classes.length) selector += `.${classes.join(".")}`;
            }
            if (el.id) {
                selector = `#${el.id}`;
                path.unshift(selector);
                break;
            }
            path.unshift(selector);
            el = el.parentNode;
        }
        return path.join(" > ");
    }

    function onWorkspaceMouseOver(e) {
        if (win.contains(e.target)) return;
        e.target.style.outline = "2px dashed #007acc";
    }

    function onWorkspaceMouseOut(e) {
        if (win.contains(e.target)) return;
        e.target.style.outline = "";
    }

    function onWorkspaceClick(e) {
        if (win.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();

        selectedDomSelector = generateUniqueSelector(e.target);
        insSelectorInput.value = selectedDomSelector;
        e.target.style.outline = "";

        // Pull out and check current main style sheet code states dynamically
        cssInputs.forEach(input => {
            const propName = input.id.replace("css-", "");
            const regex = new RegExp(`${selectedDomSelector.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*{[^}]*?${propName}:\\s*([^;!]+)[^}]*?}`, "i");
            const match = styleElement.textContent.match(regex);
            input.value = match ? match.trim() : "";
        });

        btnSaveCss.disabled = false;
        stopSpectatingMode();
    }

    function startSpectatingMode() {
        isSpectating = true;
        btnSpectate.textContent = "🛑 Stop";
        hintText.textContent = "Click targeted canvas component...";
        document.addEventListener("mouseover", onWorkspaceMouseOver, true);
        document.addEventListener("mouseout", onWorkspaceMouseOut, true);
        document.addEventListener("click", onWorkspaceClick, true);
    }

    function stopSpectatingMode() {
        isSpectating = false;
        btnSpectate.textContent = "🎯 Start Spectating";
        hintText.textContent = selectedDomSelector ? "Target locked!" : "Hover over desktop components";
        document.removeEventListener("mouseover", onWorkspaceMouseOver, true);
        document.removeEventListener("mouseout", onWorkspaceMouseOut, true);
        document.removeEventListener("click", onWorkspaceClick, true);
    }

    btnSpectate.onclick = () => {
        if (isSpectating) stopSpectatingMode(); else startSpectatingMode();
    };

    /* ---------- MAIN MODIFICATION WRITER ENGINE ---------- */

    btnSaveCss.onclick = () => {
        if (!selectedDomSelector) return;

        let currentStyleSheet = styleElement.textContent;

        // Wipe old versions of this rule sequence block out of the stylesheet string text
        const cleanRegex = new RegExp(`${selectedDomSelector.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*{[\\s\\S]*?}\\s*`, "gi");
        currentStyleSheet = currentStyleSheet.replace(cleanRegex, "");

        // Build string block text sequence parameters
        let rulesBlock = [];
        cssInputs.forEach(input => {
            const propName = input.id.replace("css-", "");
            if (input.value.trim() !== "") {
                rulesBlock.push(`  ${propName}: ${input.value.trim()} !important;`);
            }
        });

        if (rulesBlock.length > 0) {
            currentStyleSheet += `${selectedDomSelector} {
${rulesBlock.join("\n")}
}
`;
        }

        styleElement.textContent = currentStyleSheet;
        localStorage.setItem("webos-custom-css", currentStyleSheet);
        status.textContent = "Injected styles updated inside the global CSS script wrapper.";
    };

    btnClearCss.onclick = () => {
        if (confirm("Reset all custom injected CSS modifications?")) {
            styleElement.textContent = "";
            localStorage.removeItem("webos-custom-css");
            insSelectorInput.value = "";
            cssInputs.forEach(input => input.value = "");
            btnSaveCss.disabled = true;
            status.textContent = "Global custom stylesheet wiped.";
        }
    };

    win.addEventListener("onclose", () => {
        if (isSpectating) stopSpectatingMode();
    });

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
    if (typeof closeLauncher === "function") closeLauncher();

    // 1. Controller Layout Panel Template
    const htmlTemplate = `
        <div class="AppPanel" style="padding: 15px; font-family: sans-serif; display: flex; flex-direction: column; gap: 12px; height: 100%; box-sizing: border-box;">
            <h2 style="margin: 0 0 5px 0; font-size: 1.2rem;">WASM Lab</h2>
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 0.85rem; opacity: 0.8;">Select WebAssembly Binary (.wasm)</label>
                <input id="wasm-file" type="file" accept=".wasm,application/wasm" style="width: 100%;">
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 0.85rem; opacity: 0.8;">Exported Entrypoints</label>
                <select id="wasm-export" disabled style="padding: 6px; width: 100%; border-radius: 4px; border: 1px solid #ccc; background: #fff; color: #000;">
                    <option value="">Load a module first</option>
                </select>
            </div>
            
            <button type="button" id="wasm-run" disabled style="padding: 10px 12px; font-weight: bold; border-radius: 4px; cursor: pointer; border: none; background: #007acc; color: #fff;">
                🚀 Spawn Sandbox Window
            </button>
            <pre id="wasm-output" class="AppOutput" style="margin: 0; padding: 10px; flex-grow: 1; overflow: auto; background: #1e1e1e; color: #d4d4d4; font-family: monospace; border-radius: 4px; font-size: 0.9rem; min-height: 80px; white-space: pre-wrap; word-break: break-all;">Awaiting local binary allocation.</pre>
        </div>
    `;

    const win = createWindow("WASM Lab", htmlTemplate);
    
    const filePicker = win.querySelector("#wasm-file");
    const exportsMenu = win.querySelector("#wasm-export");
    const runButton = win.querySelector("#wasm-run");
    const outputArea = win.querySelector("#wasm-output");
    
    let compiledModuleBytes = null; // Store buffer so we can spin up infinite isolated instances
    let currentFileName = "";

    // 2. Binary Buffer Reader Engine
    filePicker.onchange = async () => {
        const file = filePicker.files[0];
        if (!file) return;

        outputArea.textContent = "Parsing and mapping symbols...";
        exportsMenu.disabled = true;
        runButton.disabled = true;
        compiledModuleBytes = null;
        currentFileName = file.name;

        try {
            // Read into shared raw array buffer
            compiledModuleBytes = await file.arrayBuffer();

            // Perform a safe lightweight dry-run compilation step to index exported names
            const mockImport = { env: { abort: () => {}, print: () => {}, printErr: () => {} } };
            const dryRun = await WebAssembly.instantiate(compiledModuleBytes, mockImport);
            
            const exportNames = Object.keys(dryRun.instance.exports).filter(name => {
                return typeof dryRun.instance.exports[name] === "function";
            });
            
            if (exportNames.length === 0) {
                outputArea.textContent = `Error: "${file.name}" compiles successfully but leaks no callable functional entrypoints.`;
                return;
            }

            // Populate selector with functional modules
            exportsMenu.innerHTML = exportNames
                .map(name => `<option value="${name}">${name}()</option>`)
                .join("");

            exportsMenu.disabled = false;
            runButton.disabled = false;
            outputArea.textContent = `Successfully indexed ${file.name}.\nChoose an entrypoint and launch an isolated execution window container.`;

        } catch (error) {
            exportsMenu.innerHTML = '<option value="">Compilation Failure</option>';
            outputArea.textContent = `Static Validation Error:\n${error.message}`;
        }
    };

    // 3. Isolated Dynamic Sandbox Window Spawner Loop
    runButton.onclick = async () => {
        if (!compiledModuleBytes) return;

        const selectedFunc = exportsMenu.value;

        // Visual layout wrapper shell template for the secondary execution window
        const sandboxTemplate = `
            <div class="AppPanel" style="padding: 15px; font-family: sans-serif; display: flex; flex-direction: column; gap: 10px; height: 100%; box-sizing: border-box;">
                <div style="font-size: 0.85rem; opacity: 0.7;">
                    Instance: <strong style="color: #007acc;">${currentFileName}</strong> → <code>${selectedFunc}()</code>
                </div>
                <pre class="sandbox-console" style="margin: 0; padding: 12px; flex-grow: 1; overflow: auto; background: #0c0c0c; color: #39ff14; font-family: monospace; border-radius: 4px; font-size: 0.85rem; white-space: pre-wrap; box-shadow: inset 0 0 10px rgba(0,0,0,0.8);"></pre>
                <div style="text-align: right;">
                    <button type="button" class="sandbox-re-run" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 3px; border: 1px solid #555; background: #222; color: #fff; cursor: pointer;">Re-run Routine</button>
                </div>
            </div>
        `;

        // Spawn a brand new window container inside your Desktop OS framework
        const sandboxWin = createWindow(`Sandbox [${selectedFunc}]`, sandboxTemplate);
        const consoleArea = sandboxWin.querySelector(".sandbox-console");
        const reRunBtn = sandboxWin.querySelector(".sandbox-re-run");

        // Isolated terminal logger bound strictly to this specific window context instance
        const logToSandbox = (msg, type = "out") => {
            const prefix = type === "err" ? "[WASM Error]" : "[WASM Out]";
            consoleArea.textContent += `${prefix} ${msg}\n`;
            consoleArea.scrollTop = consoleArea.scrollHeight;
        };

        // Execution engine routine loop wrapper context closures
        async function executeWasmInstance() {
            consoleArea.textContent = `[System] Initializing runtime context micro-vm...\n`;
            
            try {
                // Setup standalone context import tables tracking to this specific console layer
                const runtimeImports = {
                    env: {
                        abort: (msg) => logToSandbox(`Aborted: ${msg}`, "err"),
                        print: (msg) => logToSandbox(msg, "out"),
                        printErr: (msg) => logToSandbox(msg, "err")
                    }
                };

                // Instantiate fresh isolated WebAssembly memory segments inside this viewport
                const moduleInstance = await WebAssembly.instantiate(compiledModuleBytes, runtimeImports);
                const targetRoutine = moduleInstance.instance.exports[selectedFunc];

                logToSandbox(`Calling entrypoint stack...`);
                const startTime = performance.now();
                
                // Execute execution loop instructions natively
                const executionResult = targetRoutine();
                
                const totalDuration = (performance.now() - startTime).toFixed(3);

                consoleArea.textContent += `\n[System] Complete execution lifecycle cleanly in ${totalDuration}ms.`;
                consoleArea.textContent += `\n[System] Return Matrix: ${executionResult !== undefined ? String(executionResult) : "void (0)"}\n`;

            } catch (runtimeError) {
                consoleArea.textContent += `\n❌ Pipeline Runtime Exception:\n${runtimeError.message}\n`;
            }
            consoleArea.scrollTop = consoleArea.scrollHeight;
        }

        // Connect hot reload rerun action hook processing sequence directly
        reRunBtn.onclick = () => {
            executeWasmInstance();
        };

        // Fire off baseline context initialization loops natively
        executeWasmInstance();
    };

    return win;
}


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
function openAppCreator() {
    if (typeof closeLauncher === "function") closeLauncher();

    // 1. Monolithic self-contained component GUI template literal string
    const htmlTemplate = `
        <div class="AppPanel" style="padding: 15px; font-family: sans-serif; display: flex; flex-direction: column; gap: 12px; height: 100%; box-sizing: border-box; max-width: 650px;">
            <h2 style="margin: 0 0 4px 0; font-size: 1.2rem;">App Creator Studio</h2>
            <p style="margin: 0 0 4px 0; font-size: 0.85rem; opacity: 0.75;">Design, configure, and inject software components natively into the desktop matrix runtime.</p>
            
            <!-- APP MANIFEST CONFIGURATION CONTROLS -->
            <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 10px;">
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; flex-direction: column; gap: 3px;">
                        <label for="creator-id" style="font-size: 0.8rem; font-weight: bold;">App ID (No spaces)</label>
                        <input type="text" id="creator-id" placeholder="my-custom-app" style="padding: 5px; border-radius: 4px; border: 1px solid #ccc;">
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 3px;">
                        <label for="creator-name" style="font-size: 0.8rem; font-weight: bold;">Display Name</label>
                        <input type="text" id="creator-name" placeholder="My Custom App" style="padding: 5px; border-radius: 4px; border: 1px solid #ccc;">
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 3px;">
                        <label for="creator-icon" style="font-size: 0.8rem; font-weight: bold;">Icon (Emoji / Character)</label>
                        <input type="text" id="creator-icon" placeholder="🚀" maxlength="4" style="padding: 5px; text-align: center; border-radius: 4px; border: 1px solid #ccc;">
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 5px;">
                        <label style="font-size: 0.8rem; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                            <input id="creator-dock" type="checkbox" checked> Pin to Desktop Dock
                        </label>
                    </div>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 3px;">
                    <label for="creator-desc" style="font-size: 0.8rem; font-weight: bold;">Application Description</label>
                    <textarea id="creator-desc" placeholder="What does this components stack do?" style="padding: 5px; height: 100%; min-height: 110px; border-radius: 4px; border: 1px solid #ccc; resize: none;"></textarea>
                </div>
            </div>

            <!-- JAVASCRIPT LOGIC EDITOR CANVAS -->
            <div style="display: flex; flex-direction: column; gap: 4px; flex-grow: 1;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label for="creator-code" style="font-size: 0.8rem; font-weight: bold;">Handler Execution Code (JavaScript)</label>
                    <span style="font-size: 0.75rem; opacity: 0.6; font-family: monospace;">Arguments: (api, arg)</span>
                </div>
                <textarea id="creator-code" style="margin: 0; padding: 10px; width: 100%; flex-grow: 1; min-height: 180px; background: #1e1e1e; color: #d4d4d4; font-family: monospace; border-radius: 4px; border: none; font-size: 0.85rem; box-sizing: border-box; white-space: pre;" spellcheck="false"></textarea>
            </div>

            <!-- COMPONENT INJECTION SUBMIT BUTTON -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span id="creator-status" style="font-size: 0.85rem; font-weight: bold; transition: color 0.2s;">Ready to compile component...</span>
                <button type="button" id="btn-compile-app" style="padding: 8px 20px; font-weight: bold; border-radius: 4px; cursor: pointer; border: none; background: #007acc; color: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                    🛠️ Compile & Install App
                </button>
            </div>
        </div>
    `;

    const win = createWindow("App Creator Studio", htmlTemplate);

    // Context mappings to elements inside the window container
    const appIdInput = win.querySelector("#creator-id");
    const appNameInput = win.querySelector("#creator-name");
    const appIconInput = win.querySelector("#creator-icon");
    const appDescInput = win.querySelector("#creator-desc");
    const appDockCheck = win.querySelector("#creator-dock");
    const appCodeInput = win.querySelector("#creator-code");
    const btnCompile = win.querySelector("#btn-compile-app");
    const statusText = win.querySelector("#creator-status");

    // Populate boilerplate structure inside the input panel immediately
    appCodeInput.value = `// The system passes your sandboxed filesystem connection handle as 'api'
const htmlContent = \`
    <div class="AppPanel" style="padding: 15px;">
        <h3>Welcome to my Application Template</h3>
        <button id="alert-trigger">Click Action</button>
    </div>
\`;

const appWin = window.createWindow("New App Window", htmlContent);

// Add custom event hooks easily using scoped selectors
appWin.querySelector("#alert-trigger").onclick = () => {
    alert("Application logic triggered successfully!");
};

return appWin;`;

    /* ---------- CORE HOT-COMPILATION ENGINE ---------- */

    btnCompile.onclick = async () => {
        // Clean and format parameter variables
        const rawId = appIdInput.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
        const appName = appNameInput.value.trim();
        const appIcon = appIconInput.value.trim() || "📦";
        const appDesc = appDescInput.value.trim() || "No description provided.";
        const pinToDock = appDockCheck.checked;
        const codePayload = appCodeInput.value.trim();

        // Structural Parameter Validation Bounds
        if (!rawId) {
            statusText.textContent = "❌ Error: App ID field is empty or contains illegal characters.";
            statusText.style.color = "#ff6b6b";
            return;
        }
        if (!appName) {
            statusText.textContent = "❌ Error: Please specify a clean Display Name.";
            statusText.style.color = "#ff6b6b";
            return;
        }
        if (!codePayload) {
            statusText.textContent = "❌ Error: Execution code cannot be empty.";
            statusText.style.color = "#ff6b6b";
            return;
        }

        const generatedHandlerName = `WebOS_AppHandler_${rawId.replace(/-/g, "_")}`;
        statusText.textContent = "Compiling logic modules...";
        statusText.style.color = "#007acc";

        try {
            // 1. Parse string script block into an active running function node context scope
            // We evaluate and map the code directly to a named global window method token matching the pattern definition
            const compiledFunction = new Function("api", "argument", codePayload);
            window[generatedHandlerName] = compiledFunction;

            // 2. Wrap app payload into an automated executable file representation string
            const virtualFileString = `/**
 * WebOS Auto-Generated Application Executable
 * Target ID: ${rawId}
 * Compiled on: ${new Date().toLocaleString()}
 */
window["${generatedHandlerName}"] = ${compiledFunction.toString()};

WebOSAppRegistry.register({
    id: "${rawId}",
    name: "${appName}",
    icon: "${appIcon}",
    description: "${appDesc}",
    dock: ${pinToDock},
    handler: "${generatedHandlerName}"
});`;

            // 3. Persist raw file data asset safely into the persistent IndexedDB virtual filesystem structure
            if (window.WebOSFileSystem && typeof window.WebOSFileSystem.putText === "function") {
                await window.WebOSFileSystem.putText(`/Desktop/Apps/${rawId}.js`, virtualFileString);
            }

            // 4. Register app definition configuration block directly inside the active AppRegistry memory loop maps
            if (window.WebOSAppRegistry && typeof window.WebOSAppRegistry.register === "function") {
                window.WebOSAppRegistry.register({
                    id: rawId,
                    name: appName,
                    icon: appIcon,
                    description: appDesc,
                    dock: pinToDock,
                    handler: generatedHandlerName
                });

                // 5. Trigger automated canvas redraw processing pipeline to immediately inject icons into Dock/Launcher DOM spaces
                if (typeof window.WebOSAppRegistry.render === "function") {
                    window.WebOSAppRegistry.render();
                }
            }

            // Report dynamic deployment success
            statusText.textContent = `✨ ${appName} installed successfully into desktop environment layout layers!`;
            statusText.style.color = "#39ff14";

            // Highlight temporary interface status flashes
            setTimeout(() => {
                if (statusText) {
                    statusText.textContent = "Ready to compile component...";
                    statusText.style.color = "";
                }
            }, 5000);

        } catch (compilationError) {
            console.error("Kernel Application compilation failure boundary caught:", compilationError);
            statusText.textContent = `❌ Compilation Failure: ${compilationError.message}`;
            statusText.style.color = "#ff6b6b";
        }
    };

    return win;
}
