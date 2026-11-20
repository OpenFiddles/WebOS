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
      const tasks=window.WebOS?.processes?.list?.()||[];
      const windows=[...document.querySelectorAll("#window-workspace .window-shell")];
      summary.textContent=tasks.length+" tracked task(s) · "+windows.length+" open window(s)";
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
