/* Core system utilities: Hardware Manager and Task Manager. */
(() => {
  "use strict";
  function coreWindow(title, content) { return window.createWindow ? window.createWindow(title, content) : null; }
  window.openHardwareManager = function() {
    const root=document.createElement("section");root.className="core-manager";
    root.innerHTML='<header><h2>Hardware Manager</h2><p>Browser-approved device and graphics capabilities</p></header><div class="core-toolbar"><button type="button" data-refresh>Refresh capabilities</button><span data-secure></span></div><div class="core-capabilities" data-list></div><section class="core-device-actions"><h3>Connect a device</h3><p>Each chooser opens only after you select a button. The browser controls device access.</p><button data-usb>Choose USB device</button><button data-serial>Choose serial port</button><button data-hid>Choose HID device</button><button data-gpu>Inspect WebGPU</button><pre data-result aria-live="polite"></pre></section>';
    const win=coreWindow("Hardware Manager",root);if(!win)return;
    const list=root.querySelector("[data-list]"),result=root.querySelector("[data-result]");
    const render=()=>{const caps=window.WebOS?.capabilities?.()||[];root.querySelector("[data-secure]").textContent=window.isSecureContext?"Secure context":"Some APIs require HTTPS";list.replaceChildren(...caps.map(c=>{const row=document.createElement("article");row.className="core-capability";const name=document.createElement("strong");name.textContent=c.name;const state=document.createElement("span");state.textContent=c.supported?"Available":"Unavailable";state.dataset.state=c.supported?"yes":"no";const note=document.createElement("small");note.textContent=c.secureRequired&&!c.secureContext?"Requires a secure context":c.supported?"Detected in this browser":"Not exposed by this browser";row.append(name,state,note);return row;}));};
    root.querySelector("[data-refresh]").onclick=render;render();
    const action=(selector,fn)=>root.querySelector(selector).addEventListener("click",async()=>{try{const value=await fn();result.textContent=typeof value==="string"?value:JSON.stringify(value?{connected:true,productName:value.productName||value.device?.productName||value.constructor?.name}:null,null,2);}catch(e){result.textContent=e.message;}});
    action("[data-usb]",()=>window.WebOS.hardware.requestUSB([]));action("[data-serial]",()=>window.WebOS.hardware.requestSerial());action("[data-hid]",()=>window.WebOS.hardware.requestHID());action("[data-gpu]",()=>window.WebOS.hardware.gpuInfo());
  };
  window.openTaskManager = function() {
    const root=document.createElement("section");root.className="core-manager";
    root.innerHTML='<header><h2>Task Manager</h2><p>WebOS-managed windows and background tasks (browser resource metrics are limited)</p></header><div class="core-toolbar"><button type="button" data-refresh>Refresh</button><span data-count></span></div><div data-list class="core-task-list"></div><p class="core-note">The browser does not expose reliable per-app CPU usage or unrestricted memory statistics. This view reports WebOS task lifecycle only.</p>';
    const win=coreWindow("Task Manager",root);if(!win)return;
    const list=root.querySelector("[data-list]"),count=root.querySelector("[data-count]");
    const render=()=>{const tasks=window.WebOS?.processes?.list()||[];count.textContent=tasks.length+" tracked tasks";list.replaceChildren(...tasks.map(t=>{const row=document.createElement("article");row.className="core-task";const name=document.createElement("strong");name.textContent=t.name;const meta=document.createElement("span");meta.textContent=t.kind+" · "+t.state;row.append(name,meta);return row;}));};
    root.querySelector("[data-refresh]").onclick=render;render();window.WebOS?.processes?.subscribe(render);
  };
})();
