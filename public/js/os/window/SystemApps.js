
function openNotes() {
    if (typeof closeLauncher === "function") closeLauncher();
    const markup = [
        '<div class="notes-app-container">',
        '<div class="notes-toolbar"><div class="notes-toolbar-group">',
        '<button class="notes-btn" type="button" data-md="h1">H1</button><button class="notes-btn" type="button" data-md="bold"><b>B</b></button><button class="notes-btn" type="button" data-md="italic"><i>I</i></button><button class="notes-btn" type="button" data-md="code">&lt;/&gt;</button><button class="notes-btn" type="button" data-md="list">• List</button><button class="notes-btn" type="button" data-md="quote">❝</button>',
        '</div><div class="notes-toolbar-group notes-toolbar-end"><button class="notes-btn notes-secondary" id="notes-download" type="button">Export .md</button><button class="notes-btn notes-secondary" id="notes-preview-toggle" type="button" aria-pressed="false">Preview only</button><button class="notes-btn save-btn" id="notes-save" type="button">Save</button></div></div>',
        '<div class="notes-workspace"><section class="notes-pane editor-pane"><div class="pane-label">Markdown editor <span id="notes-editor-count">0 words</span></div><textarea id="notes-editor" spellcheck="true" aria-label="Markdown source" placeholder="# Your note&#10;&#10;Write something brilliant...&#10;&#10;Try **bold**, lists, quotes, tables and fenced code blocks."></textarea></section>',
        '<section class="notes-pane preview-pane"><div class="pane-label">Live preview</div><article id="notes-preview" class="markdown-body"></article></section></div>',
        '<footer class="notes-footer"><span id="notes-status" class="notes-status-text" aria-live="polite">Loading note…</span><span id="notes-stats">0 characters · 0 lines</span></footer></div>'
    ].join("");

    const win = createWindow("Notes & Markdown Studio", markup);
    if (!win) return null;
    const editor = win.querySelector("#notes-editor");
    const preview = win.querySelector("#notes-preview");
    const status = win.querySelector("#notes-status");
    const stats = win.querySelector("#notes-stats");
    const wordCount = win.querySelector("#notes-editor-count");
    const workspace = win.querySelector(".notes-workspace");
    const toggle = win.querySelector("#notes-preview-toggle");
    const notePath = "/Documents/Notes.md";
    let dirty = false, timer = null, revision = 0, queue = Promise.resolve();

    const escapeHTML = value => String(value).replace(/[&<>"']/g, ch => ({
        "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    })[ch]);

    function safeHref(value) {
        const href = String(value || "").trim();
        return /^(https?:|mailto:)/i.test(href) || /^#[\w-]+$/.test(href) ? href : "";
    }

    function inlineMarkdown(source) {
        const saved = [];
        const protect = html => {
            const token = "\u0000" + saved.length + "\u0000";
            saved.push(html);
            return token;
        };
        let text = escapeHTML(source);
        text = text.replace(/\`([^\`\n]+)\`/g, (_, code) => protect("<code>" + code + "</code>"));
        text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
            const href = safeHref(url);
            return href ? protect('<img src="' + escapeHTML(href) + '" alt="' + alt + '" loading="lazy">') : alt;
        });
        text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
            const href = safeHref(url);
            return href ? protect('<a href="' + escapeHTML(href) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>') : label;
        });
        text = text.replace(/~~(.+?)~~/g, "<del>$1</del>")
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/__(.+?)__/g, "<strong>$1</strong>")
            .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
            .replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
        return text.replace(/\u0000(\d+)\u0000/g, (_, n) => saved[Number(n)]);
    }

    function parseMarkdown(source) {
        const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
        const out = [];
        let i = 0;
        const special = line => /^ {0,3}(#{1,6}\s|[\`~]{3}|>|[-*_]\s*[-*_]\s*[-*_]\s*$|[-+*]\s|\d+[.)]\s)/.test(line);
        while (i < lines.length) {
            const line = lines[i];
            if (!line.trim()) { i++; continue; }
            const fence = line.match(/^ {0,3}(\`{3,}|~{3,})\s*([\w+-]*)/);
            if (fence) {
                const marker = fence[1][0], size = fence[1].length, language = fence[2];
                i++;
                const code = [];
                while (i < lines.length && !new RegExp("^ {0,3}" + marker + "{" + size + ",}\\s*$").test(lines[i])) code.push(lines[i++]);
                if (i < lines.length) i++;
                out.push('<pre><code' + (language ? ' class="language-' + escapeHTML(language) + '"' : "") + '>' + escapeHTML(code.join("\n")) + "</code></pre>");
                continue;
            }
            const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
            if (heading) {
                const tag = "h" + heading[1].length;
                out.push("<" + tag + ">" + inlineMarkdown(heading[2]) + "</" + tag + ">");
                i++; continue;
            }
            if (/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
            if (/^ {0,3}>/.test(line)) {
                const quote = [];
                while (i < lines.length && /^ {0,3}>/.test(lines[i])) quote.push(lines[i++].replace(/^ {0,3}>\s?/, ""));
                out.push("<blockquote>" + parseMarkdown(quote.join("\n")) + "</blockquote>");
                continue;
            }
            if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
                const cells = row => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(x => x.trim());
                const headers = cells(line), aligns = cells(lines[i + 1]).map(x => x.startsWith(":") && x.endsWith(":") ? "center" : x.endsWith(":") ? "right" : x.startsWith(":") ? "left" : "");
                i += 2;
                let table = "<table><thead><tr>";
                headers.forEach((x,n) => table += '<th' + (aligns[n] ? ' style="text-align:' + aligns[n] + '"' : "") + ">" + inlineMarkdown(x) + "</th>");
                table += "</tr></thead><tbody>";
                while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
                    const values = cells(lines[i++]);
                    table += "<tr>";
                    headers.forEach((_,n) => table += '<td' + (aligns[n] ? ' style="text-align:' + aligns[n] + '"' : "") + ">" + inlineMarkdown(values[n] || "") + "</td>");
                    table += "</tr>";
                }
                out.push(table + "</tbody></table>");
                continue;
            }
            const list = line.match(/^ {0,3}([-+*]|\d+[.)])\s+(.*)$/);
            if (list) {
                const ordered = /^\d/.test(list[1]), tag = ordered ? "ol" : "ul", items = [];
                while (i < lines.length) {
                    const match = lines[i].match(/^ {0,3}([-+*]|\d+[.)])\s+(.*)$/);
                    if (!match || /^\d/.test(match[1]) !== ordered) break;
                    const task = match[2].match(/^\[([ xX])\]\s+(.*)$/);
                    items.push("<li>" + (task ? '<input type="checkbox" disabled ' + (task[1].toLowerCase() === "x" ? "checked" : "") + '> ' : "") + inlineMarkdown(task ? task[2] : match[2]) + "</li>");
                    i++;
                }
                out.push("<" + tag + ">" + items.join("") + "</" + tag + ">");
                continue;
            }
            const paragraph = [line.trim()];
            i++;
            while (i < lines.length && lines[i].trim() && !special(lines[i])) paragraph.push(lines[i++].trim());
            out.push("<p>" + paragraph.map(inlineMarkdown).join("<br>") + "</p>");
        }
        return out.join("\n");
    }

    function render() {
        preview.innerHTML = parseMarkdown(editor.value);
        const words = editor.value.trim() ? editor.value.trim().split(/\s+/).length : 0;
        wordCount.textContent = words + (words === 1 ? " word" : " words");
        stats.textContent = editor.value.length + " characters · " + (editor.value ? editor.value.split("\n").length : 0) + " lines";
    }

    function setStatus(message, success = false) {
        status.textContent = message;
        status.classList.toggle("success", success);
    }

    function save() {
        const value = editor.value, version = revision;
        try { localStorage.setItem("webos-notes-md", value); } catch (error) {}
        queue = queue.then(async () => {
            if (window.WebOSFileSystem?.putText) await window.WebOSFileSystem.putText(notePath, value);
            if (revision === version) {
                dirty = false;
                setStatus("Saved · " + new Date().toLocaleTimeString(), true);
            }
        }).catch(error => {
            setStatus("Browser copy saved · " + (error.message || "File storage unavailable"));
            console.warn("Notes save:", error);
        });
        return queue;
    }

    function changed() {
        dirty = true; revision++;
        setStatus("Unsaved changes…");
        clearTimeout(timer);
        timer = setTimeout(save, 850);
    }

    function insert(type) {
        const start = editor.selectionStart, end = editor.selectionEnd;
        const selected = editor.value.slice(start, end);
        const wrappers = { bold:["**","**","bold"], italic:["*","*","italic"], code:["\`","\`","code"] };
        if (wrappers[type]) {
            const [before,after,fallback] = wrappers[type];
            editor.setRangeText(before + (selected || fallback) + after, start, end, "select");
        } else {
            const prefix = { h1:"# ", list:"- ", quote:"> " }[type];
            const lineStart = editor.value.lastIndexOf("\n", start - 1) + 1;
            editor.setRangeText(prefix, lineStart, lineStart, "end");
        }
        editor.focus(); render(); changed();
    }

    win.querySelectorAll("[data-md]").forEach(button => button.addEventListener("click", () => insert(button.dataset.md)));
    editor.addEventListener("input", () => { render(); changed(); });
    editor.addEventListener("keydown", event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault(); clearTimeout(timer); save();
        }
        if (event.key === "Tab") {
            event.preventDefault();
            editor.setRangeText("    ", editor.selectionStart, editor.selectionEnd, "end");
            render(); changed();
        }
    });
    win.querySelector("#notes-save").addEventListener("click", () => { clearTimeout(timer); save(); });
    toggle.addEventListener("click", () => {
        const only = workspace.classList.toggle("preview-only");
        toggle.setAttribute("aria-pressed", String(only));
        toggle.textContent = only ? "Back to editor" : "Preview only";
    });
    win.querySelector("#notes-download").addEventListener("click", () => {
        const url = URL.createObjectURL(new Blob([editor.value], {type:"text/markdown;charset=utf-8"}));
        const a = document.createElement("a"); a.href = url; a.download = "Notes.md";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    function loadFallback() {
        let value = "";
        try { value = localStorage.getItem("webos-notes-md") || ""; } catch (error) {}
        editor.value = value; render(); setStatus("Ready");
    }
    if (window.WebOSFileSystem?.read) {
        window.WebOSFileSystem.read(notePath).then(entry => {
            if (!win.isConnected || dirty) return;
            let local = "";
            try { local = localStorage.getItem("webos-notes-md") || ""; } catch (error) {}
            editor.value = entry?.content ?? local;
            render(); setStatus("Ready");
        }).catch(loadFallback);
    } else loadFallback();
    return win;
}

function openFiles() {
    if (typeof closeLauncher === "function") closeLauncher();
    const markup = [
        '<div class="files-app-container files-explorer-v2">',
        '<aside class="files-sidebar" aria-label="File locations">',
        '<div class="files-sidebar-heading">LOCATIONS</div>',
        '<button type="button" class="files-location active" data-location="/"> <span>⌂</span> Home</button>',
        '<button type="button" class="files-location" data-location="/Desktop"><span>▧</span> Desktop</button>',
        '<button type="button" class="files-location" data-location="/Documents"><span>▤</span> Documents</button>',
        '<button type="button" class="files-location" data-location="/Downloads"><span>⇩</span> Downloads</button><button type="button" class="files-location" data-location="/Pictures"><span>▧</span> Pictures</button><button type="button" class="files-location" data-location="/Trash"><span>⌫</span> Trash</button>',
        '<div class="files-sidebar-divider"></div><div class="files-sidebar-heading">CREATE</div>',
        '<button type="button" class="files-location" id="files-new-html"><span>〈/〉</span> HTML document</button>',
        '<button type="button" class="files-location" id="files-new-css"><span>▦</span> CSS stylesheet</button>',
        '<button type="button" class="files-location" id="files-new-js"><span>JS</span> JavaScript file</button>',
        '</aside>',
        '<section class="files-main-area">',
        '<header class="files-app-toolbar">',
        '<div class="files-toolbar-row files-breadcrumb-row"><button type="button" class="files-icon-btn" id="file-back" title="Go to parent folder">←</button><nav class="files-path-breadcrumb" id="files-current-path" aria-label="Breadcrumb"></nav><button type="button" class="files-icon-btn" id="files-refresh" title="Refresh">↻</button></div>',
        '<div class="files-toolbar-row files-toolbar-actions"><input id="files-search" type="search" placeholder="Search this folder…" aria-label="Search files">',
        '<select id="files-sort" aria-label="Sort files"><option value="name">Name</option><option value="modified">Date modified</option><option value="size">Size</option><option value="type">File type</option></select>',
        '<button type="button" class="files-action-btn" id="new-folder">＋ Folder</button><button type="button" class="files-action-btn" id="new-file">＋ File</button>',
        '<button type="button" class="files-action-btn variant-secondary" id="upload-file">⇧ Import</button><button type="button" class="files-action-btn variant-secondary" id="files-view" aria-pressed="false" title="Toggle grid view">▦</button><button type="button" class="files-action-btn variant-secondary" id="files-backup">Backup</button><button type="button" class="files-action-btn variant-secondary" id="files-restore-backup">Restore backup</button><input id="files-backup-picker" type="file" accept="application/json,.json" hidden><button type="button" class="files-action-btn variant-secondary" id="files-empty-trash">Empty Trash</button>',
        '<input id="file-picker" type="file" accept="*/*" multiple hidden></div>',
        '<div class="files-selection-bar" id="files-selection-bar" hidden><span id="files-selection-count">0 selected</span><button type="button" id="files-select-all">Select all</button><button type="button" id="files-delete-selected" class="danger">Delete selected</button><button type="button" id="files-clear-selection">Clear</button></div>',
        '</header><main class="files-grid-workspace"><ul class="files-node-list" id="file-list" aria-label="Folder contents"></ul></main>',
        '<footer class="files-statusbar"><span id="file-status" aria-live="polite">IndexedDB storage · Ready</span><span id="files-count">0 items</span></footer>',
        '</section></div>'
    ].join("");
    const win = createWindow("File Explorer", markup);
    if (!win) return null;
    const list = win.querySelector("#file-list"), status = win.querySelector("#file-status");
    const count = win.querySelector("#files-count"), pathLabel = win.querySelector("#files-current-path");
    const picker = win.querySelector("#file-picker"), back = win.querySelector("#file-back");
    const search = win.querySelector("#files-search"), sort = win.querySelector("#files-sort");
    const view = win.querySelector("#files-view"), selectionBar = win.querySelector("#files-selection-bar");
    const selectionCount = win.querySelector("#files-selection-count");
    let path = "/", grid = false, token = 0;
    const selected = new Set();
    const name = e => e.path.split("/").pop() || "/";
    const parent = p => "/" + p.split("/").filter(Boolean).slice(0,-1).join("/");
    const target = n => (path === "/" ? "" : path) + "/" + n;
    const clean = n => n.trim().replace(/[\/\\:*?"<>|]/g,"-").replace(/^\.+$/,"");
    const size = e => e.type === "directory" ? 0 : (e.size ?? new Blob([e.content || ""]).size);
    const prettySize = n => {
        if (!n) return "0 B";
        const units=["B","KB","MB","GB"], i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),3);
        return (n/Math.pow(1024,i)).toFixed(i ? 1 : 0)+" "+units[i];
    };
    const extension = entry => name(entry).includes(".") ? name(entry).split(".").pop().toLowerCase() : "";
    const icon = e => {
        if (e.type==="directory") return "folder";
        const ext=extension(e);
        if (["png","jpg","jpeg","gif","webp","bmp"].includes(ext)) return "image";
        if (ext==="svg") return "svg";
        if (["js","mjs","ts","html","htm","css","json","xml","py","sh","wasm"].includes(ext)) return "code";
        if (["mp3","wav","ogg","flac"].includes(ext)) return "audio";
        if (["mp4","webm","mov"].includes(ext)) return "video";
        if (["zip","7z","tar","gz"].includes(ext)) return "archive";
        return "file";
    };
    function updateSelection() {
        selectionBar.hidden = selected.size === 0;
        selectionCount.textContent = selected.size + " selected";
        list.querySelectorAll(".file-node-item").forEach(item => item.classList.toggle("is-selected", selected.has(item.dataset.path)));
    }
    function renderBreadcrumb() {
        pathLabel.replaceChildren();
        const parts = path.split("/").filter(Boolean);
        const root = document.createElement("button");
        root.type = "button"; root.textContent = "Home";
        root.addEventListener("click",()=>{path="/";selected.clear();render();});
        pathLabel.appendChild(root);
        let current = "";
        parts.forEach(part => {
            current += "/" + part;
            const separator = document.createElement("span"); separator.className = "files-breadcrumb-separator"; separator.textContent = "›";
            const button = document.createElement("button"); button.type = "button"; button.textContent = part;
            const destination = current;
            button.addEventListener("click",()=>{path=destination;selected.clear();render();});
            pathLabel.append(separator,button);
        });
        win.querySelectorAll("[data-location]").forEach(button=>button.classList.toggle("active",button.dataset.location===path));
    }
    async function render() {
        const current=++token;
        list.replaceChildren(); renderBreadcrumb(); back.disabled=path==="/";
        try {
            const q=search.value.trim().toLowerCase();
            const entries=q?await window.WebOSFileSystem.search(q,{root:path,limit:500}):await window.WebOSFileSystem.list(path);
            if(current!==token || !win.isConnected) return;
            const rows=entries;
            rows.sort((a,b)=>{
                if(a.type!==b.type) return a.type==="directory"?-1:1;
                if(sort.value==="modified") return (b.modified||0)-(a.modified||0);
                if(sort.value==="size") return size(b)-size(a);
                if(sort.value==="type") return extension(a).localeCompare(extension(b)) || name(a).localeCompare(name(b));
                return name(a).localeCompare(name(b),undefined,{numeric:true,sensitivity:"base"});
            });
            count.textContent=rows.length+" of "+entries.length+" items";
            if(!rows.length) {
                const empty=document.createElement("li"); empty.className="files-empty-state-notice";
                empty.innerHTML='<span class="files-empty-icon">✧</span><strong>'+(q?"Nothing matched your search":"Nothing here yet")+'</strong><span>'+(q?"Try a different name or clear the search.":"Create a file, add a folder, or import a document to get started.")+'</span>';
                list.appendChild(empty); updateSelection(); return;
            }
            rows.forEach(entry=>{
                const n=name(entry), item=document.createElement("li");
                item.className="file-node-item "+(entry.type==="directory"?"node-type-folder":"node-type-file");
                item.dataset.path=entry.path;item.style.setProperty("--file-index",String(list.children.length));
                const check=document.createElement("input");check.type="checkbox";check.className="files-item-check";check.checked=selected.has(entry.path);check.setAttribute("aria-label","Select "+n);
                check.addEventListener("change",()=>{if(check.checked)selected.add(entry.path);else selected.delete(entry.path);updateSelection();});
                const open=document.createElement("button");open.type="button";open.className="files-node-open";
                const graphic=document.createElement("span");graphic.className="node-graphic-icon";
                const img=document.createElement("img");img.className="files-preset-icon";img.src="../images/icons/"+icon(entry)+".svg";img.alt="";
                graphic.appendChild(img);
                const details=document.createElement("span");details.className="node-text-details";
                const label=document.createElement("span");label.className="node-filename-label";label.textContent=n;
                const meta=document.createElement("small");meta.className="node-filesize-sublabel";
                meta.textContent=entry.type==="directory"?"Folder":prettySize(size(entry))+" · "+new Date(entry.modified||Date.now()).toLocaleDateString();
                details.append(label,meta);open.append(graphic,details);
                open.addEventListener("click",()=>{if(entry.type==="directory"){path=entry.path;search.value="";selected.clear();render();}else openFile(entry);});
                const tools=document.createElement("div");tools.className="files-node-actions";
                const rename=document.createElement("button");rename.type="button";rename.textContent="Rename";rename.title="Rename item";
                rename.addEventListener("click",async()=>{
                    const next=window.prompt("Rename item:",n);if(!next||!next.trim()||clean(next)===n)return;
                    try{await window.WebOSFileSystem.move(entry.path,target(clean(next)));selected.delete(entry.path);status.textContent="Renamed "+n;render();}
                    catch(err){window.alert("Rename failed: "+err.message);}
                });
                const duplicate=document.createElement("button");duplicate.type="button";duplicate.textContent="Copy";duplicate.title="Duplicate item";
                duplicate.addEventListener("click",async()=>{
                    try{let base=n,ext="",dot=n.lastIndexOf(".");if(dot>0){base=n.slice(0,dot);ext=n.slice(dot);}let next=base+" copy"+ext,i=2;while(await window.WebOSFileSystem.exists(target(next)))next=base+" copy "+i+++ext;await window.WebOSFileSystem.copy(entry.path,target(next));status.textContent="Created "+next;render();}
                    catch(err){window.alert("Copy failed: "+err.message);}
                });
                if(path==="/Trash"){const restore=document.createElement("button");restore.type="button";restore.textContent="Restore";restore.title="Restore to Documents/Recovered";restore.addEventListener("click",async()=>{try{await window.WebOSFileSystem.makeDirectory("/Documents/Recovered");let destination="/Documents/Recovered/"+n;let suffix=2;while(await window.WebOSFileSystem.exists(destination)){destination="/Documents/Recovered/"+suffix+++"-"+n;}await window.WebOSFileSystem.restore(entry.path,destination);status.textContent="Restored to "+destination;render();}catch(error){status.textContent="Restore failed: "+error.message;}});tools.appendChild(restore);}
                const dl=document.createElement("button");dl.type="button";dl.textContent="↓";dl.title="Download file";dl.disabled=entry.type==="directory";
                dl.addEventListener("click",()=>downloadEntry(entry));
                const del=document.createElement("button");del.type="button";del.className="danger";del.textContent="×";del.title="Delete item";
                del.addEventListener("click",async()=>{
                    if(!window.confirm('Permanently delete "'+n+'" from WebOS storage?'))return;
                    try{if(path==="/Trash")await window.WebOSFileSystem.remove(entry.path);else await window.WebOSFileSystem.trash(entry.path);selected.delete(entry.path);status.textContent=path==="/Trash"?"Permanently deleted "+n:"Moved to Trash: "+n;render();}
                    catch(err){window.alert("Delete failed: "+err.message);}
                });
                tools.append(rename,duplicate,dl,del);item.append(check,open,tools);list.appendChild(item);
            });
            status.textContent=path+" · IndexedDB";
            updateSelection();
        } catch(err){status.textContent="Could not read folder: "+err.message;console.error("WebOS Files:",err);}
    }
    function downloadText(filename,content,type) {
        const blob=content instanceof Blob?content:new Blob([content],{type:type||"application/octet-stream"}),url=URL.createObjectURL(blob);
        const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    async function downloadEntry(entry){const file=await window.WebOSFileSystem.read(entry.path);if(!file)return;if(file.binary){const bytes=await window.WebOSFileSystem.readBinary(entry.path);downloadText(name(entry),new Blob([bytes],{type:file.mimeType||"application/octet-stream"}));}else downloadText(name(entry),file.content||"",file.mimeType);}
    async function openFile(entry) {
        const file=await window.WebOSFileSystem.read(entry.path);if(!file)return;
        const ext=extension(entry),previewable=["html","htm"].includes(ext);
        const panel=document.createElement("div");panel.className="file-editor-container files-code-workspace";
        const info=document.createElement("div");info.className="file-editor-info";info.textContent=entry.path+" · "+prettySize(size(file));
        const editor=document.createElement("textarea");editor.className="raw-code-textarea";editor.spellcheck=false;editor.value=file.binary?"Binary file · "+prettySize(file.size):(file.content||"");editor.readOnly=!!file.binary;editor.setAttribute("aria-label","File contents");
        const footer=document.createElement("div");footer.className="editor-action-footer";
        const save=document.createElement("button");save.type="button";save.className="files-action-btn";save.textContent="Save";
        const dl=document.createElement("button");dl.type="button";dl.className="files-action-btn variant-secondary";dl.textContent="Download";
        const state=document.createElement("span");state.setAttribute("aria-live","polite");state.textContent="Stored in this browser.";
        let previewFrame=null;
        if(previewable){
            const preview=document.createElement("button");preview.type="button";preview.className="files-action-btn variant-secondary";preview.textContent="Preview HTML";
            preview.addEventListener("click",()=>{
                if(previewFrame){previewFrame.remove();previewFrame=null;preview.textContent="Preview HTML";return;}
                previewFrame=document.createElement("iframe");previewFrame.className="files-html-preview";previewFrame.setAttribute("sandbox","");
                previewFrame.title="Isolated HTML preview";previewFrame.srcdoc=editor.value;
                panel.insertBefore(previewFrame,footer);preview.textContent="Hide preview";
            });
            footer.appendChild(preview);
        }
        save.disabled=!!file.binary;save.addEventListener("click",async()=>{try{await window.WebOSFileSystem.putText(entry.path,editor.value,file.mimeType||"text/plain");state.textContent="Saved · "+new Date().toLocaleTimeString();render();}catch(err){state.textContent="Save failed: "+err.message;}});
        dl.addEventListener("click",()=>downloadEntry(entry));
        footer.append(save,dl,state);
        if(file.binary&&["png","jpg","jpeg","gif","webp","bmp"].includes(ext)){const image=document.createElement("img");image.alt=name(entry);image.style.cssText="display:block;max-width:100%;max-height:45vh;object-fit:contain;margin:10px auto;background:#fff;border-radius:8px";const bytes=await window.WebOSFileSystem.readBinary(entry.path);const url=URL.createObjectURL(new Blob([bytes],{type:file.mimeType||"image/png"}));image.src=url;panel.append(info,image,footer);const previewWindow=createWindow(name(entry),panel);previewWindow?.addEventListener("webos:window-close",()=>URL.revokeObjectURL(url),{once:true});return;}
        panel.append(info,editor,footer);createWindow(name(entry),panel);
    }
    async function createStarter(extension) {
        const defaults={
            html:["<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>New WebOS page</title>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  <main>\n    <h1>Hello, WebOS!</h1>\n    <p>Your new HTML document starts here.</p>\n  </main>\n  <script src=\"app.js\"></script>\n</body>\n</html>","HTML document"],
            css:["/* WebOS stylesheet */\n:root {\n  color-scheme: light dark;\n}\n\nbody {\n  font-family: system-ui, sans-serif;\n}\n","CSS stylesheet"],
            js:["// WebOS application script\n'use strict';\n\ndocument.addEventListener('DOMContentLoaded', () => {\n  console.log('Hello from WebOS!');\n});\n","JavaScript file"]
        };
        const [content,label]=defaults[extension],nameInput=window.prompt("Name your "+label.toLowerCase()+":",extension==="html"?"index.html":extension==="css"?"style.css":"app.js");
        if(!nameInput||!nameInput.trim())return;
        let filename=clean(nameInput);if(!filename)return;
        if(!filename.toLowerCase().endsWith("."+extension))filename+="."+extension;
        try{await window.WebOSFileSystem.putText(target(filename),content);status.textContent="Created "+filename;render();const entry=await window.WebOSFileSystem.read(target(filename));if(entry)openFile(entry);}
        catch(err){window.alert("Could not create file: "+err.message);}
    }
    back.addEventListener("click",()=>{if(path==="/")return;path=parent(path);selected.clear();search.value="";render();});
    win.querySelector("#files-refresh").addEventListener("click",render);
    search.addEventListener("input",render);sort.addEventListener("change",render);
    view.addEventListener("click",()=>{grid=!grid;list.classList.toggle("files-grid-view",grid);view.setAttribute("aria-pressed",String(grid));view.textContent=grid?"☰":"▦";});
    win.querySelectorAll("[data-location]").forEach(button=>button.addEventListener("click",()=>{path=button.dataset.location;selected.clear();search.value="";render();}));
    win.querySelector("#files-new-html").addEventListener("click",()=>createStarter("html"));
    win.querySelector("#files-new-css").addEventListener("click",()=>createStarter("css"));
    win.querySelector("#files-new-js").addEventListener("click",()=>createStarter("js"));
    win.querySelector("#new-folder").addEventListener("click",async()=>{
        const n=window.prompt("New folder name:","New Folder");if(!n||!n.trim())return;
        try{await window.WebOSFileSystem.makeDirectory(target(clean(n)));status.textContent="Created folder "+n;render();}
        catch(err){window.alert("Could not create folder: "+err.message);}
    });
    win.querySelector("#new-file").addEventListener("click",async()=>{
        const n=window.prompt("New file name:","untitled.txt");if(!n||!n.trim())return;
        try{await window.WebOSFileSystem.putText(target(clean(n)),"");status.textContent="Created file "+n;render();}
        catch(err){window.alert("Could not create file: "+err.message);}
    });
    win.querySelector("#upload-file").addEventListener("click",()=>picker.click());
    picker.addEventListener("change",async()=>{
        const files=Array.from(picker.files||[]);
        const textPattern=/\.(txt|md|json|js|mjs|ts|html?|css|xml|svg|csv|ya?ml|toml|ini|log|py|sh|sql)$/i;
        const accepted=files.filter(file=>file.type.startsWith("text/")||file.type==="application/json"||file.type==="image/svg+xml"||textPattern.test(file.name));
        const skipped=files.length-accepted.length;
        for(const file of accepted)await window.WebOSFileSystem.putText(target(clean(file.name)),await file.text());
        if(files.length)status.textContent="Imported "+accepted.length+" text file(s)"+(skipped?" · skipped "+skipped+" unsupported binary file(s)":"");
        picker.value="";render();
    });
    const backupPicker=win.querySelector("#files-backup-picker");win.querySelector("#files-restore-backup").addEventListener("click",()=>backupPicker.click());backupPicker.addEventListener("change",async()=>{const file=backupPicker.files?.[0];if(!file)return;try{if(!confirm("Import this filesystem backup? Existing files with matching paths will be replaced."))return;const data=JSON.parse(await file.text()),result=await window.WebOSFileSystem.importBackup(data);status.textContent="Restored "+result.imported+" filesystem entries.";render();}catch(error){status.textContent="Restore failed: "+error.message;}finally{backupPicker.value="";}});win.querySelector("#files-empty-trash").addEventListener("click",async()=>{if(!confirm("Permanently empty the Trash?"))return;try{const removed=await window.WebOSFileSystem.emptyTrash();status.textContent="Permanently removed "+removed+" item(s).";if(path==="/Trash")render();}catch(error){status.textContent="Could not empty Trash: "+error.message;}});
    win.querySelector("#files-backup").addEventListener("click",async()=>{try{const data=await window.WebOSFileSystem.exportBackup();downloadText("webos-filesystem-backup.json",JSON.stringify(data),"application/json");status.textContent="Backup exported · "+data.entries.length+" entries";}catch(e){status.textContent="Backup failed: "+e.message;}});
    win.querySelector("#files-select-all").addEventListener("click",async()=>{
        const entries=await window.WebOSFileSystem.list(path);entries.forEach(entry=>selected.add(entry.path));render();
    });
    win.querySelector("#files-clear-selection").addEventListener("click",()=>{selected.clear();render();});
    win.querySelector("#files-delete-selected").addEventListener("click",async()=>{
        if(!selected.size||!window.confirm("Delete "+selected.size+" selected item(s)? This cannot be undone."))return;
        const targets=[...selected];for(const item of targets)await window.WebOSFileSystem.remove(item);
        selected.clear();status.textContent="Deleted "+targets.length+" item(s)";render();
    });
    win.addEventListener("keydown",event=>{
        if(event.key==="Backspace"&&!/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)&&path!=="/"){event.preventDefault();path=parent(path);selected.clear();render();}
    });
    win.addEventListener("webos:window-close",()=>{++token;picker.value="";selected.clear();});
    render();return win;
}
function openSettings() {
    if (typeof closeLauncher === "function") closeLauncher();

    // 1. Separate HTML template definition cleanly inside the functional block
    const htmlTemplate = `
        <div class="AppPanel" style="display: flex; flex-direction: column; gap: 1.5rem; max-width: 500px;">
            <!-- SYSTEM PREFERENCES SECTION -->
            <section class="settings-section" style="display: flex; flex-direction: column; gap: 1rem;">
                <h2>Better Settings</h2><section class="settings-section webos-identity-settings">
 <h2>System Identity</h2><p>Give this installation its own name and visual identity. These settings stay on this device.</p>
 <div class="setting-field"><label for="os-brand-name">Operating system name</label><input id="os-brand-name" maxlength="32" placeholder="WebOS"></div>
 <div class="setting-field"><label for="os-brand-subtitle">System subtitle</label><input id="os-brand-subtitle" maxlength="64" placeholder="A browser-based desktop environment"></div>
 <div class="setting-field"><label for="os-brand-logo">Brand icon / emoji</label><input id="os-brand-logo" maxlength="8" placeholder="🖥️"></div>
 <div class="setting-field"><label for="os-brand-version">Display version label</label><input id="os-brand-version" maxlength="24" placeholder="1.0"></div>
 <small>Changing the display version does not change the actual WebOS build or update channel.</small>
 <div class="setting-field"><label>Accent color presets</label><div class="webos-accent-swatches" role="group" aria-label="Accent color presets">
 <button type="button" data-accent="#53b5ff" title="Ocean" aria-label="Ocean accent" style="--swatch:#53b5ff"></button><button type="button" data-accent="#8b5cf6" title="Violet" aria-label="Violet accent" style="--swatch:#8b5cf6"></button><button type="button" data-accent="#ec4899" title="Pink" aria-label="Pink accent" style="--swatch:#ec4899"></button><button type="button" data-accent="#f97316" title="Orange" aria-label="Orange accent" style="--swatch:#f97316"></button><button type="button" data-accent="#f5b942" title="Amber" aria-label="Amber accent" style="--swatch:#f5b942"></button><button type="button" data-accent="#22c55e" title="Green" aria-label="Green accent" style="--swatch:#22c55e"></button><button type="button" data-accent="#14b8a6" title="Teal" aria-label="Teal accent" style="--swatch:#14b8a6"></button><button type="button" data-accent="#06b6d4" title="Cyan" aria-label="Cyan accent" style="--swatch:#06b6d4"></button><button type="button" data-accent="#ef4444" title="Red" aria-label="Red accent" style="--swatch:#ef4444"></button><button type="button" data-accent="#a3e635" title="Lime" aria-label="Lime accent" style="--swatch:#a3e635"></button><button type="button" data-accent="#e879f9" title="Orchid" aria-label="Orchid accent" style="--swatch:#e879f9"></button><button type="button" data-accent="#e5e7eb" title="Silver" aria-label="Silver accent" style="--swatch:#e5e7eb"></button><button type="button" data-accent="#64748b" title="Slate" aria-label="Slate accent" style="--swatch:#64748b"></button><button type="button" data-accent="#ffffff" title="White" aria-label="White accent" style="--swatch:#ffffff"></button>
 </div></div>
 <div class="setting-field"><label for="os-brand-accent-hex">Custom accent (hex)</label><input id="os-brand-accent-hex" maxlength="7" placeholder="#53B5FF"></div>
</section>

                
                <div class="setting-field"><label for="desktop-style-choice">Desktop environment</label><select id="desktop-style-choice"><option value="webos">WebOS · Modern</option><option value="macos">macOS-inspired</option><option value="windows">Windows-inspired</option><option value="chromeos">ChromeOS-inspired</option><option value="linux">Linux workstation</option><option value="floating">Floating dock · minimal desktop</option><option value="classic">Classic desktop</option><option value="minimal">Minimal workspace</option><option value="tablet">Tablet workspace</option></select><small>Changes the menu bar, taskbar, dock, desktop spacing and window chrome.</small></div>
                <div class="setting-field"><label for="window-style-choice">Window appearance</label><select id="window-style-choice"><option value="auto">Match desktop preset</option><option value="glass">Liquid glass</option><option value="flat">Flat panels</option><option value="compact">Compact classic</option></select></div>
                <div class="setting-field" style="display: flex; flex-direction: column; gap: 0.25rem;">
                    <label for="theme-choice">Accent theme</label>
                    <select id="theme-choice" style="padding: 0.4rem; border-radius: 4px;">
                        <option value="ocean">Ocean</option>
                        <option value="mint">Mint</option>
                        <option value="sunset">Sunset</option>
                        <option value="midnight">Midnight</option>
                        <option value="lavender">Lavender</option>
                    </select>
                </div>
                
                <div class="setting-field">
                    <label style="display: inline-flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input id="motion-choice" type="checkbox"> Reduce motion
                    </label>
                </div>

                <div class="setting-field">
                    <label for="accent-choice">Accent color</label>
                    <input id="accent-choice" type="color" value="#53b5ff">
                </div>

                <div class="setting-field">
                    <label for="wallpaper-choice">Desktop wallpaper</label>
                    <select id="wallpaper-choice">
                        <option value="aurora">Aurora</option>
                        <option value="midnight">Midnight</option>
                        <option value="ember">Ember</option>
                        <option value="ocean">Ocean glow</option>
                        <option value="sakura">Sakura</option><option value="forest">Forest</option><option value="graphite">Graphite</option><option value="sunset">Sunset sky</option>
                        <option value="custom">Custom image</option>
                    </select>
                    <input id="wallpaper-file" type="file" accept="image/*">
                    <button type="button" id="wallpaper-clear">Remove custom wallpaper</button>
                </div>

                <div class="setting-field">
                    <label for="animation-choice">Animation style</label>
                    <select id="animation-choice">
                        <option value="smooth">Smooth</option><option value="snappy">Snappy</option><option value="cinematic">Cinematic</option>
                    </select>
                </div>
                <div class="setting-field"><label for="ambient-animation-choice">Animated desktop atmosphere</label><select id="ambient-animation-choice"><option value="none">Off</option><option value="aurora">Aurora drift</option><option value="stars">Starfield</option><option value="mesh">Moving mesh</option><option value="waves">Soft waves</option><option value="rain">Rainfall</option></select><small>Ambient motion behind desktop icons and windows. Reduced motion disables the effects.</small></div>
                <div class="setting-field liquid-glass-setting"><label><input id="liquid-glass-choice" type="checkbox"> Experimental Liquid Glass</label><small>Layered backdrop blur, spectral highlights and supported SVG displacement effects. Rendering varies by browser and GPU.</small></div>
                <div class="setting-field webos-refraction-controls"><label><input id="glass-refraction-choice" type="checkbox"> Experimental glass refraction</label>
 <small>Subtle SVG displacement on the glass highlight layer. It does not distort window content. High values may affect performance.</small>
 <label for="glass-refraction-strength">Refraction strength <output id="glass-refraction-strength-value">3</output></label><input id="glass-refraction-strength" type="range" min="0" max="8" value="3">
 <label for="glass-highlight-choice">Glass highlight intensity <output id="glass-highlight-choice-value">45%</output></label><input id="glass-highlight-choice" type="range" min="0" max="100" value="45">
 <label for="glass-blur-choice">Glass blur <output id="glass-blur-choice-value">24px</output></label><input id="glass-blur-choice" type="range" min="0" max="40" value="24">
</div><button type="button" id="reset-appearance">Restore appearance defaults</button>
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

                <div class="setting-field" style="display:flex;flex-direction:column;gap:6px;">
                    <label for="css-starter">CSS starter preset</label><div style="display:flex;gap:.5rem;flex-wrap:wrap"><select id="css-starter"><option value="">Choose a starter…</option><option value="rounded">Soft rounded windows</option><option value="minimal">Minimal monochrome</option><option value="neon">Neon developer</option><option value="paper">Warm paper</option></select><button type="button" id="css-insert-starter">Insert starter</button></div>
                    <h3>Window designer · live preview</h3>
                    <div class="window-designer-grid">
                      <label>Corner radius <output id="designer-radius-value">16px</output><input id="designer-radius" type="range" min="0" max="32" value="16"></label>
                      <label>Backdrop blur <output id="designer-blur-value">18px</output><input id="designer-blur" type="range" min="0" max="40" value="18"></label>
                      <label>Panel opacity <output id="designer-opacity-value">92%</output><input id="designer-opacity" type="range" min="55" max="100" value="92"></label>
                      <label>Shadow strength <output id="designer-shadow-value">35%</output><input id="designer-shadow" type="range" min="0" max="75" value="35"></label>
                      <label>Titlebar height <output id="designer-title-height-value">40px</output><input id="designer-title-height" type="range" min="28" max="60" value="40"></label>
                      <label>Window border <input id="designer-border" type="color" value="#65758b"></label>
                      <label>Titlebar color <input id="designer-title-color" type="color" value="#273449"></label>
                      <label>Title text color <input id="designer-title-text" type="color" value="#f4f7fb"></label>
                    </div>
                    <div style="display:flex;gap:.5rem;flex-wrap:wrap"><button type="button" id="designer-reset">Reset window design</button><span id="designer-status" aria-live="polite">Changes preview live and save locally.</span></div>
                    <label for="css-full-editor">Custom CSS stylesheet</label>
                    <textarea id="css-full-editor" spellcheck="false" style="width:100%;min-height:150px;resize:vertical;font:12px/1.5 ui-monospace,monospace;" placeholder="/* Add CSS rules here */"></textarea>
                    <small style="opacity:.7;">Saved locally and injected into the desktop. @import and script-like CSS expressions are blocked.</small>
                </div>
                <div class="inspector-actions" style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.25rem;">
                    <button type="button" id="btn-save-css" disabled>Save Selected Styles</button>
                    <button type="button" id="btn-apply-css">Validate & Apply CSS</button>
                    <button type="button" id="btn-clear-css">Clear All Changes</button>
                </div>
            </section>

            <hr style="border: 0; border-top: 1px solid rgba(128,128,128,0.2); margin: 0.5rem 0;" />

            <!-- SESSION LOCK AND SECURITY SECTION -->
            <section class="settings-section" style="display:flex;flex-direction:column;gap:1rem;">
              <h2>Lock &amp; Security</h2><p>Protect this WebOS session with a local PIN, a pattern, or a swipe gesture.</p>
              <div class="setting-field"><label for="lock-method-choice">Lock method</label><select id="lock-method-choice"><option value="pin">PIN / passcode</option><option value="pattern">3×3 pattern</option><option value="swipe">Swipe to unlock (no passcode)</option></select></div>
              <div class="setting-field" id="lock-pin-field"><label for="lock-passcode">New PIN</label><input id="lock-passcode" type="password" inputmode="numeric" autocomplete="new-password" maxlength="64" placeholder="At least 4 characters"><small>PIN verification is stored as a salted PBKDF2 hash on this device.</small></div>
              <div class="setting-field" id="lock-pattern-field" hidden><label>Draw a pattern to save</label><div class="webos-setup-pattern" id="lock-setup-pattern">${Array.from({length:9},(_,i)=>'<button type="button" data-setup-dot="'+(i+1)+'" aria-label="Pattern dot '+(i+1)+'"></button>').join("")}</div><button type="button" id="lock-pattern-clear">Clear pattern</button><small id="lock-pattern-count">Connect at least 4 different dots.</small></div>
              <label class="setting-field"><input id="lock-startup-choice" type="checkbox"> Lock WebOS automatically when it starts</label>
              <div style="display:flex;gap:.5rem;flex-wrap:wrap"><button type="button" id="lock-save-method">Save lock method</button><button type="button" id="lock-now">Lock now</button><button type="button" id="lock-remove-method">Remove lock method</button></div>
              <small>Swipe mode is a convenience screen, not authentication. This browser-only lock does not encrypt files or protect against someone with developer-tools/device access.</small>
            </section>


            <!-- FULL SYSTEM BACKUP AND RECOVERY -->
            <section class="settings-section" style="display:flex;flex-direction:column;gap:1rem;">
                <h2>Backup &amp; Recovery</h2>
                <p>Export your WebOS virtual files and supported WebOS preferences into one portable JSON backup.</p>
                <div class="webos-backup-actions">
                    <button type="button" id="webos-full-export">Export everything</button>
                    <button type="button" id="webos-full-import-trigger">Restore backup</button>
                    <input id="webos-full-import-file" type="file" accept="application/json,.json" hidden>
                </div>
                <label for="webos-restore-mode">Restore behavior</label>
                <select id="webos-restore-mode"><option value="merge">Merge into current files</option><option value="replace">Replace current virtual filesystem</option></select>
                <small>Restore validates the backup before writing. Replace affects the WebOS virtual filesystem only. Browser lock credentials and browser/device data are intentionally excluded; export those separately using the browser's own backup options if needed.</small>
                <p id="webos-backup-status" role="status" aria-live="polite">No backup operation running.</p>
            </section>


            <!-- APP LIFECYCLE AND DISCOVERY -->
            <section class="settings-section" style="display:flex;flex-direction:column;gap:1rem;">
                <h2>Apps &amp; Applications</h2>
                <p>Review installed applications, protect built-in system apps, and manage custom JavaScript and WebAssembly packages.</p>
                <div class="settings-action-row"><button type="button" id="settings-open-app-manager">Open App Manager</button><button type="button" id="settings-refresh-apps">Refresh app catalog</button></div>
                <div class="settings-info-grid"><article><strong id="settings-app-count">—</strong><small>Registered apps</small></article><article><strong id="settings-wasm-count">—</strong><small>WASM packages</small></article></div>
                <small>Built-in apps are protected from uninstall. App Manager exports registry metadata; app source and WASM binaries are managed by their respective creation tools.</small>
            </section>

            <section class="settings-section" style="display:flex;flex-direction:column;gap:1rem;">
                <h2>Account &amp; Cloud</h2>
                <p>Sign in to sync your WebOS preferences and virtual files across devices. Local mode remains available if cloud services are unavailable.</p>
                <div id="settings-cloud-status" class="settings-readout" role="status" aria-live="polite">Checking cloud configuration…</div>
                <div class="settings-cloud-form">
                    <label for="settings-cloud-email">Email</label>
                    <input id="settings-cloud-email" type="email" autocomplete="username" placeholder="you@example.com">
                    <label for="settings-cloud-password">Password</label>
                    <input id="settings-cloud-password" type="password" autocomplete="current-password" placeholder="Account password">
                    <label for="settings-cloud-display-name">Display name (for new accounts)</label>
                    <input id="settings-cloud-display-name" type="text" maxlength="48" autocomplete="nickname" placeholder="Optional display name">
                    <div class="settings-action-row">
                        <button type="button" id="settings-cloud-signin">Sign in</button>
                        <button type="button" id="settings-cloud-signup">Create account</button>
                        <button type="button" id="settings-cloud-signout" hidden>Sign out</button>
                    </div>
                </div>
                <div class="settings-action-row">
                    <button type="button" id="settings-cloud-push">Back up to cloud</button>
                    <button type="button" id="settings-cloud-pull">Restore from cloud</button>
                </div>
                <label class="setting-field"><input id="settings-cloud-auto" type="checkbox"> Automatically sync changes when signed in</label>
                <small>Cloud backups include your WebOS virtual filesystem and supported preferences. Do not sync sensitive documents on shared devices. Supabase Row Level Security protects account records; this is not end-to-end encryption.</small>
            </section>

            <!-- NOTIFICATION PREFERENCES -->
            <section class="settings-section" style="display:flex;flex-direction:column;gap:1rem;">
                <h2>Notifications</h2>
                <label class="setting-field"><input id="settings-notify-errors" type="checkbox" checked> Show application error notifications</label>
                <label class="setting-field"><input id="settings-notify-updates" type="checkbox" checked> Notify when WebOS updates</label>
                <div class="settings-action-row"><button type="button" id="settings-notification-permission">Enable browser notifications</button><button type="button" id="settings-test-notification">Send test notification</button></div>
                <p id="settings-notification-status" role="status" aria-live="polite">In-app notifications are enabled.</p>
                <small>Browser notifications require permission and may be unavailable in private browsing or unsupported browsers.</small>
            </section>

            <!-- PRIVACY AND PERMISSIONS -->
            <section class="settings-section" style="display:flex;flex-direction:column;gap:1rem;">
                <h2>Privacy &amp; Security</h2>
                <p>Review browser permissions and local session protections. WebOS runs inside your browser and does not replace your device's account security.</p>
                <div class="settings-action-row"><button type="button" id="settings-check-permissions">Review browser permissions</button><button type="button" id="settings-clear-site-data">Clear WebOS caches…</button></div>
                <div id="settings-permissions" class="settings-readout" aria-live="polite">Permission status has not been checked.</div>
                <small>The optional PIN/pattern lock is a convenience layer for this browser session, not disk encryption. Never store sensitive credentials in WebOS app storage.</small>
            </section>

            <!-- HOST DEVICE AND CAPABILITIES -->
            <section class="settings-section" style="display:flex;flex-direction:column;gap:1rem;">
                <h2>Devices</h2>
                <p>Host information exposed by the browser. Some values are intentionally limited by browser privacy protections.</p>
                <div id="settings-device-info" class="settings-readout">Loading browser capabilities…</div>
                <div class="settings-action-row"><button type="button" id="settings-refresh-device">Refresh device information</button><button type="button" id="settings-fullscreen-toggle">Toggle fullscreen</button></div>
            </section>

            <!-- DEVELOPER CONTROLS -->
            <section class="settings-section" style="display:flex;flex-direction:column;gap:1rem;">
                <h2>Developer Settings</h2>
                <p>Developer tools and documentation for building WebOS applications.</p>
                <div class="settings-action-row"><button type="button" data-dev-app="docs">API Documentation</button><button type="button" data-dev-app="appcreator">App Creator</button><button type="button" data-dev-app="wasm">WASM Lab</button><button type="button" data-dev-app="animations">Animation Studio</button></div>
                <label class="setting-field"><input id="settings-debug-mode" type="checkbox"> Enable verbose WebOS diagnostics</label>
                <small>Diagnostics are local to this browser session. Avoid sharing logs that may contain personal content.</small>
            </section>

            <!-- UPDATE MANAGEMENT -->
            <section class="settings-section" style="display:flex;flex-direction:column;gap:1rem;">
                <h2>Updates</h2>
                <div class="settings-info-grid"><article><strong id="settings-build-version">Checking…</strong><small>Cached service worker build</small></article><article><strong id="settings-sw-state">Checking…</strong><small>Service worker status</small></article></div>
                <p id="settings-update-status" role="status" aria-live="polite">Checking update status…</p>
                <div class="settings-action-row"><button type="button" id="settings-check-update">Check for updates</button><button type="button" id="settings-reload-update">Reload WebOS</button></div>
                <small>Update checks ask the browser to check the registered service worker. A remote release feed and detailed release history are not currently configured.</small>
            </section>

            <!-- LOCAL PROFILE AND STORAGE MANAGEMENT -->
            <section class="settings-section" style="display:flex;flex-direction:column;gap:1rem;">
                <h2>Storage &amp; Profiles</h2>
                <div id="settings-storage-info" class="settings-readout">Checking available browser storage…</div>
                <div class="settings-action-row"><button type="button" id="settings-export-profile">Export appearance profile</button><button type="button" id="settings-import-profile-trigger">Import appearance profile</button><input id="settings-import-profile" type="file" accept="application/json,.json" hidden></div>
                <small>Profiles include supported appearance and layout preferences, not lock credentials, personal data, or installed app source.</small>
            </section>

            <!-- ACCESSIBILITY AND INTERFACE CONTROLS -->
            <section class="settings-section" style="display:flex;flex-direction:column;gap:1rem;">
                <h2>Accessibility</h2>
                <label for="webos-ui-scale">Interface scale <output id="webos-ui-scale-value">100%</output></label>
                <input id="webos-ui-scale" type="range" min="85" max="125" step="5" value="100">
                <label class="setting-field"><input id="webos-high-contrast" type="checkbox"> Increase interface contrast</label>
                <small>These options affect WebOS interface presentation and are saved on this browser.</small>
            </section>

            <!-- SYSTEM DATA MANAGEMENT SECTION -->
            <section class="settings-section" style="display: flex; flex-direction: column; gap: 0.75rem;">
                <h2>System</h2><p>General system controls and preference import/export.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="settings-export" type="button">Export settings</button><button id="settings-import-trigger" type="button">Import settings</button><input id="settings-import-file" type="file" accept="application/json" hidden></div>
                <label class="setting-field" style="display:flex;align-items:center;gap:.6rem;cursor:pointer;">
                    <input id="fullscreen-always-choice" type="checkbox">
                    <span><strong>Enable always Fullscreen</strong><br><small>Keep WebOS in fullscreen after your next interaction. Browser permission and user-gesture rules still apply.</small></span>
                </label>
                <button type="button" id="clear-storage">Reset WebOS data</button>
                <p id="settings-status" style="font-size: 0.9rem; margin: 0; opacity: 0.8;" aria-live="polite">Changes are saved on this device.</p>
            </section>
        </div>
    `;

    // 2. Initialize application UI layout window context
    const win = createWindow("Better Settings", htmlTemplate);
    if (!win) return null;

    // Turn the existing settings sections into a compact, keyboard-friendly tabbed control center.
    const settingsPanel = win.querySelector(".AppPanel");
    const settingsSearch = document.createElement("input");
    settingsSearch.id = "settings-search"; settingsSearch.type = "search"; settingsSearch.placeholder = "Search all settings…";
    settingsSearch.setAttribute("aria-label","Search all settings"); settingsSearch.className = "settings-search-global";
    settingsPanel.insertBefore(settingsSearch, settingsPanel.firstChild);
    const settingsSections = Array.from(settingsPanel.querySelectorAll(":scope > .settings-section"));
    settingsPanel.querySelectorAll(":scope > hr").forEach(rule => rule.remove());
    if (settingsSections.length) {
        const tabBar = document.createElement("nav");
        tabBar.className = "settings-tabs";
        tabBar.setAttribute("role", "tablist");
        tabBar.setAttribute("aria-label", "Settings categories");
        const pane = document.createElement("div");
        pane.className = "settings-tab-content";
        const labelForSection = section => {
            const heading = section.querySelector("h2")?.textContent.trim() || "Settings";
            return ({
                "Better Settings": "Personalization",
                "Visual CSS Inspector": "Window Design"
            })[heading] || heading;
        };
        const categoryOrder = ["Personalization", "Window Design", "Apps & Applications", "Account & Cloud", "Notifications", "Privacy & Security", "Devices", "Developer Settings", "Updates", "Storage & Profiles", "Lock & Security", "Backup & Recovery", "Accessibility", "System"];
        settingsSections.sort((a, b) => categoryOrder.indexOf(labelForSection(a)) - categoryOrder.indexOf(labelForSection(b)));
        settingsSections.forEach((section, index) => {
            const label = labelForSection(section);
            const id = "webos-settings-tab-" + index;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "settings-tab" + (index === 0 ? " active" : "");
            button.textContent = label;
            button.title = label;
            button.id = id;
            button.setAttribute("role", "tab");
            button.setAttribute("aria-selected", String(index === 0));
            button.setAttribute("aria-controls", id + "-panel");
            section.classList.add("settings-tab-panel");
            section.id = id + "-panel";
            section.setAttribute("role", "tabpanel");
            section.setAttribute("aria-labelledby", id);
            section.hidden = index !== 0;
            button.addEventListener("click", () => {
                settingsSections.forEach((item, itemIndex) => {
                    item.hidden = itemIndex !== index;
                    tabBar.children[itemIndex]?.classList.toggle("active", itemIndex === index);
                    tabBar.children[itemIndex]?.setAttribute("aria-selected", String(itemIndex === index));
                });
            });
            tabBar.appendChild(button);
            pane.appendChild(section);
        });
        settingsPanel.insertBefore(pane, settingsPanel.firstChild);
        settingsPanel.insertBefore(tabBar, pane);
        settingsPanel.insertBefore(settingsSearch, pane);
    }

    settingsSearch.addEventListener("input",()=>{
        const q=settingsSearch.value.trim().toLowerCase();let first=-1;
        settingsSections.forEach((section,index)=>{
            const match=!q||section.textContent.toLowerCase().includes(q);
            section.hidden=!match;if(match&&first<0)first=index;
        });
        settingsPanel.querySelectorAll(".settings-tab").forEach((button,index)=>{
            button.hidden=!!q&&settingsSections[index]?.hidden;
            button.classList.toggle("active",index===first);
            button.setAttribute("aria-selected",String(index===first));
        });
    });
    const collectWebOSPreferences=()=>{const values={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith("webos-")&&!/lock-config|current-user|profile-data/.test(k))values[k]=localStorage.getItem(k);}return values;};
    const downloadJSON=(data,name)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);};
    const exportPrefs=()=>downloadJSON({format:"webos-settings",version:1,values:collectWebOSPreferences()},"webos-settings-backup.json");
    win.querySelector("#settings-export")?.addEventListener("click",exportPrefs);
    const fullExport=win.querySelector("#webos-full-export"),fullImportTrigger=win.querySelector("#webos-full-import-trigger"),fullImportFile=win.querySelector("#webos-full-import-file"),backupStatus=win.querySelector("#webos-backup-status");
    fullExport?.addEventListener("click",async()=>{try{if(!window.WebOSFileSystem?.exportBackup)throw Error("Filesystem backup API is unavailable. Reload WebOS and try again.");backupStatus.textContent="Collecting virtual filesystem…";const filesystem=await window.WebOSFileSystem.exportBackup();const backup={format:"webos-system-backup",version:1,createdAt:new Date().toISOString(),product:"WebOS",preferences:collectWebOSPreferences(),filesystem};downloadJSON(backup,"webos-full-backup-"+new Date().toISOString().slice(0,10)+".json");backupStatus.textContent="Full backup exported: "+filesystem.entries.length+" filesystem entries and supported preferences.";}catch(error){backupStatus.textContent="Export failed: "+error.message;}});
    fullImportTrigger?.addEventListener("click",()=>fullImportFile?.click());
    fullImportFile?.addEventListener("change",async()=>{const file=fullImportFile.files?.[0];if(!file)return;try{backupStatus.textContent="Reading and validating backup…";const backup=JSON.parse(await file.text());if(backup.format!=="webos-system-backup"||backup.version!==1||!backup.filesystem||!backup.preferences||typeof backup.preferences!=="object")throw Error("This is not a supported full WebOS backup.");if(!window.WebOSFileSystem?.importBackup)throw Error("Filesystem restore API is unavailable.");const mode=win.querySelector("#webos-restore-mode")?.value||"merge";const count=backup.filesystem.entries?.length||0;if(!confirm("Restore "+count+" virtual filesystem entries and WebOS preferences? "+(mode==="replace"?"This REPLACES the current virtual filesystem.":"Existing matching paths will be updated; other files remain.")))return;const result=await window.WebOSFileSystem.importBackup(backup.filesystem,{replace:mode==="replace"});for(const [key,value] of Object.entries(backup.preferences)){if(key.startsWith("webos-")&&!/lock-config|current-user|profile-data/.test(key)&&typeof value==="string")localStorage.setItem(key,value);}backupStatus.textContent="Restored "+result.imported+" filesystem entries. Reloading WebOS…";setTimeout(()=>location.reload(),700);}catch(error){backupStatus.textContent="Restore failed: "+error.message;}finally{fullImportFile.value="";}});
    const settingsFile=win.querySelector("#settings-import-file");win.querySelector("#settings-import-trigger")?.addEventListener("click",()=>settingsFile?.click());settingsFile?.addEventListener("change",async()=>{const file=settingsFile.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data.format!=="webos-settings"||data.version!==1||!data.values)throw Error("Unsupported settings backup.");for(const [key,value] of Object.entries(data.values))if(key.startsWith("webos-")&&!/lock-config|current-user|profile-data/.test(key)&&typeof value==="string")localStorage.setItem(key,value);status.textContent="Settings imported. Reloading…";setTimeout(()=>location.reload(),500);}catch(error){status.textContent="Import failed: "+error.message;}finally{settingsFile.value="";}});
    const fullCssEditor = win.querySelector("#css-full-editor");
    if (!fullCssEditor) { console.error("Settings UI is missing #css-full-editor."); return win; }

    // Ensure our global injection style element target path exists
    let styleElement = document.getElementById("custom-user-styles");
    if (!styleElement) {
        styleElement = document.createElement("style");
        styleElement.id = "custom-user-styles";
        document.head.appendChild(styleElement);
    }
    const storedCustomCss = localStorage.getItem("webos-custom-css") || "";
    let designerCss = localStorage.getItem("webos-window-designer-css") || "";
    styleElement.textContent = storedCustomCss + "\n" + designerCss;
    fullCssEditor.value = storedCustomCss;
    const designerIds = ["radius","blur","opacity","shadow","title-height","border","title-color","title-text"];
    const designerDefaults = {radius:16,blur:18,opacity:92,shadow:35,"title-height":40,border:"#65758b","title-color":"#273449","title-text":"#f4f7fb"};
    let designerState = {...designerDefaults};
    try { designerState = {...designerDefaults, ...JSON.parse(localStorage.getItem("webos-window-designer-state") || "{}")}; } catch (_) {}
    function applyWindowDesigner() {
      const q = id => win.querySelector("#designer-"+id);
      for (const id of designerIds) if(q(id)) designerState[id] = ["border","title-color","title-text"].includes(id) ? q(id).value : Number(q(id).value);
      designerCss = ".window-shell.glass{border-radius:"+designerState.radius+"px!important;background:rgba(22,30,45,"+(designerState.opacity/100).toFixed(2)+")!important;backdrop-filter:blur("+designerState.blur+"px)!important;border:1px solid "+designerState.border+"!important;box-shadow:0 18px 48px rgba(0,0,0,"+(designerState.shadow/100).toFixed(2)+")!important}.window-titlebar{height:"+designerState["title-height"]+"px!important;background:"+designerState["title-color"]+"!important;color:"+designerState["title-text"]+"!important}.window-title-content,.window-title-text{color:"+designerState["title-text"]+"!important}";
      localStorage.setItem("webos-window-designer-state",JSON.stringify(designerState));localStorage.setItem("webos-window-designer-css",designerCss);
      styleElement.textContent = (localStorage.getItem("webos-custom-css") || "") + "\n" + designerCss;
      for(const id of ["radius","blur","opacity","shadow","title-height"]){const output=win.querySelector("#designer-"+id+"-value");if(output)output.textContent=designerState[id]+(id==="opacity"||id==="shadow"?"%":"px");}
      const label=win.querySelector("#designer-status");if(label)label.textContent="Live preview applied and saved locally.";
    }
    for(const id of designerIds){const input=win.querySelector("#designer-"+id);if(input){input.value=designerState[id];input.addEventListener("input",applyWindowDesigner);}}
    applyWindowDesigner();
    win.querySelector("#designer-reset").addEventListener("click",()=>{designerState={...designerDefaults};for(const id of designerIds){const input=win.querySelector("#designer-"+id);if(input)input.value=designerState[id];}applyWindowDesigner();});

    // 3. Extract active DOM element bindings from compiled frame template
    const choice = win.querySelector("#theme-choice");
    const desktopStyleChoice = win.querySelector("#desktop-style-choice");
    const windowStyleChoice = win.querySelector("#window-style-choice");
    const motion = win.querySelector("#motion-choice");
    const accentChoice = win.querySelector("#accent-choice");
    const wallpaperChoice = win.querySelector("#wallpaper-choice");
    const wallpaperFile = win.querySelector("#wallpaper-file");
    const animationChoice = win.querySelector("#animation-choice");
    const ambientChoice = win.querySelector("#ambient-animation-choice");
    const liquidGlassChoice = win.querySelector("#liquid-glass-choice");
    const status = win.querySelector("#settings-status");
    const fullscreenChoice = win.querySelector("#fullscreen-always-choice");
    const lockMethodChoice = win.querySelector("#lock-method-choice");
    const lockPinField = win.querySelector("#lock-pin-field");
    const lockPatternField = win.querySelector("#lock-pattern-field");
    const lockPasscode = win.querySelector("#lock-passcode");
    const lockStartupChoice = win.querySelector("#lock-startup-choice");
    let setupPattern = [];
    
    const btnSpectate = win.querySelector("#btn-spectate");
    const hintText = win.querySelector("#inspector-hint");
    const insSelectorInput = win.querySelector("#ins-selector");
    const cssInputs = win.querySelectorAll(".css-prop-field");
    const btnSaveCss = win.querySelector("#btn-save-css");
    const btnClearCss = win.querySelector("#btn-clear-css");
    const btnApplyCss = win.querySelector("#btn-apply-css");

    let isSpectating = false;
    let selectedDomSelector = "";

    // 4. Set initialization states based on storage settings
    const scaleInput=win.querySelector("#webos-ui-scale"),scaleOutput=win.querySelector("#webos-ui-scale-value"),contrastInput=win.querySelector("#webos-high-contrast");
    const applyAccessibility=()=>{const scale=Math.max(85,Math.min(125,Number(scaleInput?.value)||100));localStorage.setItem("webos-ui-scale",String(scale));localStorage.setItem("webos-high-contrast",String(!!contrastInput?.checked));if(scaleOutput)scaleOutput.textContent=scale+"%";let style=document.getElementById("webos-accessibility-style");if(!style){style=document.createElement("style");style.id="webos-accessibility-style";document.head.appendChild(style);}style.textContent=":root{--webos-ui-scale:"+scale/100+"}#Desktop{font-size:calc(1rem * var(--webos-ui-scale))}"+(contrastInput?.checked?"#Desktop{filter:contrast(1.12)}.window-shell,.LauncherInner{border:1px solid currentColor!important}":"");};
    if(scaleInput){scaleInput.value=localStorage.getItem("webos-ui-scale")||"100";scaleInput.addEventListener("input",applyAccessibility);}if(contrastInput){contrastInput.checked=localStorage.getItem("webos-high-contrast")==="true";contrastInput.addEventListener("change",applyAccessibility);}applyAccessibility();
    const selectedTheme = localStorage.getItem("webos-theme") || "ocean";
    choice.value = selectedTheme;
    desktopStyleChoice.value = localStorage.getItem("webos-desktop-style") || "webos";
    windowStyleChoice.value = localStorage.getItem("webos-window-style") || "auto";
    motion.checked = localStorage.getItem("webos-reduced-motion") === "true";
    accentChoice.value = localStorage.getItem("webos-accent") || "#53b5ff";
    animationChoice.value = localStorage.getItem("webos-motion-style") || "smooth";
    ambientChoice.value = localStorage.getItem("webos-ambient-animation") || "aurora";
    liquidGlassChoice.checked = localStorage.getItem("webos-liquid-glass") === "true";
    fullscreenChoice.checked = localStorage.getItem("webos-always-fullscreen") === "true";
    lockMethodChoice.value = window.WebOSLock?.getMode() || "pin";
    lockStartupChoice.checked = localStorage.getItem("webos-lock-on-startup") === "true";
    const updateLockFields = () => { lockPinField.hidden = lockMethodChoice.value !== "pin"; lockPatternField.hidden = lockMethodChoice.value !== "pattern"; };
    updateLockFields();
    lockMethodChoice.addEventListener("change", updateLockFields);
    win.querySelector("#lock-setup-pattern").addEventListener("click", e => { const dot=e.target.closest("[data-setup-dot]"); if(!dot)return; const n=dot.dataset.setupDot; if(!setupPattern.includes(n)){setupPattern.push(n);dot.classList.add("selected");win.querySelector("#lock-pattern-count").textContent=setupPattern.length+" dots selected."; } });
    win.querySelector("#lock-pattern-clear").addEventListener("click",()=>{setupPattern=[];win.querySelectorAll("[data-setup-dot]").forEach(x=>x.classList.remove("selected"));win.querySelector("#lock-pattern-count").textContent="Connect at least 4 different dots.";});
    lockStartupChoice.addEventListener("change",()=>localStorage.setItem("webos-lock-on-startup",String(lockStartupChoice.checked)));
    win.querySelector("#lock-save-method").addEventListener("click",async()=>{try{const mode=lockMethodChoice.value;const secret=mode==="pin"?lockPasscode.value:mode==="pattern"?setupPattern.join("-"):"";await window.WebOSLock.configure(mode,secret);lockPasscode.value="";setupPattern=[];win.querySelectorAll("[data-setup-dot]").forEach(x=>x.classList.remove("selected"));win.querySelector("#lock-pattern-count").textContent="Connect at least 4 different dots.";status.textContent=mode==="swipe"?"Swipe lock saved (no passcode).":"Lock method saved on this device.";}catch(error){status.textContent=error.message;}});
    win.querySelector("#lock-now").addEventListener("click",()=>{if(!window.WebOSLock?.lock())status.textContent="Save a lock method first.";});
    win.querySelector("#lock-remove-method").addEventListener("click",()=>{localStorage.removeItem("webos-lock-config");localStorage.removeItem("webos-lock-on-startup");lockStartupChoice.checked=false;status.textContent="Session lock removed.";});
    document.body.dataset.liquidGlass = String(liquidGlassChoice.checked);
    const savedWallpaper = localStorage.getItem("webos-wallpaper") || "aurora";
    const savedCustomWallpaper = localStorage.getItem("webos-custom-wallpaper");
    wallpaperChoice.value = savedCustomWallpaper ? "custom" : savedWallpaper;
    document.body.dataset.reducedMotion = String(motion.checked);
    document.body.dataset.motion = animationChoice.value;
    document.body.style.setProperty("--accent", accentChoice.value);
    document.documentElement.style.setProperty("--accent", accentChoice.value);
    window.WebOSAppearance?.apply();

    if (savedCustomWallpaper) {
        document.body.dataset.wallpaper = "custom";
        document.body.style.backgroundImage = `linear-gradient(135deg, rgba(4, 10, 20, .30), rgba(4, 10, 20, .55)), url("${savedCustomWallpaper}")`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
    } else {
        document.body.dataset.wallpaper = savedWallpaper;
        document.body.style.removeProperty("background-image");
        document.body.style.removeProperty("background-size");
        document.body.style.removeProperty("background-position");
    }

    // System identity, palette and glass rendering controls.
    const brandName=win.querySelector("#os-brand-name"),brandSubtitle=win.querySelector("#os-brand-subtitle"),brandLogo=win.querySelector("#os-brand-logo"),brandVersion=win.querySelector("#os-brand-version"),brandHex=win.querySelector("#os-brand-accent-hex");
    if(brandName)brandName.value=localStorage.getItem("webos-brand-name")||"WebOS";
    if(brandSubtitle)brandSubtitle.value=localStorage.getItem("webos-brand-subtitle")||"A browser-based desktop environment";
    if(brandLogo)brandLogo.value=localStorage.getItem("webos-brand-logo")||"🖥️";
    if(brandVersion)brandVersion.value=localStorage.getItem("webos-brand-version")||"";
    if(brandHex)brandHex.value=localStorage.getItem("webos-accent")||"#53b5ff";
    const applyBrand=()=>{localStorage.setItem("webos-brand-name",(brandName?.value||"WebOS").trim().slice(0,32)||"WebOS");localStorage.setItem("webos-brand-subtitle",(brandSubtitle?.value||"").trim().slice(0,64));localStorage.setItem("webos-brand-logo",(brandLogo?.value||"🖥️").trim().slice(0,8)||"🖥️");localStorage.setItem("webos-brand-version",(brandVersion?.value||"").trim().slice(0,24));window.WebOSBranding?.apply();status.textContent="System identity saved on this device.";};
    [brandName,brandSubtitle,brandLogo,brandVersion].forEach(el=>el?.addEventListener("change",applyBrand));
    win.querySelectorAll("[data-accent]").forEach(button=>button.addEventListener("click",()=>{const value=button.dataset.accent;if(!/^#[0-9a-f]{6}$/i.test(value))return;accentChoice.value=value;if(brandHex)brandHex.value=value;localStorage.setItem("webos-accent",value);document.documentElement.style.setProperty("--accent",value);document.body.style.setProperty("--accent",value);window.WebOSAppearance?.apply();status.textContent="Accent color updated."; }));
    brandHex?.addEventListener("change",()=>{const value=brandHex.value.trim();if(!/^#[0-9a-f]{6}$/i.test(value)){status.textContent="Enter a valid six-digit hex color, e.g. #53B5FF.";return;}accentChoice.value=value;localStorage.setItem("webos-accent",value);document.documentElement.style.setProperty("--accent",value);document.body.style.setProperty("--accent",value);window.WebOSAppearance?.apply();});
    const refraction=win.querySelector("#glass-refraction-choice"),refractionStrength=win.querySelector("#glass-refraction-strength"),glassHighlight=win.querySelector("#glass-highlight-choice"),glassBlur=win.querySelector("#glass-blur-choice");
    if(refraction){refraction.checked=localStorage.getItem("webos-glass-refraction")==="true";refractionStrength.value=localStorage.getItem("webos-glass-refraction-strength")||"3";glassHighlight.value=localStorage.getItem("webos-glass-highlight")||"45";glassBlur.value=localStorage.getItem("webos-glass-blur")||"24";}
    const applyGlass=()=>{const enabled=!!refraction?.checked,strength=Math.max(0,Math.min(8,Number(refractionStrength?.value)||0)),highlight=Math.max(0,Math.min(100,Number(glassHighlight?.value)||0)),blur=Math.max(0,Math.min(40,Number(glassBlur?.value)||0));localStorage.setItem("webos-glass-refraction",String(enabled));localStorage.setItem("webos-glass-refraction-strength",String(strength));localStorage.setItem("webos-glass-highlight",String(highlight));localStorage.setItem("webos-glass-blur",String(blur));document.body.dataset.glassRefraction=String(enabled);document.documentElement.style.setProperty("--webos-glass-strength",String(strength));document.documentElement.style.setProperty("--webos-glass-highlight",String(highlight/100));document.documentElement.style.setProperty("--webos-glass-blur",blur+"px");const filter=document.querySelector("#webos-glass-refraction feDisplacementMap");if(filter)filter.setAttribute("scale",String(strength));for(const [id,val] of [["glass-refraction-strength-value",strength],["glass-highlight-choice-value",highlight+"%"],["glass-blur-choice-value",blur+"px"]]){const out=win.querySelector("#"+id);if(out)out.textContent=val;}};
    [refraction,refractionStrength,glassHighlight,glassBlur].forEach(el=>el?.addEventListener("input",applyGlass));applyGlass();

    // 5. System Configuration Event Handlers
    fullscreenChoice.addEventListener("change", async () => {
        localStorage.setItem("webos-always-fullscreen", String(fullscreenChoice.checked));
        if (!fullscreenChoice.checked) {
            if (document.fullscreenElement) {
                try { await document.exitFullscreen(); } catch (_) {}
            }
            status.textContent = "Always Fullscreen disabled.";
            return;
        }
        const entered = await window.WebOSFullscreen?.enter();
        status.textContent = entered ? "Fullscreen enabled." :
            "Saved. Click or press a key in WebOS to enter fullscreen if the browser blocked the request.";
    });

    desktopStyleChoice.addEventListener("change", () => { localStorage.setItem("webos-desktop-style", desktopStyleChoice.value); window.WebOSAppearance?.apply(); status.textContent = "Desktop preset applied."; });
    windowStyleChoice.addEventListener("change", () => { localStorage.setItem("webos-window-style", windowStyleChoice.value); window.WebOSAppearance?.apply(); status.textContent = "Window appearance updated."; });

    choice.addEventListener("change", () => {
        localStorage.setItem("webos-theme", choice.value);
        document.body.dataset.theme = choice.value;
        window.WebOSAppearance?.apply();
    });

    motion.addEventListener("change", () => {
        localStorage.setItem("webos-reduced-motion", motion.checked);
        document.body.dataset.reducedMotion = String(motion.checked);
        status.textContent = motion.checked ? "Reduced motion enabled." : "Full motion enabled.";
    });

    accentChoice.addEventListener("input", () => {
        localStorage.setItem("webos-accent", accentChoice.value);
        document.documentElement.style.setProperty("--accent", accentChoice.value);
        document.body.style.setProperty("--accent", accentChoice.value);
        window.WebOSAppearance?.apply();
    });

    animationChoice.addEventListener("change", () => {
        localStorage.setItem("webos-motion-style", animationChoice.value);
        document.body.dataset.motion = animationChoice.value;
    });
    ambientChoice.addEventListener("change", () => { localStorage.setItem("webos-ambient-animation", ambientChoice.value); window.WebOSAppearance?.apply(); status.textContent = "Desktop atmosphere updated."; });
    liquidGlassChoice.addEventListener("change", () => {
        localStorage.setItem("webos-liquid-glass", String(liquidGlassChoice.checked));
        document.body.dataset.liquidGlass = String(liquidGlassChoice.checked);
        status.textContent = liquidGlassChoice.checked ? "Experimental Liquid Glass enabled. Refraction varies by browser support." : "Liquid Glass disabled.";
    });

    wallpaperChoice.addEventListener("change", () => {
        if (wallpaperChoice.value === "custom" && !localStorage.getItem("webos-custom-wallpaper")) {
            status.textContent = "Choose an image file to set a custom wallpaper.";
            return;
        }
        localStorage.setItem("webos-wallpaper", wallpaperChoice.value);
        if (wallpaperChoice.value !== "custom") {
            localStorage.removeItem("webos-custom-wallpaper");
            document.body.style.removeProperty("background-image");
            document.body.style.removeProperty("background-size");
            document.body.style.removeProperty("background-position");
            document.body.dataset.wallpaper = wallpaperChoice.value;
        }
        window.WebOSAppearance?.apply();
    });

    wallpaperFile.addEventListener("change", () => {
        const file = wallpaperFile.files && wallpaperFile.files[0];
        if (!file) return;
        if (!file.type.startsWith("image/") || file.size > 2500000) {
            status.textContent = "Choose an image under 2.5 MB.";
            wallpaperFile.value = "";
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            try {
                localStorage.setItem("webos-custom-wallpaper", String(reader.result));
                localStorage.setItem("webos-wallpaper", "custom");
                wallpaperChoice.value = "custom";
                document.body.dataset.wallpaper = "custom";
                document.body.style.backgroundImage = `linear-gradient(135deg, rgba(4, 10, 20, .30), rgba(4, 10, 20, .55)), url("${reader.result}")`;
                document.body.style.backgroundSize = "cover";
                document.body.style.backgroundPosition = "center";
                window.WebOSAppearance?.apply();
                status.textContent = "Custom wallpaper saved on this device.";
            } catch (error) {
                status.textContent = "Could not save this image. Try a smaller file.";
            }
        };
        reader.readAsDataURL(file);
    });

    win.querySelector("#wallpaper-clear").addEventListener("click", () => {
        localStorage.removeItem("webos-custom-wallpaper");
        localStorage.setItem("webos-wallpaper", "aurora");
        wallpaperChoice.value = "aurora";
        document.body.dataset.wallpaper = "aurora";
        document.body.style.removeProperty("background-image");
        document.body.style.removeProperty("background-size");
        document.body.style.removeProperty("background-position");
        window.WebOSAppearance?.apply();
        status.textContent = "Custom wallpaper removed.";
    });

    win.querySelector("#reset-appearance").addEventListener("click", () => {
        localStorage.removeItem("webos-theme");
        localStorage.removeItem("webos-desktop-style"); localStorage.removeItem("webos-window-style");
        desktopStyleChoice.value = "webos"; windowStyleChoice.value = "auto";
        localStorage.removeItem("webos-accent");
        localStorage.removeItem("webos-wallpaper");
        localStorage.removeItem("webos-custom-wallpaper");
        localStorage.removeItem("webos-motion-style");
        localStorage.removeItem("webos-ambient-animation"); ambientChoice.value = "aurora";
        localStorage.removeItem("webos-reduced-motion");
        choice.value = "ocean";
        accentChoice.value = "#53b5ff";
        wallpaperChoice.value = "aurora";
        animationChoice.value = "smooth";
        motion.checked = false;
        liquidGlassChoice.checked = false;
        localStorage.removeItem("webos-liquid-glass");
        document.body.dataset.liquidGlass = "false";
        document.body.dataset.theme = "ocean";
        document.body.dataset.wallpaper = "aurora";
        document.body.dataset.motion = "smooth";
        document.body.dataset.reducedMotion = "false";
        document.body.style.removeProperty("--accent");
        document.documentElement.style.removeProperty("--accent");
        document.body.style.removeProperty("background-image");
        document.body.style.removeProperty("background-size");
        document.body.style.removeProperty("background-position");
        window.WebOSAppearance?.apply();
        status.textContent = "Appearance restored to defaults.";
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
                if (classes.length) selector += "." + classes.map(c => CSS.escape(c)).join(".");
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

    const inspectorOriginalOutlines = new WeakMap();
    function isInspectableTarget(target) {
        return target instanceof Element && !win.contains(target) &&
            !target.closest("#Launcher, .WebOSContextMenu") &&
            !["HTML", "BODY", "SCRIPT", "STYLE"].includes(target.tagName);
    }

    function onWorkspaceMouseOver(e) {
        if (!isInspectableTarget(e.target)) return;
        if (!inspectorOriginalOutlines.has(e.target)) inspectorOriginalOutlines.set(e.target, e.target.style.outline);
        e.target.style.outline = "2px dashed #48c8ff";
    }

    function onWorkspaceMouseOut(e) {
        if (!(e.target instanceof Element) || !inspectorOriginalOutlines.has(e.target)) return;
        e.target.style.outline = inspectorOriginalOutlines.get(e.target) || "";
        inspectorOriginalOutlines.delete(e.target);
    }

    function onWorkspaceClick(e) {
        if (!isInspectableTarget(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        const picked = e.target; // Inspect iframe elements without crossing their document boundary.
        selectedDomSelector = generateUniqueSelector(picked);
        insSelectorInput.value = selectedDomSelector;
        if (inspectorOriginalOutlines.has(picked)) {
            picked.style.outline = inspectorOriginalOutlines.get(picked) || "";
            inspectorOriginalOutlines.delete(picked);
        }

        cssInputs.forEach(input => {
            const propName = input.id.replace("css-", "");
            const escapedSelector = selectedDomSelector.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
            const regex = new RegExp(escapedSelector + "\\s*{[^}]*?" + propName + ":\\s*([^;!]+)[^}]*?}", "i");
            const match = styleElement.textContent.match(regex);
            input.value = match ? match[1].trim() : "";
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
    win.addEventListener("webos:window-close", stopSpectatingMode);

    /* ---------- MAIN MODIFICATION WRITER ENGINE ---------- */

    function validateAndApplyCss(source) {
        const value = String(source || "");
        if (/@import\b|expression\s*\(|javascript\s*:/i.test(value)) {
            throw new Error("@import, expression(), and javascript: are not allowed.");
        }
        let probe;
        if (typeof CSSStyleSheet === "function") {
            probe = new CSSStyleSheet();
            probe.replaceSync(value);
        } else {
            const testStyle = document.createElement("style");
            testStyle.textContent = value;
            document.head.appendChild(testStyle);
            probe = testStyle.sheet;
            if (!probe) { testStyle.remove(); throw new Error("Stylesheet parsing failed."); }
            testStyle.remove();
        }
        localStorage.setItem("webos-custom-css", value);
        styleElement.textContent = value + "\n" + designerCss;
        fullCssEditor.value = value;
        status.textContent = "CSS validated, saved locally, and injected.";
        return probe;
    }

    btnApplyCss.onclick = () => {
        try { validateAndApplyCss(fullCssEditor.value); }
        catch (error) { status.textContent = "CSS not applied: " + error.message; }
    };
    win.querySelector("#css-insert-starter").addEventListener("click", () => {
        const starters = {
            rounded: "/* Soft rounded windows */\n.window-shell.glass{border-radius:22px!important;box-shadow:0 24px 70px rgba(0,0,0,.32)!important}\n.window-titlebar{min-height:48px}",
            minimal: "/* Minimal monochrome */\n.window-shell.glass{background:#f4f4f5!important;color:#18181b!important;border:1px solid #d4d4d8!important;box-shadow:0 12px 36px #0002!important;backdrop-filter:none!important}\n.window-titlebar{background:#e4e4e7!important;color:#18181b!important}.window-body{color:#18181b!important;background:#fafafa!important}",
            neon: "/* Neon developer */\n.window-shell.glass{border:1px solid #35f2d0!important;box-shadow:0 0 28px #35f2d033!important;background:#08131b!important}.window-titlebar{background:#0d202b!important}",
            paper: "/* Warm paper */\n.window-shell.glass{background:#f1e8d8!important;color:#33291f!important;border:1px solid #cbb99e!important;backdrop-filter:none!important}.window-titlebar{background:#e3d5bf!important;color:#33291f!important}.window-body{background:#f8f1e6!important;color:#33291f!important}"
        };
        const css = starters[win.querySelector("#css-starter").value];
        if (!css) { status.textContent = "Choose a CSS starter first."; return; }
        fullCssEditor.value = fullCssEditor.value.trim() + (fullCssEditor.value.trim() ? "\n\n" : "") + css;
        status.textContent = "Starter inserted. Select Validate & Apply CSS to preview and save it.";
    });

    btnSaveCss.onclick = () => {
        if (!selectedDomSelector) return;
        try {
            const declarations = [];
            cssInputs.forEach(input => {
                const property = input.id.replace("css-", "");
                const value = input.value.trim();
                if (value && !/[{};]/.test(value)) declarations.push("  " + property + ": " + value + " !important;");
            });
            // Marker-delimited blocks avoid fragile selector-regex parsing and preserve
            // unrelated rules in the user's stylesheet.
            const marker = "/* WebOS inspector rule: " + selectedDomSelector.replace(/\*\//g, "") + " */";
            let source = fullCssEditor.value;
            const markerIndex = source.indexOf(marker);
            if (markerIndex >= 0) {
                const nextRule = source.indexOf("/* WebOS inspector rule:", markerIndex + marker.length);
                source = source.slice(0, markerIndex) + (nextRule >= 0 ? source.slice(nextRule) : "");
            }
            const addition = declarations.length ? marker + "\n" + selectedDomSelector + " {\n" + declarations.join("\n") + "\n}\n" : "";
            const next = source.trim() + (source.trim() && addition ? "\n\n" : "") + addition;
            fullCssEditor.value = next;
            validateAndApplyCss(next);
            status.textContent = "Selected element styles saved and injected.";
        } catch (error) { status.textContent = "Styles not saved: " + error.message; }
    };

    btnClearCss.onclick = () => {
        if (confirm("Reset all custom injected CSS modifications?")) {
            styleElement.textContent = designerCss;
            localStorage.removeItem("webos-custom-css");
            fullCssEditor.value = "";
            localStorage.removeItem("webos-custom-css");
            insSelectorInput.value = "";
            cssInputs.forEach(input => input.value = "");
            btnSaveCss.disabled = true;
            status.textContent = "Global custom stylesheet wiped.";
        }
    };

    win.addEventListener("webos:window-close", () => {
        if (isSpectating) stopSpectatingMode();
    });


    // Additional control-center integrations.
    const refreshAppSummary=async()=>{
        const apps=window.WebOSAppRegistry?.all?.()||[];
        let wasm=[];try{wasm=await window.WebOSWASM?.listApps?.()||[];}catch(_){}
        const appCount=win.querySelector("#settings-app-count"),wasmCount=win.querySelector("#settings-wasm-count");
        if(appCount)appCount.textContent=String(apps.length);if(wasmCount)wasmCount.textContent=String(wasm.length);
    };
    win.querySelector("#settings-open-app-manager")?.addEventListener("click",()=>{if(typeof window.WebOSAppRegistry?.launch==="function")window.WebOSAppRegistry.launch("appmanager");else window.openAppManager?.();});
    win.querySelector("#settings-refresh-apps")?.addEventListener("click",()=>refreshAppSummary());
    refreshAppSummary();

    const cloudStatus=win.querySelector("#settings-cloud-status");
    const cloudEmail=win.querySelector("#settings-cloud-email");
    const cloudPassword=win.querySelector("#settings-cloud-password");
    const cloudName=win.querySelector("#settings-cloud-display-name");
    const cloudSignIn=win.querySelector("#settings-cloud-signin");
    const cloudSignUp=win.querySelector("#settings-cloud-signup");
    const cloudSignOut=win.querySelector("#settings-cloud-signout");
    const cloudPush=win.querySelector("#settings-cloud-push");
    const cloudPull=win.querySelector("#settings-cloud-pull");
    const cloudAuto=win.querySelector("#settings-cloud-auto");
    cloudAuto.checked=localStorage.getItem("webos-cloud-auto-sync")==="true";
    const renderCloudState=()=>{
        const state=window.WebOSCloud?.getStatus?.()||{mode:"starting",message:"Cloud service is starting…"};
        cloudStatus.textContent=state.user?"Signed in as "+(state.user.email||"WebOS account")+" · "+state.message:state.message||"Local mode";
        const signedIn=!!state.user;
        cloudSignOut.hidden=!signedIn;
        cloudSignIn.disabled=cloudSignUp.disabled=signedIn||state.mode!=="ready";
        cloudPush.disabled=cloudPull.disabled=!signedIn||state.mode!=="ready";
        cloudEmail.disabled=cloudPassword.disabled=signedIn;
    };
    const cloudAction=async action=>{
        try{
            cloudStatus.textContent="Working…";
            const email=cloudEmail.value.trim(),password=cloudPassword.value;
            if(action==="signin"){await window.WebOSCloud.signIn(email,password);cloudPassword.value="";}
            else if(action==="signup"){await window.WebOSCloud.signUp(email,password,cloudName.value.trim());cloudPassword.value="";}
            else if(action==="signout")await window.WebOSCloud.signOut();
            else if(action==="push"){const result=await window.WebOSCloud.sync("push");cloudStatus.textContent="Cloud backup saved · "+result.bytes+" bytes.";}
            else if(action==="pull"){if(!confirm("Restore your cloud backup? This replaces the current WebOS virtual files and synced preferences on this device."))return;const result=await window.WebOSCloud.sync("pull");cloudStatus.textContent="Cloud backup restored · "+result.files+" filesystem entries.";}
        }catch(error){cloudStatus.textContent=(error?.message||"Cloud operation failed.")+" Local WebOS data remains available.";return;}
        renderCloudState();
    };
    cloudSignIn.addEventListener("click",()=>cloudAction("signin"));
    cloudSignUp.addEventListener("click",()=>cloudAction("signup"));
    cloudSignOut.addEventListener("click",()=>cloudAction("signout"));
    cloudPush.addEventListener("click",()=>cloudAction("push"));
    cloudPull.addEventListener("click",()=>cloudAction("pull"));
    cloudAuto.addEventListener("change",()=>localStorage.setItem("webos-cloud-auto-sync",String(cloudAuto.checked)));
    window.addEventListener("webos:cloud-state",renderCloudState);
    window.WebOSCloud?.ready?.then(renderCloudState);
    renderCloudState();
    win.querySelectorAll("[data-dev-app]").forEach(button=>button.addEventListener("click",()=>window.WebOSAppRegistry?.launch?.(button.dataset.devApp)));
    const notifyErrors=win.querySelector("#settings-notify-errors"),notifyUpdates=win.querySelector("#settings-notify-updates");
    notifyErrors.checked=localStorage.getItem("webos-notify-errors")!=="false";
    notifyUpdates.checked=localStorage.getItem("webos-notify-updates")!=="false";
    notifyErrors.addEventListener("change",()=>localStorage.setItem("webos-notify-errors",String(notifyErrors.checked)));
    notifyUpdates.addEventListener("change",()=>localStorage.setItem("webos-notify-updates",String(notifyUpdates.checked)));
    win.querySelector("#settings-notification-permission")?.addEventListener("click",async()=>{
        const result=await window.WebOSNotifications?.requestDesktopPermission?.()||"unsupported";
        win.querySelector("#settings-notification-status").textContent="Browser notification permission: "+result+".";
    });
    win.querySelector("#settings-test-notification")?.addEventListener("click",()=>window.WebOSNotifications?.notify?.("WebOS notification test","Your in-app notification center is working.",{icon:"✓",source:"Settings"}));
    win.querySelector("#settings-check-permissions")?.addEventListener("click",async()=>{
        const output=win.querySelector("#settings-permissions");
        const names=["camera","microphone","geolocation","notifications"];
        const lines=[];
        for(const name of names){try{const result=await navigator.permissions?.query?.({name});lines.push(name+": "+(result?.state||"not exposed"));}catch(_){lines.push(name+": not supported by this browser");}}
        lines.push("Secure context: "+(window.isSecureContext?"yes":"no"));
        output.textContent=lines.join(" · ");
    });
    win.querySelector("#settings-clear-site-data")?.addEventListener("click",()=>{
        if(!confirm("Clear WebOS cached site files and unregister its service worker? Your virtual files and browser preferences are not intentionally deleted. Export a backup first."))return;
        Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("WebOS-")).map(key=>caches.delete(key)))),navigator.serviceWorker?.getRegistrations?.().then(regs=>Promise.all(regs.map(reg=>reg.unregister())))])
          .then(()=>{win.querySelector("#settings-permissions").textContent="WebOS caches cleared. Reloading…";location.reload();})
          .catch(error=>{win.querySelector("#settings-permissions").textContent="Could not clear all site data: "+error.message;});
    });
    const refreshDeviceInfo=()=>{
        const rows=[
          ["Platform",navigator.userAgentData?.platform||navigator.platform||"Not exposed"],
          ["Browser",navigator.userAgentData?.brands?.map(x=>x.brand+" "+x.version).join(", ")||"User-agent details limited"],
          ["Screen",screen.width+" × "+screen.height+" · "+(window.devicePixelRatio||1)+"×"],
          ["Touch points",String(navigator.maxTouchPoints||0)],
          ["Language",navigator.language||"Unknown"],
          ["Online status",navigator.onLine?"Online":"Offline"],
          ["CPU threads",navigator.hardwareConcurrency?String(navigator.hardwareConcurrency):"Not exposed"],
          ["Memory",navigator.deviceMemory?navigator.deviceMemory+" GB (approx.)":"Not exposed"],
          ["Battery","Use the browser's device indicators; battery API is not universally available"],
          ["Wi-Fi","Browser does not expose the Wi-Fi network name"]
        ];
        win.querySelector("#settings-device-info").textContent=rows.map(([k,v])=>k+": "+v).join(" · ");
    };
    win.querySelector("#settings-refresh-device")?.addEventListener("click",refreshDeviceInfo);refreshDeviceInfo();
    win.querySelector("#settings-fullscreen-toggle")?.addEventListener("click",()=>{if(document.fullscreenElement)document.exitFullscreen?.();else window.WebOSFullscreen?.enter?.();});
    win.querySelector("#settings-debug-mode")?.addEventListener("change",e=>localStorage.setItem("webos-debug-mode",String(e.target.checked)));
    win.querySelector("#settings-debug-mode").checked=localStorage.getItem("webos-debug-mode")==="true";
    const updateStatus=win.querySelector("#settings-update-status");
    const refreshUpdateInfo=async()=>{
        const keys=await caches.keys().catch(()=>[]),build=keys.filter(key=>key.startsWith("WebOS-v")).sort().pop()||"No WebOS cache";
        win.querySelector("#settings-build-version").textContent=build.replace("WebOS-","");
        const registrations=await Promise.resolve(navigator.serviceWorker?.getRegistrations?.()).catch(()=>[])||[];
        win.querySelector("#settings-sw-state").textContent=registrations.length?"Registered":"Not registered";
        updateStatus.textContent=registrations.length?"Service worker is registered. Use Check for updates to ask the browser to fetch a newer build.":"No service worker registration found for this page.";
    };
    win.querySelector("#settings-check-update")?.addEventListener("click",async()=>{
        updateStatus.textContent="Checking for a service worker update…";
        try{const regs=await Promise.resolve(navigator.serviceWorker?.getRegistrations?.()).catch(()=>[])||[];if(!regs.length){updateStatus.textContent="No service worker is registered.";return;}
          await Promise.all(regs.map(reg=>reg.update()));updateStatus.textContent="Update check completed. If a new build is found, WebOS will activate it and show an update notification.";await refreshUpdateInfo();
        }catch(error){updateStatus.textContent="Update check failed: "+error.message;}
    });
    win.querySelector("#settings-reload-update")?.addEventListener("click",()=>location.reload());
    refreshUpdateInfo();
    const refreshStorage=async()=>{
        const estimate=await Promise.resolve(navigator.storage?.estimate?.()).catch(()=>null);
        const usage=estimate?.usage,quota=estimate?.quota;
        win.querySelector("#settings-storage-info").textContent=usage!=null&&quota?("Browser storage used: "+(usage/1048576).toFixed(1)+" MB of "+(quota/1048576).toFixed(0)+" MB estimated quota."):"Storage estimates are unavailable in this browser.";
    };
    refreshStorage();
    const profileKeys=["webos-theme","webos-accent","webos-wallpaper","webos-custom-wallpaper","webos-motion-style","webos-reduced-motion","webos-liquid-glass","webos-desktop-style","webos-window-style","webos-ambient-animation","webos-custom-css","webos-window-designer"];
    win.querySelector("#settings-export-profile")?.addEventListener("click",()=>{
        const values={};profileKeys.forEach(key=>{const value=localStorage.getItem(key);if(value!==null)values[key]=value;});
        downloadJSON({format:"webos-appearance-profile",version:1,values},"webos-appearance-profile.json");
    });
    const profilePicker=win.querySelector("#settings-import-profile"),profileTrigger=win.querySelector("#settings-import-profile-trigger");
    profileTrigger?.addEventListener("click",()=>profilePicker.click());
    profilePicker?.addEventListener("change",async()=>{
        const file=profilePicker.files?.[0];if(!file)return;
        try{const data=JSON.parse(await file.text());if(data.format!=="webos-appearance-profile"||data.version!==1||!data.values||typeof data.values!=="object"||Array.isArray(data.values))throw new Error("Unsupported appearance profile.");
          Object.entries(data.values).forEach(([key,value])=>{if(profileKeys.includes(key)&&typeof value==="string"&&value.length<3000000)localStorage.setItem(key,value);});
          window.WebOSAppearance?.apply();status.textContent="Appearance profile imported. Some controls may need the Settings window reopened.";
        }catch(error){status.textContent="Profile import failed: "+error.message;}finally{profilePicker.value="";}
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
    const html=`<section class="webos-calendar"><header class="calendar-heading"><div><h2>Calendar</h2><p id="calendar-month-label"></p></div><div class="calendar-nav"><button id="calendar-prev" type="button">‹</button><button id="calendar-today" type="button">Today</button><button id="calendar-next" type="button">›</button></div></header><div class="calendar-layout"><section><div class="calendar-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div id="calendar-grid" class="calendar-grid"></div></section><aside class="calendar-event-panel"><h3 id="calendar-selected-label">Selected date</h3><label for="calendar-event-title">Event title</label><input id="calendar-event-title" maxlength="100" placeholder="Add a title"><label for="calendar-note">Notes</label><textarea id="calendar-note" placeholder="Details and plans…"></textarea><button id="calendar-save" type="button">Save event</button><button id="calendar-delete" type="button">Delete event</button><p id="calendar-status" role="status"></p></aside></div><footer class="calendar-footer"><span>Events are saved locally in WebOS Documents.</span><button id="calendar-open-files" type="button">Open Files</button></footer></section>`;
    const win=createWindow("Calendar",html);if(!win)return null;const $=id=>win.querySelector("#"+id),grid=$("calendar-grid"),title=$("calendar-event-title"),note=$("calendar-note"),status=$("calendar-status");let month=new Date(),selected=new Date();month.setDate(1);
    const key=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"),filePath=d=>"/Documents/Calendar/"+key(d)+".json",same=(a,b)=>key(a)===key(b);
    async function load(){ $("calendar-selected-label").textContent=selected.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"});try{const f=await WebOSFileSystem.read(filePath(selected));let d=null;if(f?.content){try{d=JSON.parse(f.content);}catch(_){d={notes:f.content};}}title.value=d?.title||"";note.value=d?.notes||"";status.textContent="";}catch(e){title.value="";note.value="";status.textContent="Could not load event: "+e.message;}}
    async function render(){ $("calendar-month-label").textContent=month.toLocaleDateString(undefined,{month:"long",year:"numeric"});grid.replaceChildren();const first=new Date(month.getFullYear(),month.getMonth(),1),start=new Date(first);start.setDate(1-first.getDay());for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const b=document.createElement("button");b.type="button";b.className="calendar-day"+(d.getMonth()!==month.getMonth()?" outside":"")+(same(d,new Date())?" today":"")+(same(d,selected)?" selected":"");b.textContent=d.getDate();b.addEventListener("click",()=>{selected=d;grid.querySelectorAll(".calendar-day").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");load();});try{if(await WebOSFileSystem.read(filePath(d))){const dot=document.createElement("i");dot.className="calendar-event-dot";b.append(dot);}}catch(_){}grid.append(b);}}
    $("calendar-prev").onclick=()=>{month.setMonth(month.getMonth()-1);render();};$("calendar-next").onclick=()=>{month.setMonth(month.getMonth()+1);render();};$("calendar-today").onclick=()=>{selected=new Date();month=new Date(selected.getFullYear(),selected.getMonth(),1);render().then(load);};
    $("calendar-save").onclick=async()=>{try{await WebOSFileSystem.putText(filePath(selected),JSON.stringify({title:title.value.trim(),notes:note.value,updatedAt:new Date().toISOString()}),"application/json");status.textContent="Event saved.";render();}catch(e){status.textContent="Save failed: "+e.message;}};
    $("calendar-delete").onclick=async()=>{try{await WebOSFileSystem.remove(filePath(selected));title.value="";note.value="";status.textContent="Event deleted.";render();}catch(e){status.textContent="Delete failed: "+e.message;}};
    $("calendar-open-files").onclick=()=>openFiles();render().then(load);return win;
}

function openSystemMonitor() {
    closeLauncher();
    const html = `<section class="system-monitor">
      <header class="sm-header"><div><h2>System Monitor</h2><p>Live host and WebOS runtime telemetry</p></div><span class="sm-live"><i></i> LIVE</span></header>
      <nav class="sm-tabs"><button class="active" data-tab="overview">Overview</button><button data-tab="device">Device</button><button data-tab="network">Network</button><button data-tab="runtime">WebOS</button></nav>
      <div class="sm-content" data-view="overview"><div class="sm-cards" id="sm-cards"></div><section class="sm-section"><h3>Host device</h3><div id="sm-host" class="sm-grid"></div></section><section class="sm-section"><h3>WebOS runtime</h3><div id="sm-runtime" class="sm-grid"></div></section></div>
      <div class="sm-content" data-view="device" hidden><section class="sm-section"><h3>Battery & hardware</h3><div id="sm-device" class="sm-grid"></div></section><section class="sm-section"><h3>Browser & display</h3><div id="sm-browser" class="sm-grid"></div></section></div>
      <div class="sm-content" data-view="network" hidden><section class="sm-section"><h3>Connectivity</h3><div id="sm-network" class="sm-grid"></div><p class="sm-note">Wi-Fi name and signal strength are not exposed to ordinary browser applications. Connection details shown here are limited to browser-provided estimates.</p></section><section class="sm-section"><h3>Storage quota</h3><div id="sm-storage" class="sm-grid"></div></section></div>
      <div class="sm-content" data-view="runtime" hidden><section class="sm-section"><h3>WebOS processes</h3><div id="sm-processes" class="sm-processes"></div></section><section class="sm-section"><h3>Runtime details</h3><div id="sm-runtime-detail" class="sm-grid"></div></section></div>
      <footer class="sm-footer"><span id="sm-updated">Collecting metrics…</span><button id="sm-refresh">Refresh</button></footer>
    </section>`;
    const win=createWindow("System Monitor",html);if(!win)return null;
    const $=id=>win.querySelector("#"+id),formatBytes=n=>n==null?"Unavailable":n>=1073741824?(n/1073741824).toFixed(2)+" GB":n>=1048576?(n/1048576).toFixed(1)+" MB":Math.round(n/1024)+" KB";
    const cell=(label,value)=>{const node=document.createElement("div");node.className="sm-cell";const k=document.createElement("small");k.textContent=label;const v=document.createElement("strong");v.textContent=value==null?"Unavailable":String(value);node.append(k,v);return node;};
    const fill=(id,items)=>{$(id).replaceChildren(...items.map(x=>cell(x[0],x[1])));};
    win.querySelectorAll(".sm-tabs button").forEach(button=>button.addEventListener("click",()=>{win.querySelectorAll(".sm-tabs button").forEach(x=>x.classList.toggle("active",x===button));win.querySelectorAll(".sm-content").forEach(x=>x.hidden=x.dataset.view!==button.dataset.tab);}));
    async function update(){const info=await window.WebOSDeviceInfo?.getInfo?.()||{},storage=await window.WebOSDeviceInfo?.getStorage?.(),memory=info.memory,windows=[...document.querySelectorAll(".window-shell")].filter(x=>x.isConnected),apps=window.WebOSAppRegistry?.all?.()||[],wasmApps=await window.WebOSWASM?.listApps?.()||[];
      const battery=info.battery?.supported?(info.battery.level==null?"Permission/API unavailable":info.battery.level+"%"+(info.battery.charging?" · Charging":"")):"Not exposed";
      $("sm-cards").replaceChildren(cell("Open windows",windows.length),cell("Installed apps",apps.length),cell("WASM apps",wasmApps.length),cell("Battery",battery));
      fill("sm-host",[["Platform",info.platform],["Logical CPU cores",info.hardware?.logicalCores],["Device memory",info.hardware?.deviceMemoryGB?info.hardware.deviceMemoryGB+" GB":"Unavailable"],["Online",info.online?"Connected":"Offline"],["Secure context",info.secureContext?"Yes":"No"],["Visible state",info.visibility]]);
      fill("sm-runtime",[["JS heap used",memory?formatBytes(memory.usedBytes):"Browser hides this"],["JS heap total",memory?formatBytes(memory.totalBytes):"Browser hides this"],["Heap limit",memory?formatBytes(memory.limitBytes):"Browser hides this"],["IndexedDB", "Available"],["WebAssembly",typeof WebAssembly==="object"?"Supported":"Unavailable"],["User agent",info.browser]]);
      fill("sm-device",[["Battery",battery],["Charging",info.battery?.charging==null?"Unavailable":info.battery.charging?"Yes":"No"],["Charging time",info.battery?.chargingTime==null?"Unavailable":Math.round(info.battery.chargingTime/60)+" min"],["Touch points",info.hardware?.touchPoints],["Display",info.hardware?.screenWidth?info.hardware.screenWidth+" × "+info.hardware.screenHeight:"Unavailable"],["Pixel ratio",info.hardware?.pixelRatio]]);
      fill("sm-browser",[["Browser",info.browser],["Platform",info.platform],["Language",info.language],["Cores",info.hardware?.logicalCores],["Device memory",info.hardware?.deviceMemoryGB?info.hardware.deviceMemoryGB+" GB":"Unavailable"]]);
      fill("sm-network",[["Connection",info.online?"Online":"Offline"],["Network type",info.network?.type],["Effective type",info.network?.effectiveType],["Estimated downlink",info.network?.downlinkMbps==null?"Unavailable":info.network.downlinkMbps+" Mbps"],["Estimated RTT",info.network?.rttMs==null?"Unavailable":info.network.rttMs+" ms"],["Data saver",info.network?.saveData==null?"Unavailable":info.network.saveData?"On":"Off"],["Wi-Fi name","Not exposed by browser"],["Signal strength","Not exposed by browser"]]);
      fill("sm-storage",[["Used",formatBytes(storage?.usageBytes)],["Quota",formatBytes(storage?.quotaBytes)],["Usage",storage?.usagePercent==null?"Unavailable":storage.usagePercent+"%"]]);
      const processBox=$("sm-processes");processBox.replaceChildren();windows.forEach((node,index)=>{const row=document.createElement("div");row.className="sm-process";const title=node.querySelector(".window-title-text")?.textContent||"WebOS window";const detail=document.createElement("span");detail.textContent=title;const state=document.createElement("small");state.textContent=node.classList.contains("is-minimized")?"Minimized":"Active";row.append(detail,state);processBox.append(row);});if(!windows.length)processBox.textContent="No active windows.";
      fill("sm-runtime-detail",[["Registered apps",apps.length],["WASM installed",wasmApps.length],["WASM modules", (await window.WebOSWASM?.listModules?.()||[]).length],["Open windows",windows.length],["Page uptime",Math.round(performance.now()/1000)+" seconds"],["Storage engine","IndexedDB"]]);
      $("sm-updated").textContent="Updated "+new Date().toLocaleTimeString();
    }
    let busy=false;const refresh=async()=>{if(busy)return;busy=true;try{await update();}catch(error){window.WebOSNotifications?.notify?.("System Monitor",error.message,{level:"warning"});}finally{busy=false;}};$("sm-refresh").onclick=refresh;refresh();const timer=setInterval(refresh,2500);win.addEventListener("webos:window-close",()=>clearInterval(timer),{once:true});return win;
}
function openWasmLab() {
    if (typeof closeLauncher === "function") closeLauncher();
    const html = [
      '<div class="AppPanel wasm-lab" style="height:100%;box-sizing:border-box;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px;font-family:system-ui,sans-serif;">',
      '<header style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;"><div><h2 style="margin:0;font-size:1.25rem;">WASM Lab</h2><div style="font-size:.82rem;opacity:.7;">WebAssembly workbench · inspect · execute · persist</div></div><span id="wasm-status">No module loaded</span></header>',
      '<section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;"><label>Import .wasm binary<input id="wasm-file" type="file" accept=".wasm,application/wasm"></label><label>Saved modules<select id="wasm-library"><option value="">Loading library…</option></select><button id="wasm-load-saved" type="button">Load selected module</button></label></section>',
      '<section style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><button id="wasm-save" type="button" disabled>Save to /Documents/WASM</button><button id="wasm-download" type="button" disabled>Download binary</button><span id="wasm-module-meta">No module selected</span></section>',
      '<section class="wasm-module-manager" style="border:1px solid rgba(127,127,127,.25);border-radius:12px;padding:12px;display:grid;gap:8px;"><div style="display:flex;justify-content:space-between"><strong>Module library</strong><button id="wasm-modules-refresh" type="button">Refresh</button><button id="wasm-module-export" type="button">Export selected</button></div><div id="wasm-module-catalog">Loading…</div><details><summary>Create / import custom module</summary><label>Module ID<input id="wasm-custom-id" placeholder="com.example.math"></label><label>Name<input id="wasm-custom-name"></label><label>Version<input id="wasm-custom-version" value="1.0.0"></label><label>Factory source<textarea id="wasm-custom-source" rows="5" spellcheck="false" placeholder="return { double: (value) => value * 2 };"></textarea></label><button id="wasm-module-save" type="button">Save module</button><label>Import .wmod<input id="wasm-module-import" type="file" accept=".wmod,.json"></label><small>Factory source returns an object whose functions satisfy the WASM imports. It runs in the WASM worker.</small></details></section>',
      '<section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;"><label>Function export / entry point<select id="wasm-export" disabled><option value="">Load a module first</option></select></label><label>Arguments (one per line)<textarea id="wasm-args" rows="2" placeholder="argument 1&#10;argument 2"></textarea></label><label>Standard input (stdin)<textarea id="wasm-stdin" rows="2" placeholder="Text read by the program"></textarea></label><label>Environment variables (JSON object)<textarea id="wasm-env" rows="2" placeholder="{&quot;MODE&quot;:&quot;test&quot;}">{}</textarea></label></section>',
      '<section style="display:flex;gap:8px;flex-wrap:wrap;"><button id="wasm-run" type="button" disabled>▶ Run</button><button id="wasm-stop" type="button" disabled>■ Stop</button><button id="wasm-clear" type="button">Clear console</button><button id="wasm-refresh" type="button">Refresh library</button></section>',
      '<section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;"><div><h3>Module exports</h3><pre id="wasm-exports">No module loaded.</pre></div><div><h3>Required imports</h3><pre id="wasm-imports">No module loaded.</pre></div></section>',
      '<section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;"><div><h3>Linear memory inspector</h3><pre id="wasm-memory">Memory snapshot appears after a run.</pre></div><div><h3>Runtime console</h3><pre id="wasm-output" role="log" aria-live="polite">Choose a local .wasm file or saved module.</pre></div></section>',
      '<small>WASI Preview 1 subset: arguments, environment, stdin/stdout/stderr, a virtual /Documents filesystem preopened as /, clocks and random numbers. Changed files are saved after execution. Directory enumeration, rename, sockets, threads and WASI Preview 2 are not implemented. Runs in a disposable Worker with a 10-second limit; this is not a complete security sandbox.</small></div>'
    ].join("");
    const win=createWindow("WASM Lab",html);
    if(!win)return null;
    const $=s=>win.querySelector(s);
    const filePicker=$("#wasm-file"),library=$("#wasm-library"),loadSaved=$("#wasm-load-saved"),saveButton=$("#wasm-save"),downloadButton=$("#wasm-download");
    const exportsMenu=$("#wasm-export"),runButton=$("#wasm-run"),stopButton=$("#wasm-stop"),clearButton=$("#wasm-clear"),refreshButton=$("#wasm-refresh");
    const argsInput=$("#wasm-args"),stdinInput=$("#wasm-stdin"),envInput=$("#wasm-env"),output=$("#wasm-output"),exportsView=$("#wasm-exports"),importsView=$("#wasm-imports"),memoryView=$("#wasm-memory");
    const status=$("#wasm-status"),meta=$("#wasm-module-meta");
    let moduleBytes=null,moduleName="",activeWorker=null,activeWorkerUrl=null,runTimer=null,runStartedAt=0;
    const write=(message,type="log")=>{output.textContent+=(type==="error"?"[stderr] ":type==="system"?"[system] ":"[stdout] ")+String(message)+"\n";output.scrollTop=output.scrollHeight;};
    const stopExecution=reason=>{if(runTimer)clearTimeout(runTimer);runTimer=null;if(activeWorker){activeWorker.terminate();activeWorker=null;stopButton.disabled=true;runButton.disabled=!moduleBytes||!exportsMenu.value;if(reason)write(reason,"system");}if(activeWorkerUrl){URL.revokeObjectURL(activeWorkerUrl);activeWorkerUrl=null;}};
    const setModule=async(bytes,name,path)=>{
        stopExecution("Previous execution stopped.");moduleBytes=bytes.slice(0);moduleName=name;
        const compiled=await WebAssembly.compile(moduleBytes),ex=WebAssembly.Module.exports(compiled),im=WebAssembly.Module.imports(compiled);
        exportsView.textContent=ex.length?ex.map(x=>x.name+" · "+x.kind).join("\n"):"No exports.";
        importsView.textContent=im.length?im.map(x=>x.module+"."+x.name+" · "+x.kind).join("\n"):"No imports required.";
        exportsMenu.replaceChildren();const functions=ex.filter(x=>x.kind==="function");
        functions.forEach(x=>{const o=document.createElement("option");o.value=x.name;o.textContent=x.name+"()";exportsMenu.append(o);});
        const preferred=functions.find(x=>x.name==="_start")||functions.find(x=>x.name==="main")||functions[0];
        exportsMenu.disabled=!preferred; if(preferred)exportsMenu.value=preferred.name;
        runButton.disabled=!preferred;saveButton.disabled=false;downloadButton.disabled=false;
        status.textContent="Compiled · "+functions.length+" function(s)";
        meta.textContent=name+" · "+moduleBytes.byteLength.toLocaleString()+" bytes"+(path?" · "+path:"");
        memoryView.textContent=ex.some(x=>x.kind==="memory")?"Memory export found. Run to capture a snapshot.":"No exported linear memory.";
        write("Compiled "+name+" ("+moduleBytes.byteLength.toLocaleString()+" bytes).","system");
        write(ex.length+" export(s), "+im.length+" import(s).","system");
    };
    const refreshLibrary=async()=>{
        library.replaceChildren();const first=document.createElement("option");first.value="";first.textContent="Choose a saved module";library.append(first);
        try{const entries=await window.WebOSFileSystem.list("/Documents/WASM");entries.filter(x=>x.type==="file"&&(/\.wasm$/i.test(x.path)||x.mimeType==="application/wasm")).forEach(x=>{const o=document.createElement("option");o.value=x.path;o.textContent=x.path.split("/").pop()+" · "+(x.size||0).toLocaleString()+" bytes";library.append(o);});}
        catch(error){write("Library unavailable: "+error.message,"error");}
    };
    const moduleCatalog=$("#wasm-module-catalog"),moduleState={selected:""};
    const refreshModules=async()=>{const modules=await window.WebOSWASM.listModules();moduleCatalog.replaceChildren();modules.forEach(m=>{const row=document.createElement("label"),radio=document.createElement("input"),span=document.createElement("span");row.style.cssText="display:flex;gap:8px;padding:5px";radio.type="radio";radio.name="wasm-module-choice";radio.value=m.id;radio.checked=moduleState.selected===m.id;radio.onchange=()=>moduleState.selected=m.id;span.textContent=m.name+" · "+m.id+" · v"+m.version+" — "+(m.description||m.kind||"custom");row.append(radio,span);moduleCatalog.append(row);});if(!moduleState.selected&&modules.length)moduleState.selected=modules[0].id;};
    $("#wasm-modules-refresh").onclick=()=>refreshModules().catch(e=>write(e.message,"error"));
    $("#wasm-module-save").onclick=async()=>{try{const source=$("#wasm-custom-source").value;new Function("host",source);const m=await window.WebOSWASM.saveModule({id:$("#wasm-custom-id").value,name:$("#wasm-custom-name").value,version:$("#wasm-custom-version").value,source});moduleState.selected=m.id;await refreshModules();write("Saved module "+m.id,"system");}catch(e){write("Module save failed: "+e.message,"error");}};
    $("#wasm-module-import").onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const m=JSON.parse(await f.text());await window.WebOSWASM.saveModule(m);moduleState.selected=m.id;await refreshModules();write("Imported "+m.id,"system");}catch(x){write(x.message,"error");}e.target.value="";};
    $("#wasm-module-export").onclick=async()=>{try{const m=await window.WebOSWASM.getModule(moduleState.selected);if(!m?.source)throw Error("Select a custom module.");const u=URL.createObjectURL(new Blob([JSON.stringify(m,null,2)],{type:"application/json"})),a=document.createElement("a");a.href=u;a.download=m.id+".wmod";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}catch(e){write(e.message,"error");}};
    refreshModules().catch(e=>write(e.message,"error"));
    filePicker.addEventListener("change",async()=>{const f=filePicker.files?.[0];if(!f)return;output.textContent="Reading "+f.name+"…\n";try{await setModule(await f.arrayBuffer(),f.name);}catch(e){moduleBytes=null;status.textContent="Invalid module";write(e.message,"error");}});
    loadSaved.addEventListener("click",async()=>{if(!library.value)return;try{const bytes=await window.WebOSFileSystem.readBinary(library.value);if(!bytes)throw new Error("Saved binary could not be read.");await setModule(bytes,library.value.split("/").pop(),library.value);}catch(e){write(e.message,"error");}});
    saveButton.addEventListener("click",async()=>{if(!moduleBytes)return;try{const safeName=moduleName.replace(/[\\/:*?"<>|]/g,"_");await window.WebOSFileSystem.putBinary("/Documents/WASM/"+safeName,moduleBytes,"application/wasm");write("Saved to /Documents/WASM/"+safeName,"system");await refreshLibrary();}catch(e){write("Save failed: "+e.message,"error");}});
    downloadButton.addEventListener("click",()=>{if(!moduleBytes)return;const url=URL.createObjectURL(new Blob([moduleBytes],{type:"application/wasm"}));const a=document.createElement("a");a.href=url;a.download=moduleName||"module.wasm";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    exportsMenu.addEventListener("change",()=>{runButton.disabled=!moduleBytes||!exportsMenu.value||!!activeWorker;});
    runButton.addEventListener("click",async()=>{
        if(!moduleBytes||!exportsMenu.value||activeWorker)return;
        const args=argsInput.value.split(/\r?\n/).filter(x=>x.length>0);
        let env;
        try {
            env=JSON.parse(envInput.value||"{}");
            if(!env||typeof env!=="object"||Array.isArray(env)) throw new Error("Environment must be a JSON object.");
            if(Object.values(env).some(value=>value!==null&&typeof value==="object")) throw new Error("Environment values must be strings or primitive values.");
        } catch(error) {
            write("Invalid environment JSON: "+error.message,"error");
            return;
        }
        const stdin=stdinInput.value;
        let filesystem;
        try {
            filesystem={files:[],directories:["/"]};
            let total=0,visited=0;
            async function walk(folder,relative) {
                for(const entry of await window.WebOSFileSystem.list(folder)) {
                    if(++visited>500) throw new Error("The Documents snapshot is limited to 500 entries.");
                    const child=entry.path.split("/").pop(),path=(relative==="/"?"":relative)+"/"+child;
                    if(entry.type==="directory") { filesystem.directories.push(path); await walk(entry.path,path); }
                    else {
                        const bytes=await window.WebOSFileSystem.readBinary(entry.path);
                        if(!bytes) continue;
                        total+=bytes.byteLength;
                        if(total>10*1024*1024) throw new Error("The Documents snapshot is limited to 10 MB.");
                        filesystem.files.push({path,bytes:Array.from(new Uint8Array(bytes)),binary:!!entry.binary,mimeType:entry.mimeType||"text/plain"});
                    }
                }
            }
            await walk("/Documents","/");
        } catch(error) { write("Filesystem snapshot failed: "+error.message,"error"); return; }
        output.textContent="";memoryView.textContent="Waiting for execution…";write("Starting "+moduleName+" → "+exportsMenu.value+"()","system");runStartedAt=performance.now();
        const workerSource=[
          "self.onmessage=async event=>{const d=event.data;let instance=null,memory=null;const enc=new TextEncoder(),dec=new TextDecoder();const callArgs=d.args.map(x=>/^-?\\d+n$/.test(x)?BigInt(x.slice(0,-1)):(()=>{try{return JSON.parse(x);}catch{return x;}})());const send=(type,message)=>self.postMessage({type,message:String(message)});",
          "try{const mod=await WebAssembly.compile(d.bytes),descs=WebAssembly.Module.imports(mod),imports={};let stdin=enc.encode(d.stdin||''),stdinAt=0;const envEntries=Object.entries(d.env||{}).map(([k,v])=>k+'='+String(v));const E={SUCCESS:0,BADF:8,INVAL:28,NOENT:44,EXIST:20,NOTSUP:58};const vfs=new Map((d.files||[]).map(f=>[f.path,{bytes:new Uint8Array(f.bytes),dirty:false,binary:!!f.binary,mimeType:f.mimeType||'application/octet-stream'}]));const dirs=new Set(d.directories||['/']);let nextFd=4;const handles=new Map(),deleted=new Set(),newDirs=new Set();",
          "const mem=()=>memory||(instance&&instance.exports.memory);const dv=()=>{const m=mem();if(!m)throw Error('WASI call requires accessible exported memory.');return new DataView(m.buffer);};const norm=p=>{const a=[],parts=p.split('/');for(const x of parts){if(!x||x==='.')continue;if(x==='..'){if(!a.length)return null;a.pop();}else a.push(x);}return '/'+a.join('/');};const readPath=(p,n)=>{const m=mem();if(!m||p+n>m.buffer.byteLength)return null;return dec.decode(new Uint8Array(m.buffer,p,n));};",
          "const wasi={proc_exit:c=>{if(c!==0)throw Error('Program exited with status '+c);return 0;},sched_yield:()=>0,fd_close:fd=>{if(fd<4||!handles.has(fd))return E.BADF;handles.delete(fd);return 0;},fd_sync:()=>0,fd_datasync:()=>0,fd_advise:()=>0,",
          "fd_write:(fd,iovs,n,written)=>{const v=dv(),m=mem();let total=0,s='';for(let i=0;i<n;i++){const p=v.getUint32(iovs+i*8,true),l=v.getUint32(iovs+i*8+4,true);if(p+l>m.buffer.byteLength)return E.INVAL;const chunk=new Uint8Array(m.buffer,p,l);if(fd>=4){const h=handles.get(fd);if(!h)return E.BADF;const end=h.pos+l,merged=new Uint8Array(Math.max(h.bytes.length,end));merged.set(h.bytes);merged.set(chunk,h.pos);h.bytes=merged;h.pos=end;const item=vfs.get(h.path);if(item){item.bytes=merged;item.dirty=true;}}else s+=dec.decode(chunk);total+=l;}if(written)v.setUint32(written,total,true);if(fd<4&&s)send(fd===2?'error':'log',s);return 0;},",
          "fd_read:(fd,iovs,n,out)=>{const v=dv(),m=mem();let total=0;if(fd===0){for(let i=0;i<n&&stdinAt<stdin.length;i++){const p=v.getUint32(iovs+i*8,true),l=v.getUint32(iovs+i*8+4,true),k=Math.min(l,stdin.length-stdinAt);new Uint8Array(m.buffer,p,k).set(stdin.subarray(stdinAt,stdinAt+k));stdinAt+=k;total+=k;}}else{const h=handles.get(fd);if(!h)return E.BADF;for(let i=0;i<n&&h.pos<h.bytes.length;i++){const p=v.getUint32(iovs+i*8,true),l=v.getUint32(iovs+i*8+4,true),k=Math.min(l,h.bytes.length-h.pos);new Uint8Array(m.buffer,p,k).set(h.bytes.subarray(h.pos,h.pos+k));h.pos+=k;total+=k;}}if(out)v.setUint32(out,total,true);return 0;},",
          "fd_seek:(fd,offset,whence,out)=>{const h=handles.get(fd);if(!h)return E.BADF;const base=whence===0?0:whence===1?h.pos:whence===2?h.bytes.length:-1,pos=base+Number(offset);if(base<0||!Number.isSafeInteger(pos)||pos<0)return E.INVAL;h.pos=pos;dv().setBigUint64(out,BigInt(pos),true);return 0;},fd_tell:(fd,out)=>{const h=handles.get(fd);if(!h)return E.BADF;dv().setBigUint64(out,BigInt(h.pos),true);return 0;},fd_fdstat_get:(fd,p)=>{const v=dv(),m=mem();new Uint8Array(m.buffer,p,24).fill(0);v.setUint16(p,fd===3?3:fd<3?2:4,true);return 0;},fd_fdstat_set_flags:()=>0,fd_fdstat_set_rights:()=>0,",
          "args_sizes_get:(argc,buf)=>{const v=dv();v.setUint32(argc,d.args.length,true);v.setUint32(buf,d.args.reduce((n,x)=>n+enc.encode(x).length+1,0),true);return 0;},",
          "args_get:(argv,buf)=>{const v=dv(),m=mem();let p=buf;d.args.forEach((x,i)=>{v.setUint32(argv+i*4,p,true);const b=enc.encode(x+'\\0');new Uint8Array(m.buffer,p,b.length).set(b);p+=b.length;});return 0;},",
          "environ_sizes_get:(c,s)=>{const v=dv();v.setUint32(c,envEntries.length,true);v.setUint32(s,envEntries.reduce((n,x)=>n+enc.encode(x).length+1,0),true);return 0;},environ_get:(ptr,buf)=>{const v=dv(),m=mem();let p=buf;envEntries.forEach((x,i)=>{v.setUint32(ptr+i*4,p,true);const b=enc.encode(x+'\\0');new Uint8Array(m.buffer,p,b.length).set(b);p+=b.length;});return 0;},",
          "clock_time_get:(id,precision,out)=>{dv().setBigUint64(out,BigInt(Date.now())*1000000n,true);return 0;},clock_res_get:(id,out)=>{dv().setBigUint64(out,1000000n,true);return 0;},",
          "random_get:(p,n)=>{const out=new Uint8Array(mem().buffer,p,n);for(let i=0;i<n;i+=65536){const k=Math.min(65536,n-i);crypto.getRandomValues(out.subarray(i,i+k));}return 0;},",
          "fd_prestat_get:(fd,p)=>{if(fd!==3)return E.BADF;new Uint8Array(mem().buffer,p,8).fill(0);dv().setUint32(p+4,1,true);return 0;},fd_prestat_dir_name:(fd,p,n)=>{if(fd!==3)return E.BADF;if(n<1)return E.INVAL;new Uint8Array(mem().buffer,p,1)[0]=47;return 0;},",
          "path_open:(dirfd,dirflags,pp,pn,oflags,base,inherit,fdflags,out)=>{if(dirfd!==3)return E.BADF;const raw=readPath(pp,pn);if(raw===null)return E.INVAL;const path=norm(raw);if(path===null)return E.INVAL;let item=vfs.get(path);if(!item&&!dirs.has(path)){if(!(oflags&1))return E.NOENT;item={bytes:new Uint8Array(0),dirty:true,binary:false,mimeType:'text/plain'};vfs.set(path,item);}if(dirs.has(path))return E.INVAL;if(oflags&8){item.bytes=new Uint8Array(0);item.dirty=true;}const fd=nextFd++;handles.set(fd,{path,pos:(fdflags&1)?item.bytes.length:0,bytes:item.bytes});dv().setUint32(out,fd,true);return 0;},",
          "path_create_directory:(fd,p,n)=>{if(fd!==3)return E.BADF;const raw=readPath(p,n),path=raw===null?null:norm(raw);if(!path||dirs.has(path)||vfs.has(path))return E.EXIST;dirs.add(path);newDirs.add(path);return 0;},path_unlink_file:(fd,p,n)=>{if(fd!==3)return E.BADF;const raw=readPath(p,n),path=raw===null?null:norm(raw);if(!path||!vfs.has(path))return E.NOENT;vfs.delete(path);deleted.add(path);return 0;},",
          "path_remove_directory:(fd,p,n)=>{if(fd!==3)return E.BADF;const raw=readPath(p,n),path=raw===null?null:norm(raw);if(!path||!dirs.has(path))return E.NOENT;if([...dirs].some(x=>x!==path&&x.startsWith(path+'/'))||[...vfs.keys()].some(x=>x.startsWith(path+'/')))return E.INVAL;dirs.delete(path);newDirs.delete(path);deleted.add(path);return 0;},path_rename:()=>E.NOTSUP,path_filestat_get:()=>E.NOTSUP,path_filestat_set_times:()=>E.NOTSUP,path_link:()=>E.NOTSUP,path_symlink:()=>E.NOTSUP,path_readlink:()=>E.NOTSUP,fd_readdir:()=>E.NOTSUP,poll_oneoff:()=>E.NOTSUP};",
          "for(const x of descs){if(x.kind!=='function')throw Error('Unsupported imported '+x.kind+': '+x.module+'.'+x.name);if(!imports[x.module])imports[x.module]={};const f=(x.module==='wasi_snapshot_preview1'||x.module==='wasi_unstable')?wasi[x.name]:x.module==='env'&&x.name==='abort'?(()=>{throw Error('env.abort called');}):x.module==='env'&&x.name==='emscripten_notify_memory_growth'?(()=>{}):null;if(!f)throw Error('Unsupported import '+x.module+'.'+x.name+'. No silent stub installed.');imports[x.module][x.name]=f;}",
          "const r=await WebAssembly.instantiate(mod,imports);instance=r;memory=r.exports.memory||memory;const fn=r.exports[d.exportName];if(typeof fn!=='function')throw Error('Export is not callable.');send('system','Module instantiated; calling '+d.exportName+'().');const value=fn(...callArgs);send('system','Return value: '+(typeof value==='bigint'?value.toString()+'n':String(value)));",
          "if(memory){const b=new Uint8Array(memory.buffer),lim=Math.min(b.length,256),rows=[];for(let i=0;i<lim;i+=16){const c=b.subarray(i,Math.min(i+16,lim)),h=Array.from(c,x=>x.toString(16).padStart(2,'0')).join(' '),a=Array.from(c,x=>x>=32&&x<127?String.fromCharCode(x):'.').join('');rows.push(i.toString(16).padStart(8,'0')+'  '+h.padEnd(47)+'  '+a);}self.postMessage({type:'memory',message:'Memory size: '+b.length+' bytes ('+(b.length/65536)+' pages)\\n'+rows.join('\\n')});}const changes=[];for(const [path,item] of vfs)if(item.dirty)changes.push({path,bytes:Array.from(item.bytes),binary:item.binary,mimeType:item.mimeType});self.postMessage({type:'fs',files:changes,directories:[...newDirs],deleted:[...deleted]});send('done','Execution finished.');",
          "}catch(e){send('failure',e&&e.message?e.message:String(e));}};"
        ].join("\n");
        try{const blob=new Blob([workerSource],{type:"text/javascript"}),url=URL.createObjectURL(blob),worker=new Worker(url);activeWorker=worker;activeWorkerUrl=url;runButton.disabled=true;stopButton.disabled=false;
          let filesystemSave=Promise.resolve();worker.onmessage=async e=>{const d=e.data||{};if(d.type==="log")write(d.message);else if(d.type==="error")write(d.message,"error");else if(d.type==="system")write(d.message,"system");else if(d.type==="memory")memoryView.textContent=d.message;else if(d.type==="fs"){filesystemSave=filesystemSave.then(async()=>{for(const p of d.deleted||[])await window.WebOSFileSystem.remove("/Documents"+p);for(const p of d.directories||[])await window.WebOSFileSystem.makeDirectory("/Documents"+p);for(const f of d.files||[]){const bytes=new Uint8Array(f.bytes);if(!f.binary){try{await window.WebOSFileSystem.putText("/Documents"+f.path,new TextDecoder("utf-8",{fatal:true}).decode(bytes));continue;}catch(error){}}await window.WebOSFileSystem.putBinary("/Documents"+f.path,bytes,f.mimeType||"application/octet-stream");}write("Saved "+(d.files||[]).length+" changed file(s) to /Documents.","system");}).catch(error=>{write("Filesystem save failed: "+error.message,"error");});}else if(d.type==="failure"){URL.revokeObjectURL(url);activeWorkerUrl=null;write(d.message,"error");stopExecution("Execution failed.");}else if(d.type==="done"){await filesystemSave;URL.revokeObjectURL(url);activeWorkerUrl=null;write("Completed in "+(performance.now()-runStartedAt).toFixed(2)+" ms.","system");stopExecution();}};
          worker.onerror=e=>{URL.revokeObjectURL(url);activeWorkerUrl=null;write(e.message||"Worker error.","error");stopExecution("Worker stopped.");};runTimer=setTimeout(()=>stopExecution("Execution time limit reached (10 seconds)."),10000);worker.postMessage({bytes:moduleBytes.slice(0),exportName:exportsMenu.value,args,stdin,env,files:filesystem.files,directories:filesystem.directories});
        }catch(e){write(e.message,"error");stopExecution();}
    });
    stopButton.addEventListener("click",()=>stopExecution("Execution stopped by user."));
    clearButton.addEventListener("click",()=>{output.textContent="";});
    refreshButton.addEventListener("click",refreshLibrary);
    win.addEventListener("webos:window-close",()=>stopExecution("WASM Lab closed; worker terminated."));
    refreshLibrary();return win;
}

// Persistent fullscreen preference. Browsers require a user activation, so retry on
// the next real interaction instead of attempting a blocked request during page load.
(() => {
    let pending = false;
    async function enter() {
        if (localStorage.getItem("webos-always-fullscreen") !== "true") return false;
        if (document.fullscreenElement) return true;
        const target = document.documentElement;
        if (!target?.requestFullscreen) return false;
        try { await target.requestFullscreen(); pending = false; return true; }
        catch (_) { pending = true; return false; }
    }
    function retry() {
        if (pending || localStorage.getItem("webos-always-fullscreen") === "true") enter();
    }
    document.addEventListener("pointerdown", retry, true);
    document.addEventListener("keydown", retry, true);
    document.addEventListener("fullscreenchange", () => {
        if (!document.fullscreenElement && localStorage.getItem("webos-always-fullscreen") === "true") pending = true;
    });
    window.WebOSFullscreen = Object.freeze({ enter });
    pending = localStorage.getItem("webos-always-fullscreen") === "true";
})();

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

    const preview = document.createElement("div");
    preview.className = "CreatorLivePreview";
    const previewLabel = document.createElement("span"); previewLabel.textContent = "LIVE APP PREVIEW";
    const previewIcon = document.createElement("strong"); previewIcon.textContent = "📦";
    const previewName = document.createElement("b"); previewName.textContent = "My Custom App";
    const previewDesc = document.createElement("small"); previewDesc.textContent = "Your app description";
    preview.append(previewLabel, previewIcon, previewName, previewDesc);
    appDescInput.parentElement.appendChild(preview);
    const refreshCreatorPreview = () => {
        previewIcon.textContent = appIconInput.value.trim() || "📦";
        previewName.textContent = appNameInput.value.trim() || "My Custom App";
        previewDesc.textContent = appDescInput.value.trim() || "Your app description";
    };
    [appIconInput, appNameInput, appDescInput].forEach(input => input.addEventListener("input", refreshCreatorPreview));
    refreshCreatorPreview();

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


// App Creator Studio v2 — portable XIP packages and live JavaScript highlighting.
function openAppCreator() {
    if (typeof closeLauncher === "function") closeLauncher();
    const html = `
    <section class="xip-studio">
      <header class="xip-header"><div><h2>App Creator Studio</h2><p>Create JavaScript, WebAssembly, or hybrid applications. Build and test directly in WebOS.</p></div><span class="xip-version">XIP · v2</span></header>
      <div class="xip-fields">
        <label>App ID<input id="xip-id" placeholder="com.example.myapp" autocomplete="off"></label>
        <label>Display name<input id="xip-name" placeholder="My WebOS App"></label>
        <label>Icon<input id="xip-icon" value="🧩" maxlength="8"></label>
        <label class="xip-dock-check"><input id="xip-dock" type="checkbox" checked> Pin to dock</label>
        <label class="xip-description">Description<textarea id="xip-description" rows="2" placeholder="What does your app do?"></textarea></label>
      </div>
      <label class="xip-runtime-choice">Runtime type<select id="xip-runtime-type"><option value="js">JavaScript</option><option value="wasm">WebAssembly</option><option value="both">Both · JavaScript + WASM</option></select></label><div id="xip-js-panel"><div class="xip-editor-head"><strong>JavaScript handler</strong><span>async function(api, argument)</span><button id="xip-template" type="button">Reset template</button></div>
      <div class="xip-code-wrap"><pre id="xip-highlight" aria-hidden="true"></pre><textarea id="xip-code" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="JavaScript source"></textarea></div>
      <details class="xip-style"><summary>Optional app stylesheet</summary><textarea id="xip-css" spellcheck="false" placeholder=".my-app { padding: 1rem; }"></textarea></details></div>
      <details id="xip-wasm-builder" class="xip-style xip-wasm-builder"><summary>WebAssembly application project</summary><p>Attach a compiled .wasm binary, source and required modules. The project is packaged and stored in IndexedDB. The integrated Linux toolchain will let WebOS compile source projects locally.</p><label>Compiled binary<input id="xip-wasm-file" type="file" accept=".wasm,application/wasm"></label><label>Entry export<input id="xip-wasm-entry" value="_start"></label><label>Required module IDs<input id="xip-wasm-modules" value="webos,wasi_snapshot_preview1"></label><label>Source project<textarea id="xip-wasm-source" rows="8" spellcheck="false"></textarea></label><section class="xip-wat-tool"><div class="xip-editor-head"><strong>WebAssembly Text Format · WAT</strong><span>Readable WebAssembly source</span></div><label>Import .wat source<input id="xip-wat-file" type="file" accept=".wat,text/plain"></label><textarea id="xip-wat-source" rows="12" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="(module&#10;  (func (export &quot;main&quot;)&#10;    nop&#10;  )&#10;)"></textarea><div class="xip-actions"><button id="xip-wat-compile" type="button">Assemble WAT → WASM</button><button id="xip-wat-disassemble" type="button">Disassemble WASM → WAT</button></div><p id="xip-wat-status" role="status" aria-live="polite">WAT assembler loads WABT when first used. An internet connection is required for that first load.</p></section><details><summary>Custom import module</summary><label>Module ID<input id="xip-new-module-id" placeholder="com.example.math"></label><label>Name<input id="xip-new-module-name"></label><label>Factory source<textarea id="xip-new-module-source" rows="4" spellcheck="false" placeholder="return { double: (value) => value * 2 };"></textarea></label><button id="xip-save-module" type="button">Save custom module</button></details><div class="xip-actions" style="display:none"><label class="xip-import">Import .wapp<input id="xip-wasm-import" type="file" accept=".wapp,.json"></label><button id="xip-wasm-install" type="button">Install & test WASM app</button><button id="xip-wasm-export" type="button">Export .wapp</button></div></details>
      <div class="xip-actions"><label class="xip-import">Import .xip<input id="xip-import-file" type="file" accept=".xip,application/x-webos-xip,application/json"></label><button id="xip-export" type="button">Export .xip</button><button id="xip-install" type="button" class="primary">Install app</button></div>
      <p id="xip-status" role="status" aria-live="polite">Ready. Export creates a portable WebOS app package.</p>
    </section>`;
    const win = createWindow("App Creator Studio", html);
    if (!win) return null;
    const $ = id => win.querySelector("#" + id);
    // Reorganize the existing editor controls into explicit, always-visible workspaces.
    const studio = win.querySelector(".xip-studio");
    const header = studio.querySelector(".xip-header");
    const fields = studio.querySelector(".xip-fields");
    const runtimeChoice = studio.querySelector(".xip-runtime-choice");
    const jsPanel = $("xip-js-panel");
    const wasmPanel = $("xip-wasm-builder");
    const watPanel = studio.querySelector(".xip-wat-tool");
    const packageActions = $("xip-import-file").closest(".xip-actions");
    const projectStatus = $("xip-status");
    const tabStyle = document.createElement("style");
    tabStyle.textContent = ".xip-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--border-color,rgba(128,128,128,.25));position:sticky;top:0;background:var(--window-bg,rgba(30,30,30,.96));z-index:3}.xip-tab{border:1px solid var(--border-color,rgba(128,128,128,.3));background:transparent;color:inherit;border-radius:9px;padding:8px 13px;cursor:pointer;font-weight:600}.xip-tab[aria-selected=true]{background:var(--accent-color,#2878d0);color:white;border-color:transparent}.xip-tab-panel{display:none;min-height:0;overflow:auto;padding:12px 2px;flex:1}.xip-tab-panel.active{display:block}.xip-studio{display:flex;flex-direction:column;min-height:100%;height:100%;overflow:hidden}.xip-wasm-builder>summary{display:none}.xip-wasm-builder{display:block!important;border:0!important;padding:0!important;margin:0!important}.xip-wat-tool{display:block!important}.xip-tab-panel textarea{max-width:100%;box-sizing:border-box}";
    studio.prepend(tabStyle);
    const tabBar = document.createElement("nav");
    tabBar.className = "xip-tabs";
    tabBar.setAttribute("aria-label","App Creator workspaces");
    const workspace = document.createElement("div");
    workspace.style.cssText = "display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden";
    const panels = {};
    const addPanel = (id,label,icon) => {
      const button=document.createElement("button");
      button.type="button";button.className="xip-tab";button.dataset.tab=id;
      button.textContent=icon+" "+label;button.setAttribute("aria-controls","xip-tab-"+id);button.setAttribute("aria-selected","false");
      const panel=document.createElement("section");panel.className="xip-tab-panel";panel.id="xip-tab-"+id;panel.dataset.panel=id;panel.setAttribute("role","tabpanel");
      tabBar.appendChild(button);workspace.appendChild(panel);panels[id]=panel;
      button.addEventListener("click",()=>activateWorkspace(id));
      return panel;
    };
    const activateWorkspace = id => {
      Object.entries(panels).forEach(([key,panel])=>{
        const active=key===id;panel.classList.toggle("active",active);
        const button=tabBar.querySelector('[data-tab="'+key+'"]');
        button?.setAttribute("aria-selected",String(active));button?.setAttribute("tabindex",active?"0":"-1");
      });
    };
    const generalTab=addPanel("project","Project","⚙");
    const jsTab=addPanel("javascript","JavaScript","JS");
    const wasmTab=addPanel("wasm","WASM","◈");
    const watTab=addPanel("wat","WAT","⌘");
    const packageTab=addPanel("package","Package","▣");
    generalTab.append(fields,runtimeChoice);
    jsTab.append(jsPanel);
    const wasmIntro=wasmPanel.querySelector("p");
    if(wasmIntro)wasmTab.append(wasmIntro);
    const watActions=watPanel.querySelector(".xip-actions");
    watTab.append(watPanel);
    wasmTab.append(wasmPanel);
    packageTab.append(packageActions,projectStatus);
    studio.insertBefore(tabBar,header.nextSibling);
    studio.insertBefore(workspace,tabBar.nextSibling);
    wasmPanel.open=true;
    activateWorkspace("project");
    // Keep the existing runtime selector and validation logic; tabs remain directly accessible.

    const code = $("xip-code"), highlight = $("xip-highlight"), status = $("xip-status");
    const starter = `// Your handler receives the WebOS app API and launch argument.
const panel = document.createElement("section");
panel.className = "my-app";
panel.innerHTML = "<h2>Hello, WebOS!</h2><p>Your app is ready.</p>";
const appWindow = window.createWindow("My App", panel);
return appWindow;`;
    $("xip-wasm-source").value = "#include <stdint.h>\n#include <stddef.h>\n#define IMPORT(n) __attribute__((import_module(\"webos\"), import_name(n)))\nIMPORT(\"window_create\") int window_create(const char*,int);\nIMPORT(\"ui_clear\") int ui_clear(void);\nIMPORT(\"ui_text\") int ui_text(const char*,int);\nIMPORT(\"ui_button\") int ui_button(const char*,int,int);\nIMPORT(\"notify\") int notify(const char*,int,const char*,int);\n__attribute__((export_name(\"webos_event\"))) void webos_event(int id){if(id==1){const char m[]=\"Button clicked!\";ui_text(m,sizeof(m)-1);notify(\"WASM app\",8,m,sizeof(m)-1);}}\nint main(void){const char t[]=\"My WASM Window\",w[]=\"Hello from WebAssembly!\",b[]=\"Click me\";window_create(t,sizeof(t)-1);ui_clear();ui_text(w,sizeof(w)-1);ui_button(b,sizeof(b)-1,1);return 0;}\n/* Build with wasi-sdk clang -Wl,--export-memory -Wl,--export=webos_event -o app.wasm */";
    const escape = value => String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    function colorize(source) {
        const token = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|let|new|null|of|return|static|super|switch|this|throw|true|try|typeof|var|void|while|yield)\b|\b\d+(?:\.\d+)?\b)/g;
        let out="", last=0, match;
        while ((match=token.exec(source))) {
            out += escape(source.slice(last,match.index));
            const value=match[0], type=value.startsWith("//")||value.startsWith("/*")?"comment":/^[\"'`]/.test(value)?"string":/^\d/.test(value)?"number":/^(true|false|null)$/.test(value)?"literal":"keyword";
            out += '<span class="tok-'+type+'">'+escape(value)+'</span>'; last=token.lastIndex;
        }
        return out+escape(source.slice(last))+"\n";
    }
    code.value = starter;
    function paint(){highlight.innerHTML=colorize(code.value);highlight.scrollTop=code.scrollTop;highlight.scrollLeft=code.scrollLeft;}
    code.addEventListener("input",paint);
    code.addEventListener("scroll",paint);
    $("xip-template").addEventListener("click",()=>{code.value=starter;paint();});
    paint();
    const manifest = () => ({
      id:$("xip-id").value.trim().toLowerCase(),
      name:$("xip-name").value.trim(),
      icon:$("xip-icon").value.trim()||"📦",
      description:$("xip-description").value.trim(),
      dock:$("xip-dock").checked
    });
    const validate = m => {
      if(!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(m.id)) throw new Error("App ID must be 2–64 characters: letters, numbers, dots, underscores or hyphens.");
      if(!m.name) throw new Error("Enter an app display name.");
      if(!code.value.trim()) throw new Error("The JavaScript handler is empty.");
      new Function("api","argument",code.value);
      return m;
    };
    const download = (name, contents, type) => {
      const url=URL.createObjectURL(new Blob([contents],{type}));
      const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1500);
    };
    $("xip-export").addEventListener("click",async()=>{try{const m=validateProject();const file=wasmFile.files?.[0];const pkg=await window.WebOSWASM.exportProject(m.id).catch(()=>null);const modules=wasmModules();const custom=[];for(const id of modules){const item=await window.WebOSWASM.getModule(id);if(item?.source)custom.push(item);}const bundle={format:"webos-xip",version:2,manifest:{...m,entry:$("xip-wasm-entry").value.trim(),modules},entry:{type:m.runtimeType,handler:"main.js",binary:"main.wasm"},files:{"main.js":code.value,"main.wasm":file?Array.from(new Uint8Array(await file.arrayBuffer())):pkg?.files?.["main.wasm"]||($("xip-wasm-file").dataset.importedBinary?JSON.parse($("xip-wasm-file").dataset.importedBinary):null),"main.c":wasmSource.value,"main.wat":watSource.value,"styles.css":$("xip-css").value},modules:custom,metadata:{createdAt:new Date().toISOString(),minimumWebOSVersion:"1.0"}};download(m.id+".xip",JSON.stringify(bundle,null,2),"application/x-webos-xip+json");status.textContent="Exported "+m.id+".xip";}catch(error){status.textContent=error.message;}});
    $("xip-import-file").addEventListener("change",async event=>{const file=event.target.files?.[0];if(!file)return;try{const bundle=JSON.parse(await file.text());if(bundle.format!=="webos-xip"||![1,2].includes(bundle.version)||!bundle.manifest)throw Error("Unsupported XIP package.");const m=bundle.manifest;$("xip-id").value=m.id||"";$("xip-name").value=m.name||"";$("xip-icon").value=m.icon||"📦";$("xip-description").value=m.description||"";$("xip-dock").checked=m.dock!==false;$("xip-runtime-type").value=m.runtimeType||(bundle.version===1?"js":"wasm");code.value=bundle.files?.["main.js"]||"";wasmSource.value=bundle.files?.["main.c"]||"";watSource.value=bundle.files?.["main.wat"]||"";$("xip-css").value=bundle.files?.["styles.css"]||"";$("xip-wasm-entry").value=m.entry||"_start";$("xip-wasm-modules").value=(m.modules||[]).join(",");paint();if(Array.isArray(bundle.modules))for(const mod of bundle.modules)await window.WebOSWASM.saveModule(mod);if(Array.isArray(bundle.files?.["main.wasm"])){$("xip-wasm-file").dataset.importedBinary=JSON.stringify(bundle.files["main.wasm"]);}applyRuntimePanels();status.textContent="Loaded "+file.name+". Review the project before installing.";}catch(error){status.textContent="Import failed: "+error.message;}event.target.value="";});
    $("xip-install").addEventListener("click",async()=>{try{const m=validateProject(),file=wasmFile.files?.[0];let bytes=file?await file.arrayBuffer():null;if(!bytes&&$("xip-wasm-file").dataset.importedBinary){bytes=new Uint8Array(JSON.parse($("xip-wasm-file").dataset.importedBinary));}const record=await window.WebOSWASM.installProject({...m,modules:wasmModules(),entry:$("xip-wasm-entry").value.trim()},{jsSource:code.value,css:$("xip-css").value,wasmBytes:bytes,files:{"main.c":wasmSource.value,"main.wat":watSource.value,"styles.css":$("xip-css").value}});status.textContent="Installed "+record.name+" ("+record.runtimeType+"). It is saved in IndexedDB.";window.WebOSNotifications?.notify?.("App installed",record.name+" is ready in your launcher.",{icon:record.icon});window.WebOSAppRegistry?.launch?.(record.id);}catch(error){status.textContent="Install failed: "+error.message;}});
    const wasmFile=$("xip-wasm-file"),wasmSource=$("xip-wasm-source"),watSource=$("xip-wat-source"),watStatus=$("xip-wat-status");
    let wabtPromise=null;
    const loadWabt=()=>{if(window.WabtModule)return Promise.resolve(window.WabtModule);if(wabtPromise)return wabtPromise;wabtPromise=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/wabt@1.0.37/index.js";script.crossOrigin="anonymous";script.onload=()=>window.WabtModule?resolve(window.WabtModule):reject(Error("WABT loaded but its browser API was not found."));script.onerror=()=>reject(Error("Could not load WABT. Check your internet connection and try again."));document.head.appendChild(script);});return wabtPromise;};
    const watBytes=()=>{const raw=wasmFile.dataset.importedBinary;if(!raw)return null;return new Uint8Array(JSON.parse(raw));};
    $("xip-wat-file").addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{watSource.value=await f.text();watStatus.textContent="Loaded "+f.name+". Assemble it to create the runnable WASM binary.";}catch(error){watStatus.textContent="Could not read WAT file: "+error.message;}e.target.value="";});
    $("xip-wat-compile").addEventListener("click",async()=>{let module=null;try{if(!watSource.value.trim())throw Error("Paste or import WAT source first.");watStatus.textContent="Loading WABT and validating WAT…";const factory=await loadWabt(),wabt=await factory();module=wabt.parseWat("app.wat",watSource.value);module.resolveNames();module.validate();const result=module.toBinary({log:false,write_debug_names:true});const bytes=new Uint8Array(result.buffer);await WebAssembly.compile(bytes);wasmFile.value="";wasmFile.dataset.importedBinary=JSON.stringify(Array.from(bytes));wasmFile.dataset.compiledFromWat="true";watStatus.textContent="Assembled and validated "+bytes.length.toLocaleString()+" bytes. The binary is ready to install or export.";}catch(error){watStatus.textContent="WAT assembly failed: "+(error.message||String(error));}finally{try{module?.destroy();}catch(_){}}});
    $("xip-wat-disassemble").addEventListener("click",async()=>{let module=null;try{const file=wasmFile.files?.[0],bytes=file?new Uint8Array(await file.arrayBuffer()):watBytes();if(!bytes)throw Error("Choose a .wasm file or assemble WAT first.");watStatus.textContent="Disassembling WebAssembly…";const factory=await loadWabt(),wabt=await factory();module=wabt.readWasm(bytes,{readDebugNames:true});module.generateNames();module.applyNames();watSource.value=module.toText({foldExprs:false,inlineExport:false});watStatus.textContent="Disassembled "+bytes.length.toLocaleString()+" bytes into editable WAT. Original source names and comments may not be recoverable.";}catch(error){watStatus.textContent="Disassembly failed: "+(error.message||String(error));}finally{try{module?.destroy();}catch(_){}}});
    const applyRuntimePanels=()=>{const type=$("xip-runtime-type").value;$("xip-js-panel").style.display=type==="wasm"?"none":"block";$("xip-wasm-builder").style.display=type==="js"?"none":"block";};
    $("xip-runtime-type").addEventListener("change",applyRuntimePanels);applyRuntimePanels();
    const validateProject=()=>{const m={...manifest(),runtimeType:$("xip-runtime-type").value};if(!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(m.id))throw Error("App ID must be 2–64 safe characters.");if(!m.name)throw Error("Enter an app display name.");if((m.runtimeType==="js"||m.runtimeType==="both")&&!code.value.trim())throw Error("JavaScript handler is required.");if((m.runtimeType==="wasm"||m.runtimeType==="both")&&!wasmFile.files?.[0]&&!wasmFile.dataset.importedBinary)throw Error("Choose a compiled .wasm binary.");if(m.runtimeType!=="wasm"&&code.value.trim())new Function("api","argument",code.value);return m;};
    const wasmManifest=()=>({id:$("xip-id").value.trim().toLowerCase(),name:$("xip-name").value.trim(),icon:$("xip-icon").value.trim()||"🧩",description:$("xip-description").value.trim(),dock:$("xip-dock").checked,entry:$("xip-wasm-entry").value.trim()});
    const wasmModules=()=>[...new Set($("xip-wasm-modules").value.split(",").map(x=>x.trim()).filter(Boolean))];
    $("xip-save-module").onclick=async()=>{try{const source=$("xip-new-module-source").value;new Function("host",source);const m=await window.WebOSWASM.saveModule({id:$("xip-new-module-id").value,name:$("xip-new-module-name").value,source});const ids=wasmModules();if(!ids.includes(m.id))$("xip-wasm-modules").value=[...ids,m.id].join(",");status.textContent="Saved custom module "+m.id;}catch(e){status.textContent="Module error: "+e.message;}};
    $("xip-wasm-install").onclick=async()=>{try{if(!window.WebOSWASM)throw Error("WASM runtime unavailable.");const f=wasmFile.files?.[0];if(!f)throw Error("Choose a compiled .wasm binary.");const m=wasmManifest();await window.WebOSWASM.installApp({...m,modules:wasmModules()},await f.arrayBuffer(),{"main.c":wasmSource.value,"styles.css":$("xip-css").value});status.textContent="Installed "+m.name+"; opening test window.";window.WebOSWASM.launch(m.id);}catch(e){status.textContent="WASM install failed: "+e.message;}};
    $("xip-wasm-export").onclick=async()=>{try{const m=wasmManifest(),p=await window.WebOSWASM.exportPackage(m.id);p.files={...(p.files||{}),"main.c":wasmSource.value,"styles.css":$("xip-css").value};const u=URL.createObjectURL(new Blob([JSON.stringify(p)],{type:"application/json"})),a=document.createElement("a");a.href=u;a.download=m.id+".wapp";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);status.textContent="Exported "+m.id+".wapp";}catch(e){status.textContent="Export failed: "+e.message;}};
    $("xip-wasm-import").onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const p=JSON.parse(await f.text()),r=await window.WebOSWASM.importPackage(p);$("xip-id").value=r.id;$("xip-name").value=r.name;$("xip-icon").value=r.icon;$("xip-description").value=r.description;$("xip-dock").checked=r.dock;$("xip-wasm-entry").value=r.entry||"_start";$("xip-wasm-modules").value=(r.modules||[]).join(",");wasmSource.value=r.files?.["main.c"]||"";watSource.value=r.files?.["main.wat"]||"";status.textContent="Imported "+r.name+" to IndexedDB.";window.WebOSWASM.launch(r.id);}catch(x){status.textContent="Import failed: "+x.message;}e.target.value="";};
    return win;
}


function openPaint(){if(typeof closeLauncher==="function")closeLauncher();const html=`<section class="webos-paint"><header class="paint-toolbar"><label>Color <input id="paint-color" type="color" value="#202938"></label><label>Size <input id="paint-size" type="range" min="1" max="48" value="5"><output id="paint-size-label">5 px</output></label><label>Tool <select id="paint-tool"><option value="brush">Brush</option><option value="eraser">Eraser</option><option value="line">Line</option><option value="rect">Rectangle</option><option value="circle">Ellipse</option></select></label><button id="paint-undo" type="button">Undo</button><button id="paint-redo" type="button">Redo</button><button id="paint-clear" type="button">Clear</button><button id="paint-save" type="button">Export PNG</button><button id="paint-store" type="button">Save to Files</button></header><div class="paint-canvas-wrap"><canvas id="paint-canvas" width="1200" height="760"></canvas></div><footer id="paint-status">Ready · Draw with pointer or touch.</footer></section>`;const win=createWindow("Paint",html);if(!win)return null;const $=id=>win.querySelector("#"+id),c=$("paint-canvas"),x=c.getContext("2d"),undo=[],redo=[];x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);let down=false,start=null,last=null,base=null;const pos=e=>{const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height};},snapshot=()=>{undo.push(c.toDataURL());if(undo.length>25)undo.shift();redo.length=0;},restore=url=>{const im=new Image();im.onload=()=>{x.clearRect(0,0,c.width,c.height);x.drawImage(im,0,0);};im.src=url;},shape=(a,b,t)=>{x.beginPath();if(t==="line"){x.moveTo(a.x,a.y);x.lineTo(b.x,b.y);}else if(t==="rect")x.rect(a.x,a.y,b.x-a.x,b.y-a.y);else x.ellipse((a.x+b.x)/2,(a.y+b.y)/2,Math.abs(b.x-a.x)/2,Math.abs(b.y-a.y)/2,0,0,Math.PI*2);x.stroke();},style=()=>{x.strokeStyle=$("paint-tool").value==="eraser"?"#fff":$("paint-color").value;x.lineWidth=Number($("paint-size").value)*($("paint-tool").value==="eraser"?3:1);x.lineCap="round";x.lineJoin="round";};
c.onpointerdown=e=>{down=true;c.setPointerCapture(e.pointerId);start=last=pos(e);snapshot();base=c.toDataURL();};c.onpointermove=e=>{if(!down)return;const p=pos(e),t=$("paint-tool").value;style();if(t==="brush"||t==="eraser"){x.beginPath();x.moveTo(last.x,last.y);x.lineTo(p.x,p.y);x.stroke();last=p;}else{const im=new Image();im.onload=()=>{if(!down)return;x.clearRect(0,0,c.width,c.height);x.drawImage(im,0,0);style();shape(start,p,t);};im.src=base;}};const finish=()=>{down=false;start=last=base=null;};c.onpointerup=finish;c.onpointercancel=finish;$("paint-size").oninput=e=>$("paint-size-label").textContent=e.target.value+" px";$("paint-undo").onclick=()=>{if(undo.length){redo.push(c.toDataURL());restore(undo.pop());}};$("paint-redo").onclick=()=>{if(redo.length){undo.push(c.toDataURL());restore(redo.pop());}};$("paint-clear").onclick=()=>{if(confirm("Clear the canvas?")){snapshot();x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);}};$("paint-save").onclick=()=>c.toBlob(blob=>{if(!blob)return;const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download="webos-paint.png";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);$("paint-status").textContent="PNG exported.";});$("paint-store").onclick=()=>c.toBlob(async blob=>{if(!blob)return;try{await WebOSFileSystem.putBinary("/Pictures/Paint-"+Date.now()+".png",blob,"image/png");$("paint-status").textContent="Saved to Files → Pictures.";}catch(e){$("paint-status").textContent="Save failed: "+e.message;}});return win;}


function openAppManager() {
    if (typeof closeLauncher === "function") closeLauncher();
    const root=document.createElement("section");
    root.className="webos-app-manager";
    root.innerHTML='<header class="wam-header"><div><h2>App Manager</h2><p>Review apps installed in this WebOS workspace.</p></div><div class="wam-header-actions"><button type="button" id="wam-export">Export app list</button><button type="button" id="wam-refresh">Refresh</button></div></header><div class="wam-summary" id="wam-summary">Loading installed apps…</div><div class="wam-list" id="wam-list"></div><p class="wam-status" id="wam-status" role="status" aria-live="polite"></p>';
    const win=createWindow("App Manager",root);
    if(!win)return null;
    const list=win.querySelector("#wam-list"),summary=win.querySelector("#wam-summary"),status=win.querySelector("#wam-status");
    const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
    async function renderApps(){
        list.replaceChildren();
        const apps=window.WebOSAppRegistry?.all?.()||[];
        let wasmApps=[];
        try{wasmApps=await window.WebOSWASM?.listApps?.()||[];}catch(_){}
        const wasmIds=new Set(wasmApps.map(app=>app.id));
        summary.textContent=apps.length+" registered apps · "+wasmIds.size+" stored WASM packages";
        apps.sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id)));
        for(const app of apps){
            const row=make("article","wam-row"),icon=make("span","wam-icon",app.icon||"▣"),body=make("div","wam-info"),name=make("strong","",app.name||app.id),meta=make("small","",app.id+" · "+(app.builtin?"Built-in":wasmIds.has(app.id)?"WASM package":"Custom app"));
            const description=make("p","",app.description||"No description provided.");
            body.append(name,meta,description);row.append(icon,body);
            if(app.builtin||window.WebOSAppRegistry?.isBuiltin?.(app.id)){
                row.append(make("span","wam-protected","System app"));
            }else{
                const remove=make("button","wam-uninstall","Uninstall");
                remove.type="button";
                remove.addEventListener("click",async()=>{
                    if(!confirm("Uninstall "+(app.name||app.id)+"? Its app package or generated app file will be removed. User-created documents are kept."))return;
                    remove.disabled=true;status.textContent="Uninstalling "+(app.name||app.id)+"…";
                    try{
                        if(wasmIds.has(app.id)) await window.WebOSWASM.uninstallApp(app.id);
                        else {
                            if(window.WebOSFileSystem?.remove) await window.WebOSFileSystem.remove("/Desktop/Apps/"+app.id+".js").catch(()=>{});
                            window.WebOSAppRegistry.unregister(app.id);
                        }
                        status.textContent=(app.name||app.id)+" was uninstalled.";
                        window.WebOSNotifications?.notify?.("App uninstalled",(app.name||app.id)+" was removed from WebOS.",{icon:"🗑️",level:"success",source:"App Manager"});
                        await renderApps();
                    }catch(error){remove.disabled=false;status.textContent="Uninstall failed: "+error.message;}
                });
                row.append(remove);
            }
            list.append(row);
        }
        if(!apps.length)list.append(make("p","wam-empty","No registered apps were found."));
    }
    win.querySelector("#wam-refresh").addEventListener("click",()=>renderApps().catch(error=>status.textContent=error.message));
    win.querySelector("#wam-export").addEventListener("click",()=>{try{window.WebOSAppRegistry.downloadManifest();status.textContent="App registry metadata exported. App source packages are exported separately from App Creator or WASM Lab.";}catch(error){status.textContent="Export failed: "+error.message;}});
    renderApps().catch(error=>{summary.textContent="Could not load apps.";status.textContent=error.message;});
    return win;
}
