/* WebOS Core 2.1: hardware, process, storage and network system apps. */
(() => {
  "use strict";
  const $ = (root, selector) => root.querySelector(selector);
  const make = (tag, cls, value) => { const el=document.createElement(tag); if(cls)el.className=cls; if(value!==undefined)el.textContent=String(value); return el; };
  const shell = (title, intro) => {
    const root=make("section","webos-platform-app");
    const h=make("h2","",title), p=make("p","",intro);
    root.append(h,p); return root;
  };
  const output = root => { const el=make("pre","wpa-output","Ready."); root.append(el); return el; };
  const report = (el, value) => { el.textContent=typeof value==="string"?value:JSON.stringify(value,null,2); };
  const button = (label, fn) => { const el=make("button","wpa-action",label); el.type="button"; el.addEventListener("click",fn); return el; };
  const capMap = () => new Map((window.WebOS?.capabilities?.()||[]).map(item=>[item.id,item]));
  const safeRun = async (out, fn) => { try { report(out,await fn()); } catch(error) { report(out,"Unavailable: "+(error?.message||String(error))); } };

  window.openHardwareManager = function() {
    if(typeof closeLauncher==="function")closeLauncher();
    const root=shell("Hardware Manager","Inspect browser-exposed hardware capabilities. Device access always requires your action and browser approval.");
    const caps=capMap(), grid=make("div","wpa-grid");
    const ids=["webgpu","usb","serial","hid","bluetooth","webcodecs","webxr","midi","fileSystemAccess","opfs"];
    ids.forEach(id=>{
      const cap=caps.get(id)||{id,name:id,supported:false,secureRequired:false};
      const card=make("article","wpa-card"), name=make("strong","",cap.name||id);
      const state=make("span","wpa-state",cap.supported?"Available":"Not available"); state.dataset.ok=String(!!cap.supported);
      const note=make("small","",cap.secureRequired&&!window.isSecureContext?"Requires a secure context":(cap.secureRequired?"Secure context API":"Browser-dependent API"));
      card.append(name,state,note); grid.append(card);
    });
    root.append(grid);
    const toolbar=make("div","wpa-toolbar");
    const out=output(root);
    const run=(label,fn)=>toolbar.append(button(label,()=>safeRun(out,fn)));
    run("Choose USB device",async()=>{const d=await window.WebOS.hardware.requestUSB([]);return {productName:d.productName||"USB device",vendorId:d.vendorId,productId:d.productId,opened:false};});
    run("Choose serial port",async()=>{const port=await window.WebOS.hardware.requestSerial({});return {connected:true,info:await port.getInfo?.()||{}};});
    run("Choose HID device",async()=>{const ds=await window.WebOS.hardware.requestHID([]);return ds.map(d=>({productName:d.productName,vendorId:d.vendorId,productId:d.productId,collections:d.collections?.length||0}));});
    run("Choose Bluetooth device",async()=>{const d=await window.WebOS.hardware.requestBluetooth({acceptAllDevices:true,optionalServices:[]});return {name:d.name||"Bluetooth device",id:d.id};});
    run("Inspect GPU",()=>window.WebOS.hardware.gpuInfo());
    run("Check WebCodecs",async()=>({encoder:typeof VideoEncoder!=="undefined",decoder:typeof VideoDecoder!=="undefined"}));
    run("Check XR support",async()=>({immersiveVR:!!(await navigator.xr?.isSessionSupported?.("immersive-vr")),immersiveAR:!!(await navigator.xr?.isSessionSupported?.("immersive-ar"))}));
    toolbar.append(button("Request XR session",async()=>{
      try{const session=await window.WebOS.hardware.requestXR("immersive-vr");report(out,"XR session started. Ending the test session…");await session.end();report(out,"XR session test completed.");}
      catch(error){report(out,"XR unavailable: "+(error?.message||String(error)));}
    }));
    root.insertBefore(toolbar,out);
    const win=createWindow("Hardware Manager",root); return win||null;
  };

  window.openTaskManager = function() {
    if(typeof closeLauncher==="function")closeLauncher();
    const root=shell("Task Manager","View WebOS windows and registered tasks. Browser security does not expose full host process, CPU, or per-app memory statistics.");
    const summary=make("div","wpa-muted","Loading tasks…"), list=make("div","wpa-list");
    root.append(summary,list);
    const render=()=>{
      const tasks=(window.WebOS?.processes?.list?.()||[]).filter(task=>task.kind!=="window");
      const windows=[...document.querySelectorAll("#window-workspace .window-shell")];
      summary.textContent=tasks.length+" background/app task(s) · "+windows.length+" open window(s)";
      list.replaceChildren();
      if(!tasks.length&&!windows.length){list.append(make("div","wpa-empty","No running WebOS tasks."));return;}
      tasks.forEach(task=>{
        const row=make("article","wpa-row"), body=make("div","");
        body.append(make("strong","",task.name||task.id),make("small","",(task.kind||"task")+" · "+(task.state||"running")+" · started "+new Date(task.startedAt||Date.now()).toLocaleTimeString()));
        row.append(body,make("span","wpa-muted",task.detail||task.id));list.append(row);
      });
      windows.forEach((win,index)=>{
        const row=make("article","wpa-row"),body=make("div","");
        body.append(make("strong","",win.querySelector(".window-title-text")?.textContent||"WebOS window"),
          make("small","",(win.dataset.webosAppId||"window")+" · "+(win.classList.contains("is-minimized")?"minimized":"open")));
        const focus=button("Focus",()=>{win.classList.remove("is-minimized");window.focusWindow?.(win);});
        const close=button("Close",()=>win.querySelector(".win-btn.close")?.click());
        row.append(body,focus,close);list.append(row);
      });
    };
    render();
    const unsubscribe=window.WebOS?.processes?.subscribe?.(render);
    const win=createWindow("Task Manager",root);
    if(win){const observer=new MutationObserver(()=>{if(!win.isConnected){unsubscribe?.();observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});}
    return win||null;
  };

  window.openWorkspaceManager = function() {
    if(typeof closeLauncher==="function")closeLauncher();
    const root=shell("Workspace Manager","Organize separate virtual desktops. Apps remain open when you switch workspaces.");
    root.classList.add("webos-workspace-app");
    const actions=make("div","webos-workspace-actions");
    const list=make("div","wpa-list");
    const out=output(root);
    const render=()=>{
      list.replaceChildren();
      const items=window.WebOSWorkspaces?.list?.()||[];
      items.forEach(item=>{
        const row=make("article","webos-workspace-item"),body=make("div","");
        body.append(make("strong","",item.name+(item.active?" · Current":"")),make("small","",item.windows+" open window(s)"));
        const open=button(item.active?"Current":"Switch",()=>{window.WebOSWorkspaces.switchTo(item.id);render();});
        open.disabled=item.active;
        const rename=button("Rename",()=>{const name=prompt("Workspace name",item.name);if(name!==null){window.WebOSWorkspaces.rename(item.id,name);render();}});
        row.append(body,open,rename);
        if(items.length>1&&!item.active)row.append(button("Remove",()=>{
          const destination=items.find(x=>x.id!==item.id&&x.id===window.WebOSWorkspaces.activeId())||items.find(x=>x.id!==item.id);
          if(destination&&confirm("Move this desktop's windows to "+destination.name+" and remove "+item.name+"?")){window.WebOSWorkspaces.remove(item.id,destination.id);render();}
        }));
        list.append(row);
      });
    };
    actions.append(button("＋ New desktop",()=>{try{const item=window.WebOSWorkspaces.create();window.WebOSWorkspaces.switchTo(item.id);render();}catch(error){report(out,error.message);}}));
    actions.append(button("Refresh",render));
    root.append(actions,list,out);
    const win=createWindow("Workspace Manager",root);
    const changed=()=>render();window.addEventListener("webos:workspace-change",changed);
    if(win){const observer=new MutationObserver(()=>{if(!win.isConnected){window.removeEventListener("webos:workspace-change",changed);observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});}
    render();return win||null;
  };

  window.openStorageManager = function() {
    if(typeof closeLauncher==="function")closeLauncher();
    const root=shell("Storage Manager","Inspect this site's storage estimate and request browser-managed persistence.");
    const grid=make("div","wpa-grid"), quota=make("article","wpa-card"), opfs=make("article","wpa-card");
    quota.append(make("strong","","Browser storage"),make("span","wpa-muted","Loading usage…"));
    opfs.append(make("strong","","Origin Private File System"),make("span","wpa-muted",navigator.storage?.getDirectory?"Available":"Unavailable"));
    grid.append(quota,opfs);root.append(grid);
    const out=output(root), toolbar=make("div","wpa-toolbar");
    toolbar.append(button("Refresh usage",async()=>safeRun(out,async()=>{
      const estimate=await navigator.storage?.estimate?.();
      const persisted=await navigator.storage?.persisted?.();
      const bytes=n=>n==null?"Unavailable":(n/1024/1024).toFixed(2)+" MB";
      quota.querySelector("span").textContent="Used "+bytes(estimate?.usage)+" of "+bytes(estimate?.quota);
      return {usageBytes:estimate?.usage??null,quotaBytes:estimate?.quota??null,persistent:!!persisted};
    })));
    toolbar.append(button("Request persistent storage",async()=>safeRun(out,async()=>{
      const granted=await navigator.storage?.persist?.();
      return {persistent:!!granted,message:granted?"The browser granted persistent storage.":"The browser did not grant persistence."};
    })));
    toolbar.append(button("Open OPFS root",async()=>safeRun(out,async()=>{
      const dir=await window.WebOS.storage.openPrivateRoot();let count=0;
      for await(const _ of dir.values())count++;
      return {available:true,topLevelEntries:count,note:"OPFS is separate from the visible WebOS Explorer filesystem."};
    })));
    root.append(toolbar,out);
    const win=createWindow("Storage Manager",root);
    safeRun(out,async()=>{const estimate=await navigator.storage?.estimate?.();const persisted=await navigator.storage?.persisted?.();const bytes=n=>n==null?"Unavailable":(n/1024/1024).toFixed(2)+" MB";quota.querySelector("span").textContent="Used "+bytes(estimate?.usage)+" of "+bytes(estimate?.quota);return {persistent:!!persisted,opfs:!!navigator.storage?.getDirectory};});
    return win||null;
  };


  window.openMobilePreview = function() {
    if(typeof closeLauncher==="function")closeLauncher();
    const root=shell("Mobile Preview & Test Suite","Preview the actual WebOS mobile edition at common device sizes and run browser-side smoke checks.");
    root.classList.add("webos-mobile-preview");
    const toolbar=make("div","wmp-toolbar");
    const viewport=make("div","wmp-viewport");
    const frame=document.createElement("iframe");
    frame.className="wmp-device-frame";frame.title="WebOS mobile edition preview";frame.src="/mobile.html?developerPreview=1";
    frame.setAttribute("allow","fullscreen");frame.setAttribute("loading","eager");
    const deviceBar=make("div","wmp-device-bar");
    const select=document.createElement("select");select.setAttribute("aria-label","Preview device size");
    [["phone-small","Small phone · 360 × 740",360,740],["phone","Phone · 390 × 844",390,844],["phone-large","Large phone · 430 × 932",430,932],["tablet","Tablet · 768 × 1024",768,1024],["landscape","Phone landscape · 844 × 390",844,390]].forEach(([id,label,w,h])=>{const option=document.createElement("option");option.value=id;option.textContent=label;option.dataset.width=w;option.dataset.height=h;select.append(option);});
    const size=make("span","wmp-size","390 × 844");
    const reload=button("↻ Reload preview",()=>loadPreview());
    const run=button("Run tests",()=>runTests());
    deviceBar.append(select,size,reload,run);
    const testPanel=make("section","wmp-tests");
    const testHeader=make("div","wmp-test-header");
    const testTitle=make("strong","","Mobile smoke tests");
    const testSummary=make("span","wmp-test-summary","Not run");
    const results=make("div","wmp-test-results");
    testHeader.append(testTitle,testSummary);testPanel.append(testHeader,results);
    const status=make("p","wmp-status","Loading mobile edition…");
    root.append(deviceBar,viewport,status,testPanel);
    viewport.append(frame);
    let loadToken=0;
    function setDevice(){
      const option=select.selectedOptions[0],w=Number(option.dataset.width),h=Number(option.dataset.height);
      frame.style.width=w+"px";frame.style.height=h+"px";size.textContent=w+" × "+h;
      viewport.style.setProperty("--device-width",w+"px");viewport.style.setProperty("--device-height",h+"px");
    }
    function mobileDocument(){
      try{
        const home=frame.contentDocument;
        const inner=home?.getElementById("system-frame");
        return inner?.contentDocument||null;
      }catch(_){return null;}
    }
    function loadPreview(){
      const token=++loadToken;status.textContent="Loading mobile edition…";testSummary.textContent="Not run";results.replaceChildren();
      frame.onload=()=>{
        if(token!==loadToken)return;
        const home=frame.contentDocument;
        if(!home){status.textContent="Preview could not be inspected. Check same-origin access.";return;}
        const enter=home.getElementById("launch-os");
        const inner=home.getElementById("system-frame");
        if(enter&&inner){
          inner.addEventListener("load",()=>{if(token===loadToken)status.textContent="Mobile workspace loaded.";},{once:true});
          enter.click();
          status.textContent="Opening the mobile workspace…";
        }else status.textContent="Mobile entry page loaded; workspace launch control was not found.";
      };
      frame.src="/mobile.html?developerPreview=1&reload="+Date.now();
    }
    function addResult(label,state,detail){
      const row=make("article","wmp-test-row "+state);
      const icon=make("span","wmp-test-icon",state==="pass"?"✓":state==="fail"?"×":"!");
      const body=make("div","wmp-test-copy");
      body.append(make("strong","",label),make("small","",detail));
      row.append(icon,body);results.append(row);
    }
    function runTests(){
      results.replaceChildren();const doc=mobileDocument(),checks=[];
      if(!doc){addResult("Mobile workspace","fail","The mobile shell has not loaded or is not same-origin.");testSummary.textContent="1 failed";return;}
      const body=doc.body,html=doc.documentElement;
      checks.push(["Mobile mode flag",body.dataset.webosMode==="mobile",body.dataset.webosMode||"Expected data-webos-mode=mobile"]);
      const viewportMeta=doc.querySelector('meta[name="viewport"]');
      checks.push(["Responsive viewport",!!viewportMeta&&/width=device-width/.test(viewportMeta.content),viewportMeta?.content||"Viewport meta tag missing"]);
      const mobileCss=[...doc.styleSheets].some(sheet=>{try{return sheet.href?.includes("mobile_shell.css");}catch(_){return false;}});
      checks.push(["Mobile stylesheet",mobileCss,mobileCss?"mobile_shell.css is linked":"mobile_shell.css was not found"]);
      checks.push(["Window workspace",!!doc.getElementById("window-workspace"),"Checks for the mobile window host"]);
      checks.push(["App registry",!!doc.defaultView.WebOSAppRegistry,"Checks the shared app registry"]);
      checks.push(["WebOS core API",!!doc.defaultView.WebOS,"Checks core runtime initialization"]);
      checks.push(["Workspace service",!!doc.defaultView.WebOSWorkspaces,"Checks virtual desktop service availability"]);
      const mobileRules=doc.querySelectorAll(".mobile-app-window").length;
      checks.push(["Mobile window mode",body.dataset.webosMode==="mobile"&&doc.querySelectorAll(".resize-handle").length>0,"Mobile mode should suppress desktop drag/resize handlers at window creation"]);
      const unsupported=doc.defaultView.matchMedia?.("(pointer: coarse)").matches;
      checks.push(["Viewport emulation",html.clientWidth===Number(select.selectedOptions[0].dataset.width), "Rendered width "+html.clientWidth+" px; "+(unsupported?"coarse pointer":"desktop pointer emulation")]);
      let pass=0,fail=0;
      checks.forEach(([label,ok,detail])=>{const state=ok?"pass":"fail";if(ok)pass++;else fail++;addResult(label,state,detail);});
      testSummary.textContent=pass+" passed · "+fail+" failed";
      status.textContent=fail?"Smoke tests finished with failures. Review the checks below.":"All mobile smoke tests passed.";
    }
    select.addEventListener("change",()=>{setDevice();loadPreview();});
    setDevice();root.querySelector(".wmp-toolbar")?.remove();
    const win=createWindow("Mobile Preview & Test Suite",root);
    // Keep device controls inside the window rather than relying on global launcher UI.
    root.insertBefore(deviceBar,viewport);
    reload.addEventListener("click",loadPreview);run.addEventListener("click",runTests);
    loadPreview();return win||null;
  };

  window.openNetworkManager = function() {
    if(typeof closeLauncher==="function")closeLauncher();
    const root=shell("Network Manager","Inspect connectivity and optional browser network hints. Wi-Fi names, passwords, and signal strength are not exposed to ordinary web apps.");
    const grid=make("div","wpa-grid"), out=output(root);
    const online=make("article","wpa-card"), connection=make("article","wpa-card");
    online.append(make("strong","","Connection"),make("span","wpa-state",navigator.onLine?"Online":"Offline"));
    connection.append(make("strong","","Network hints"),make("span","wpa-muted","Loading…"));
    grid.append(online,connection);root.insertBefore(grid,out);
    const refresh=async()=>{
      const info=await window.WebOSDeviceInfo?.getInfo?.();
      online.querySelector(".wpa-state").textContent=info?.online?"Online":"Offline";
      online.querySelector(".wpa-state").dataset.ok=String(!!info?.online);
      connection.querySelector("span").textContent=[info?.network?.effectiveType||"Type unavailable",info?.network?.downlinkMbps!=null?info.network.downlinkMbps+" Mbps":"Downlink unavailable",info?.network?.rttMs!=null?info.network.rttMs+" ms RTT":"RTT unavailable"].join(" · ");
      report(out,{online:info?.online??navigator.onLine,network:info?.network||null,browser:"Network Information API support varies by browser."});
    };
    const toolbar=make("div","wpa-toolbar");toolbar.append(button("Refresh",refresh));root.insertBefore(toolbar,out);
    window.addEventListener("online",refresh);window.addEventListener("offline",refresh);
    const win=createWindow("Network Manager",root);
    if(win){const observer=new MutationObserver(()=>{if(!win.isConnected){window.removeEventListener("online",refresh);window.removeEventListener("offline",refresh);observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});}
    refresh();return win||null;
  };
})();
