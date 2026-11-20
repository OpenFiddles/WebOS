/* Host OS file-open, drag/drop and folder import bridge for WebOS. */
(() => {
  "use strict";
  const fsReady = () => window.WebOSFileSystem && typeof window.WebOSFileSystem.putBinary === "function";
  const safeName = name => String(name || "Imported file").replace(/[\\/\\0-\\x1f]/g, "_").replace(/^\\.+$/, "file").slice(0, 180) || "Imported file";
  const status = message => {
    let node = document.getElementById("webos-host-import-status");
    if (!node) { node = document.createElement("div"); node.id = "webos-host-import-status"; node.setAttribute("role","status"); Object.assign(node.style,{position:"fixed",right:"18px",bottom:"92px",zIndex:"99999",padding:"10px 14px",borderRadius:"12px",background:"rgba(12,20,32,.92)",color:"#fff",font:"13px system-ui",boxShadow:"0 8px 28px #0006",maxWidth:"min(360px,90vw)"}); document.body.append(node); }
    node.textContent = message; node.hidden = false;
    clearTimeout(node._hideTimer); node._hideTimer = setTimeout(()=>{node.hidden=true;},5000);
  };
  async function importFiles(files, options={}) {
    if (!fsReady()) throw new Error("WebOS filesystem is still starting. Try again in a moment.");
    const list = Array.from(files || []); let imported=0, failed=[];
    for (const file of list) {
      try {
        const relative = file.webkitRelativePath || file.name || "Imported file";
        const segments = relative.split("/").filter(Boolean).map(safeName);
        if (!segments.length) continue;
        const folder = options.destination || "/Downloads";
        const path = window.WebOSFileSystem.normalize(folder + "/" + segments.join("/"));
        await window.WebOSFileSystem.putBinary(path, file, file.type || "application/octet-stream");
        imported++;
      } catch(error) { failed.push((file.name||"file")+": "+error.message); }
    }
    status(imported+" file(s) imported to /Downloads"+(failed.length?"; "+failed.length+" failed.":"." ));
    if (failed.length) console.warn("WebOS host import failures:",failed);
    window.dispatchEvent(new CustomEvent("webos:files-imported",{detail:{imported,failed}}));
    return {imported,failed};
  }
  window.WebOSHostImport = Object.freeze({importFiles});
  window.addEventListener("message", event => {
    if (event.source !== window.parent || event.data?.type !== "WEBOS_HOST_FILES") return;
    importFiles(event.data.files).catch(error=>status(error.message));
  });
  const makeButton=(label,title,onClick)=>{
    const b=document.createElement("button");b.type="button";b.textContent=label;b.title=title;
    Object.assign(b.style,{position:"fixed",right:"16px",bottom: "16px",zIndex:"99990",border:"1px solid #ffffff45",borderRadius:"12px",padding:"10px 14px",background:"rgba(22,34,52,.92)",color:"#fff",font:"600 13px system-ui",cursor:"pointer",backdropFilter:"blur(16px)"});
    b.addEventListener("click",onClick);document.body.append(b);return b;
  };
  const fileInput=document.createElement("input");fileInput.type="file";fileInput.multiple=true;fileInput.hidden=true;fileInput.accept="*/*";
  const folderInput=document.createElement("input");folderInput.type="file";folderInput.multiple=true;folderInput.hidden=true;folderInput.setAttribute("webkitdirectory","");folderInput.setAttribute("directory","");
  fileInput.addEventListener("change",()=>importFiles(fileInput.files).catch(e=>status(e.message)).finally(()=>fileInput.value=""));
  folderInput.addEventListener("change",()=>importFiles(folderInput.files).catch(e=>status(e.message)).finally(()=>folderInput.value=""));
  document.addEventListener("DOMContentLoaded",()=>{
    document.body.append(fileInput,folderInput);
    makeButton("＋ Import", "Import files or folders from this device",()=>{
      const choice=document.createElement("div");Object.assign(choice.style,{position:"fixed",right:"16px",bottom:"62px",zIndex:"99991",display:"flex",gap:"8px",padding:"8px",borderRadius:"12px",background:"#152235",boxShadow:"0 8px 28px #0008"});
      const add=(label,fn)=>{const b=document.createElement("button");b.type="button";b.textContent=label;b.addEventListener("click",()=>{choice.remove();fn();});choice.append(b);};
      add("Choose files",()=>fileInput.click());add("Choose folder",()=>folderInput.click());document.body.append(choice);setTimeout(()=>choice.remove(),10000);
    });
  });
  let dragDepth=0,overlay;
  const show=()=>{if(!overlay){overlay=document.createElement("div");overlay.textContent="Drop files or folders into WebOS";Object.assign(overlay.style,{position:"fixed",inset:"12px",zIndex:"999999",display:"grid",placeItems:"center",border:"3px dashed #ffb26e",borderRadius:"24px",background:"#101722dd",color:"#fff",font:"600 22px system-ui",pointerEvents:"none"});document.body.append(overlay);}};
  const hide=()=>{dragDepth=0;overlay?.remove();overlay=null;};
  window.addEventListener("dragenter",e=>{if(e.dataTransfer?.types?.includes("Files")){e.preventDefault();dragDepth++;show();}});
  window.addEventListener("dragover",e=>{if(e.dataTransfer?.types?.includes("Files"))e.preventDefault();});
  window.addEventListener("dragleave",e=>{if(e.dataTransfer?.types?.includes("Files")){dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)hide();}});
  window.addEventListener("drop",async e=>{if(!e.dataTransfer?.files?.length)return;e.preventDefault();hide();await importFiles(e.dataTransfer.files).catch(err=>status(err.message));});
})();