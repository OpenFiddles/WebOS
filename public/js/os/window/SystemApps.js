
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
        '<button type="button" class="files-location" data-location="/Downloads"><span>⇩</span> Downloads</button>',
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
        '<button type="button" class="files-action-btn variant-secondary" id="upload-file">⇧ Import</button><button type="button" class="files-action-btn variant-secondary" id="files-view" aria-pressed="false" title="Toggle grid view">▦</button>',
        '<input id="file-picker" type="file" accept=".txt,.md,.json,.js,.mjs,.ts,.html,.htm,.css,.xml,.svg,.csv,.yml,.yaml,.toml,.ini,.log,.py,.sh,.sql" multiple hidden></div>',
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
            const entries=await window.WebOSFileSystem.list(path);
            if(current!==token || !win.isConnected) return;
            const q=search.value.trim().toLowerCase();
            const rows=entries.filter(e=>name(e).toLowerCase().includes(q));
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
                item.dataset.path=entry.path;
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
                const dl=document.createElement("button");dl.type="button";dl.textContent="↓";dl.title="Download file";dl.disabled=entry.type==="directory";
                dl.addEventListener("click",()=>downloadEntry(entry));
                const del=document.createElement("button");del.type="button";del.className="danger";del.textContent="×";del.title="Delete item";
                del.addEventListener("click",async()=>{
                    if(!window.confirm('Permanently delete "'+n+'" from WebOS storage?'))return;
                    try{await window.WebOSFileSystem.remove(entry.path);selected.delete(entry.path);status.textContent="Deleted "+n;render();}
                    catch(err){window.alert("Delete failed: "+err.message);}
                });
                tools.append(rename,duplicate,dl,del);item.append(check,open,tools);list.appendChild(item);
            });
            status.textContent=path+" · IndexedDB";
            updateSelection();
        } catch(err){status.textContent="Could not read folder: "+err.message;console.error("WebOS Files:",err);}
    }
    function downloadText(filename,content,type) {
        const blob=new Blob([content],{type:type||"application/octet-stream"}),url=URL.createObjectURL(blob);
        const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    async function downloadEntry(entry){const file=await window.WebOSFileSystem.read(entry.path);if(file)downloadText(name(entry),file.content||"");}
    async function openFile(entry) {
        const file=await window.WebOSFileSystem.read(entry.path);if(!file)return;
        const ext=extension(entry),previewable=["html","htm"].includes(ext);
        const panel=document.createElement("div");panel.className="file-editor-container files-code-workspace";
        const info=document.createElement("div");info.className="file-editor-info";info.textContent=entry.path+" · "+prettySize(size(file));
        const editor=document.createElement("textarea");editor.className="raw-code-textarea";editor.spellcheck=false;editor.value=file.content||"";editor.setAttribute("aria-label","File contents");
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
        save.addEventListener("click",async()=>{try{await window.WebOSFileSystem.putText(entry.path,editor.value);state.textContent="Saved · "+new Date().toLocaleTimeString();render();}catch(err){state.textContent="Save failed: "+err.message;}});
        dl.addEventListener("click",()=>downloadText(name(entry),editor.value));
        footer.append(save,dl,state);panel.append(info,editor,footer);createWindow(name(entry),panel);
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
                <h2>Better Settings</h2>
                
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
                <div class="setting-field liquid-glass-setting"><label><input id="liquid-glass-choice" type="checkbox"> Experimental Liquid Glass</label><small>Layered backdrop blur, spectral highlights and supported SVG displacement effects. Rendering varies by browser and GPU.</small></div>
                <button type="button" id="reset-appearance">Restore appearance defaults</button>
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

            <!-- SYSTEM DATA MANAGEMENT SECTION -->
            <section class="settings-section" style="display: flex; flex-direction: column; gap: 0.75rem;">
                <button type="button" id="clear-storage">Reset WebOS data</button>
                <p id="settings-status" style="font-size: 0.9rem; margin: 0; opacity: 0.8;">Changes are saved on this device.</p>
            </section>
        </div>
    `;

    // 2. Initialize application UI layout window context
    const win = createWindow("Better Settings", htmlTemplate);
    if (!win) return null;

    // Turn the existing settings sections into a compact, keyboard-friendly tabbed control center.
    const settingsPanel = win.querySelector(".AppPanel");
    const settingsSections = Array.from(settingsPanel.querySelectorAll(":scope > .settings-section"));
    settingsPanel.querySelectorAll(":scope > hr").forEach(rule => rule.remove());
    if (settingsSections.length) {
        const tabBar = document.createElement("nav");
        tabBar.className = "settings-tabs";
        tabBar.setAttribute("role", "tablist");
        tabBar.setAttribute("aria-label", "Settings categories");
        const pane = document.createElement("div");
        pane.className = "settings-tab-content";
        const labels = ["Appearance", "Customization", "System"];
        settingsSections.forEach((section, index) => {
            const id = "webos-settings-tab-" + index;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "settings-tab" + (index === 0 ? " active" : "");
            button.textContent = labels[index] || ("Settings " + (index + 1));
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
    }
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
    styleElement.textContent = storedCustomCss;
    fullCssEditor.value = storedCustomCss;

    // 3. Extract active DOM element bindings from compiled frame template
    const choice = win.querySelector("#theme-choice");
    const motion = win.querySelector("#motion-choice");
    const accentChoice = win.querySelector("#accent-choice");
    const wallpaperChoice = win.querySelector("#wallpaper-choice");
    const wallpaperFile = win.querySelector("#wallpaper-file");
    const animationChoice = win.querySelector("#animation-choice");
    const liquidGlassChoice = win.querySelector("#liquid-glass-choice");
    const status = win.querySelector("#settings-status");
    
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
    const selectedTheme = localStorage.getItem("webos-theme") || "ocean";
    choice.value = selectedTheme;
    motion.checked = localStorage.getItem("webos-reduced-motion") === "true";
    accentChoice.value = localStorage.getItem("webos-accent") || "#53b5ff";
    animationChoice.value = localStorage.getItem("webos-motion-style") || "smooth";
    liquidGlassChoice.checked = localStorage.getItem("webos-liquid-glass") === "true";
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

    // 5. System Configuration Event Handlers
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
        localStorage.removeItem("webos-accent");
        localStorage.removeItem("webos-wallpaper");
        localStorage.removeItem("webos-custom-wallpaper");
        localStorage.removeItem("webos-motion-style");
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
        styleElement.textContent = value;
        fullCssEditor.value = value;
        status.textContent = "CSS validated, saved locally, and injected.";
        return probe;
    }

    btnApplyCss.onclick = () => {
        try { validateAndApplyCss(fullCssEditor.value); }
        catch (error) { status.textContent = "CSS not applied: " + error.message; }
    };

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
            styleElement.textContent = "";
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
        <div class="AppPanel CreatorStudio" style="padding: 15px; font-family: sans-serif; display: flex; flex-direction: column; gap: 12px; height: 100%; box-sizing: border-box;">
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
    if (typeof closeLauncher === "function") closeLauncher();

    const htmlTemplate = `
    <div class="AppPanel BrowserApp" style="display:flex;flex-direction:column;width:100%;height:100%;font-family:system-ui,sans-serif;background:#1e1e1e;color:#fff;user-select:none;">
        <div class="BrowserTabBar" style="display:flex;background:#141414;padding:6px 6px 0;gap:4px;align-items:flex-end;overflow-x:auto;border-bottom:1px solid #2d2d2d;">
            <div class="TabContainer" style="display:flex;gap:4px;align-items:flex-end;flex:1;"></div>
            <button type="button" class="NewTabBtn" title="New tab" style="background:#2d2d2d;color:#fff;border:0;padding:6px 10px;cursor:pointer;border-radius:4px;margin-bottom:4px;">+</button>
        </div>
        <form class="BrowserBar" style="display:flex;gap:6px;padding:8px;background:#1e1e1e;align-items:center;">
            <button type="button" class="BrowserBack" title="Back">◀</button>
            <button type="button" class="BrowserForward" title="Forward">▶</button>
            <button type="button" class="BrowserReload" title="Reload">↻</button>
            <input type="text" class="BrowserAddressInput" placeholder="Search or enter a web address…" required style="flex:1;min-width:0;padding:8px;border:1px solid #3a3a3a;border-radius:6px;background:#2a2a2a;color:#fff;">
            <button type="button" class="BrowserOpenExternal" title="Open in your normal browser">↗</button>
        </form>
        <div class="BrowserFramesContainer" style="position:relative;display:flex;flex:1;min-height:0;background:#fff;">
            <div class="BrowserHint" role="status" style="display:none;position:absolute;top:0;left:0;right:0;background:#9d3030;color:#fff;padding:10px;text-align:center;z-index:5;">Compatibility mode: basic HTML, CSS, images, forms, and common fetch/XHR requests are proxied. Sites requiring sign-in cookies, DRM, WebSockets, or unsupported browser APIs may not work. Use ↗ for full browser compatibility.</div>
        </div>
    </div>`;
    
    const win = createWindow("Browser", htmlTemplate);
    if (!win) return null;
    win.style.width = Math.min(window.innerWidth - 40, 1000) + "px";
    win.style.height = Math.min(window.innerHeight - 110, 700) + "px";
    win.style.top = "68px";

    const tabContainer = win.querySelector(".TabContainer");
    const newTabBtn = win.querySelector(".NewTabBtn");
    const addressBar = win.querySelector(".BrowserAddressInput");
    const framesContainer = win.querySelector(".BrowserFramesContainer");
    const hint = win.querySelector(".BrowserHint");
    const searchForm = win.querySelector(".BrowserBar");
    const backButton = win.querySelector(".BrowserBack");
    const forwardButton = win.querySelector(".BrowserForward");
    const reloadButton = win.querySelector(".BrowserReload");
    const externalButton = win.querySelector(".BrowserOpenExternal");

    const tabs = [];
    let activeTab = null;
    let nextTabId = 1;

    function normalizeUrl(input) {
        let value = String(input || "").trim();
        if (!value) throw new Error("Enter a web address.");
        if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
            value = value.includes(".") && !/\s/.test(value)
                ? "https://" + value
                : "https://www.google.com/search?q=" + encodeURIComponent(value);
        }
        const parsed = new URL(value);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only HTTP and HTTPS pages are supported.");
        return parsed.href;
    }

    function updateControls(tab) {
        const hasPage = !!(tab && tab.history.length);
        backButton.disabled = !hasPage || tab.pointer <= 0;
        forwardButton.disabled = !hasPage || tab.pointer >= tab.history.length - 1;
        reloadButton.disabled = !hasPage;
        externalButton.disabled = !hasPage;
        if (hasPage) addressBar.value = tab.history[tab.pointer];
    }

    function activateTab(tab) {
        activeTab = tab;
        tabs.forEach(item => {
            item.frame.style.display = item === tab ? "block" : "none";
            item.button.classList.toggle("active", item === tab);
            item.button.setAttribute("aria-selected", item === tab ? "true" : "false");
        });
        hint.style.display = "none";
        updateControls(tab);
    }

    function navigate(input, addToHistory = true) {
        if (!activeTab) return;
        let url;
        try { url = normalizeUrl(input); }
        catch (error) {
            addressBar.value = "";
            addressBar.placeholder = error.message;
            return;
        }
        const tab = activeTab;
        if (addToHistory) {
            tab.history = tab.history.slice(0, tab.pointer + 1);
            tab.history.push(url);
            tab.pointer = tab.history.length - 1;
        }
        addressBar.value = url;
        hint.style.display = "none";
        clearTimeout(tab.timer);
        const parsed = new URL(url);
        tab.frame.src = parsed.origin === window.location.origin
            ? url
            : "/api/browser-proxy?url=" + encodeURIComponent(url);
        tab.timer = window.setTimeout(() => {
            if (activeTab === tab) hint.style.display = "block";
        }, 12000);
        updateControls(tab);
    }

    function createTab(url = "https://example.com") {
        const id = nextTabId++;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "BrowserTab";
        button.textContent = "New Tab";
        button.style.cssText = "background:#292929;color:#fff;border:0;border-radius:5px 5px 0 0;padding:7px 12px;cursor:pointer;";
        const frame = document.createElement("iframe");
        frame.title = "Browser tab " + id;
        frame.style.cssText = "display:none;width:100%;height:100%;border:0;background:#fff;";
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        // Remote pages run in an opaque-origin sandbox so they cannot reach the WebOS parent window.
        frame.setAttribute("sandbox", "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads");
        const tab = { id, button, frame, history: [], pointer: -1, timer: null };
        frame.addEventListener("load", () => clearTimeout(tab.timer));
        button.addEventListener("click", () => activateTab(tab));
        tabs.push(tab);
        tabContainer.appendChild(button);
        framesContainer.appendChild(frame);
        activateTab(tab);
        navigate(url);
        return tab;
    }

    backButton.addEventListener("click", () => {
        if (activeTab && activeTab.pointer > 0) {
            activeTab.pointer--;
            navigate(activeTab.history[activeTab.pointer], false);
        }
    });
    forwardButton.addEventListener("click", () => {
        if (activeTab && activeTab.pointer < activeTab.history.length - 1) {
            activeTab.pointer++;
            navigate(activeTab.history[activeTab.pointer], false);
        }
    });
    reloadButton.addEventListener("click", () => {
        if (activeTab && activeTab.pointer >= 0) {
            const current = activeTab.history[activeTab.pointer];
            navigate(current, false);
        }
    });
    externalButton.addEventListener("click", () => {
        if (activeTab && activeTab.pointer >= 0) window.open(activeTab.history[activeTab.pointer], "_blank", "noopener,noreferrer");
    });
    newTabBtn.addEventListener("click", () => createTab());
    searchForm.addEventListener("submit", event => {
        event.preventDefault();
        navigate(addressBar.value);
    });
    win.addEventListener("webos:window-close", () => tabs.forEach(tab => clearTimeout(tab.timer)));

    createTab(initialUrl || "https://example.com");
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
      <header class="xip-header"><div><h2>App Creator Studio</h2><p>Build, preview, install and package WebOS applications.</p></div><span class="xip-version">XIP · v1</span></header>
      <div class="xip-fields">
        <label>App ID<input id="xip-id" placeholder="com.example.myapp" autocomplete="off"></label>
        <label>Display name<input id="xip-name" placeholder="My WebOS App"></label>
        <label>Icon<input id="xip-icon" value="🧩" maxlength="8"></label>
        <label class="xip-dock-check"><input id="xip-dock" type="checkbox" checked> Pin to dock</label>
        <label class="xip-description">Description<textarea id="xip-description" rows="2" placeholder="What does your app do?"></textarea></label>
      </div>
      <div class="xip-editor-head"><strong>JavaScript handler</strong><span>async function(api, argument)</span><button id="xip-template" type="button">Reset template</button></div>
      <div class="xip-code-wrap"><pre id="xip-highlight" aria-hidden="true"></pre><textarea id="xip-code" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="JavaScript source"></textarea></div>
      <details class="xip-style"><summary>Optional app stylesheet</summary><textarea id="xip-css" spellcheck="false" placeholder=".my-app { padding: 1rem; }"></textarea></details>
      <div class="xip-actions"><label class="xip-import">Import .xip<input id="xip-import-file" type="file" accept=".xip,application/x-webos-xip,application/json"></label><button id="xip-export" type="button">Export .xip</button><button id="xip-install" type="button" class="primary">Install app</button></div>
      <p id="xip-status" role="status" aria-live="polite">Ready. Export creates a portable WebOS app package.</p>
    </section>`;
    const win = createWindow("App Creator Studio", html);
    if (!win) return null;
    const $ = id => win.querySelector("#" + id);
    const code = $("xip-code"), highlight = $("xip-highlight"), status = $("xip-status");
    const starter = `// Your handler receives the WebOS app API and launch argument.
const panel = document.createElement("section");
panel.className = "my-app";
panel.innerHTML = "<h2>Hello, WebOS!</h2><p>Your app is ready.</p>";
const appWindow = window.createWindow("My App", panel);
return appWindow;`;
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
    $("xip-export").addEventListener("click",()=>{
      try {
        const m=validate(manifest());
        const bundle={format:"webos-xip",version:1,manifest:m,entry:{type:"javascript",handler:"main.js"},files:{"main.js":code.value,"styles.css":$("xip-css").value},metadata:{createdAt:new Date().toISOString(),minimumWebOSVersion:"1.0"}};
        download(m.id+".xip",JSON.stringify(bundle,null,2),"application/x-webos-xip+json");
        status.textContent="Exported "+m.id+".xip";
      } catch(error){status.textContent=error.message;}
    });
    $("xip-import-file").addEventListener("change",async event=>{
      const file=event.target.files?.[0];if(!file)return;
      try{
        const bundle=JSON.parse(await file.text());
        if(bundle.format!=="webos-xip"||bundle.version!==1||!bundle.manifest||typeof bundle.files?.["main.js"]!=="string")throw new Error("This is not a supported WebOS XIP v1 package.");
        $("xip-id").value=bundle.manifest.id||"";$("xip-name").value=bundle.manifest.name||"";
        $("xip-icon").value=bundle.manifest.icon||"📦";$("xip-description").value=bundle.manifest.description||"";
        $("xip-dock").checked=bundle.manifest.dock!==false;code.value=bundle.files["main.js"];
        $("xip-css").value=bundle.files["styles.css"]||"";paint();status.textContent="Loaded "+file.name+". Review it before installing.";
      }catch(error){status.textContent="Import failed: "+error.message;}
      event.target.value="";
    });
    $("xip-install").addEventListener("click",async()=>{
      try{
        const m=validate(manifest()), handlerName="WebOS_AppHandler_"+m.id.replace(/[^a-z0-9]/g,"_");
        const fn=new Function("api","argument",code.value);
        window[handlerName]=fn;
        const cssText=$("xip-css").value;
        if(cssText){
          const styleId="webos-app-style-"+m.id;
          let style=document.getElementById(styleId);if(!style){style=document.createElement("style");style.id=styleId;document.head.appendChild(style);}
          style.textContent=cssText;
        }
        await window.WebOSFileSystem?.putText?.("/Desktop/Apps/"+m.id+".js",code.value);
        await window.WebOSFileSystem?.putText?.("/Desktop/Apps/"+m.id+".css",cssText);
        window.WebOSAppRegistry.register({...m,handler:handlerName});
        window.WebOSAppRegistry.render();
        status.textContent="Installed "+m.name+". Export its .xip package to share it.";
        window.WebOSNotifications?.notify("App installed",m.name+" is ready in your launcher.",{icon:m.icon});
      }catch(error){status.textContent="Install failed: "+error.message;}
    });
    return win;
}
