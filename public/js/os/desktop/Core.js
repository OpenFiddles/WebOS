/* WebOS Core 3.0: capability registry, hardware bridges and process lifecycle supervisor. */
(() => {
  "use strict";
  const secure = window.isSecureContext === true;
  const checks = {
    webgpu: () => !!navigator.gpu,
    bluetooth: () => !!navigator.bluetooth?.requestDevice,
    midi: () => !!navigator.requestMIDIAccess,
    usb: () => !!navigator.usb?.requestDevice,
    serial: () => !!navigator.serial?.requestPort,
    hid: () => !!navigator.hid?.requestDevice,
    webcodecs: () => typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined",
    webxr: () => !!navigator.xr,
    opfs: () => !!navigator.storage?.getDirectory,
    fileSystemAccess: () => !!window.showOpenFilePicker,
    broadcastChannel: () => typeof BroadcastChannel !== "undefined",
    serviceWorker: () => "serviceWorker" in navigator,
    sharedArrayBuffer: () => typeof SharedArrayBuffer !== "undefined"
  };
  const descriptions = {
    webgpu:"GPU compute and rendering",usb:"USB device chooser",serial:"Serial device chooser",
    hid:"Human Interface Device chooser",webcodecs:"Hardware-assisted media codecs",
    webxr:"Immersive XR sessions",bluetooth:"Bluetooth device chooser",midi:"MIDI device access",opfs:"Origin Private File System",fileSystemAccess:"User-selected host files",
    broadcastChannel:"Cross-tab messaging",serviceWorker:"Background caching and offline shell",
    sharedArrayBuffer:"Shared memory (requires cross-origin isolation)"
  };
  function capabilities() {
    return Object.entries(checks).map(([id, test]) => {
      let supported=false; try { supported=!!test(); } catch (_) {}
      return {id,name:descriptions[id],supported,secureRequired:["webgpu","usb","serial","hid","webxr","bluetooth","midi","opfs","fileSystemAccess"].includes(id),secureContext:secure};
    });
  }
  const events = new EventTarget();
  const tasks = new Map();
  let taskId=0;
  function registerTask(info={}) {
    const id=String(info.id || "task-"+(++taskId));
    const record={id,name:String(info.name||id),kind:String(info.kind||"app"),state:"running",startedAt:Date.now(),updatedAt:Date.now(),detail:String(info.detail||"")};
    tasks.set(id,record); events.dispatchEvent(new CustomEvent("change",{detail:snapshot()}));
    let ended=false;
    return {id,update(patch={}){if(ended)return;Object.assign(record,patch,{updatedAt:Date.now()});events.dispatchEvent(new CustomEvent("change",{detail:snapshot()}));},end(){if(ended)return;ended=true;record.state="stopped";record.updatedAt=Date.now();tasks.delete(id);events.dispatchEvent(new CustomEvent("change",{detail:snapshot()}));}};
  }
  function snapshot(){return [...tasks.values()].map(x=>({...x}));}
  function subscribe(fn){events.addEventListener("change",fn);return()=>events.removeEventListener("change",fn);}
  async function gpuInfo(){if(!navigator.gpu)throw Error("WebGPU is unavailable.");const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error("No compatible GPU adapter was found.");return {vendor:adapter.info?.vendor||"Unavailable",architecture:adapter.info?.architecture||"Unavailable",device:adapter.info?.device||"Unavailable",features:[...adapter.features],limits:{...adapter.limits}};}
  const hardware = Object.freeze({
    capabilities,
    async requestUSB(filters=[]){if(!navigator.usb?.requestDevice)throw Error("WebUSB is unavailable.");return navigator.usb.requestDevice(filters?.length ? {filters} : {acceptAllDevices:true});},
    async requestSerial(options={}){if(!navigator.serial?.requestPort)throw Error("Web Serial is unavailable.");return navigator.serial.requestPort(options);},
    async requestHID(filters=[]){if(!navigator.hid?.requestDevice)throw Error("WebHID is unavailable.");return navigator.hid.requestDevice({filters});},
    async requestBluetooth(options={acceptAllDevices:true,optionalServices:[]}){if(!navigator.bluetooth?.requestDevice)throw Error("Web Bluetooth is unavailable.");return navigator.bluetooth.requestDevice(options);},
    async requestGPU(){if(!navigator.gpu)throw Error("WebGPU is unavailable.");const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error("No compatible GPU adapter.");return {adapter,device:await adapter.requestDevice()};},
    gpuInfo,
    async requestXR(mode="immersive-vr",options={}){if(!navigator.xr?.requestSession)throw Error("WebXR is unavailable.");/* Call immediately: requestSession may require the original user activation. */return navigator.xr.requestSession(mode,options);},
    async codecSupport(kind,config){const ctor=kind==="encode"?window.VideoEncoder:window.VideoDecoder;if(!ctor?.isConfigSupported)throw Error("WebCodecs is unavailable.");return ctor.isConfigSupported(config);}
  });
  const storage = Object.freeze({
    async estimate(){return navigator.storage?.estimate? navigator.storage.estimate():null;},
    async persist(){return navigator.storage?.persist? navigator.storage.persist():false;},
    async openPrivateRoot(){if(!navigator.storage?.getDirectory)throw Error("OPFS is unavailable.");return navigator.storage.getDirectory();}
  });
  const processManager=Object.freeze({register:registerTask,list:snapshot,subscribe});
  const system=Object.freeze({
    version:"3.0.0",runtime:"browser",
    getInfo(){return {name:localStorage.getItem("webos-os-name")||"WebOS",version:"2.1.0",runtime:"browser",platform:navigator.userAgentData?.platform||navigator.platform||"Unavailable",browser:navigator.userAgentData?.brands?.map(x=>x.brand+" "+x.version).join(", ")||navigator.userAgent||"Unavailable",secureContext:secure,online:navigator.onLine,visibility:document.visibilityState};},
    capabilities
  });
  window.WebOSCore=Object.freeze({version:"3.0.0",system,hardware,storage,processes:processManager,events});
  window.WebOS=window.WebOS||{};
  Object.assign(window.WebOS,{version:"3.0.0",system,hardware,storage,processes:processManager,capabilities});
  window.dispatchEvent(new CustomEvent("webos:core-ready",{detail:{version:"2.0.0"}}));
  const observed=new WeakMap();
  function scanWindows(){
    document.querySelectorAll("#window-workspace .window-shell").forEach(win=>{
      let task=observed.get(win);
      if(!task){
        const title=win.querySelector(".window-title-text")?.textContent||"WebOS app";
        task=registerTask({id:"window-"+(win.id||("runtime-"+(++taskId))),name:title,kind:"window",detail:win.dataset.webosAppId||"WebOS window"});
        observed.set(win,task);
        const stateObserver=new MutationObserver(()=>updateWindowTask(win,task));
        stateObserver.observe(win,{attributes:true,attributeFilter:["class"]});
        task._observer=stateObserver;
      }
      updateWindowTask(win,task);
    });
    for(const [win,task] of liveWindows){
      if(!win.isConnected){task._observer?.disconnect();task.end();liveWindows.delete(win);}
    }
  }
  const liveWindows=new Map();
  function updateWindowTask(win,task){
    liveWindows.set(win,task);
    const state=win.classList.contains("is-closing")?"closing":win.classList.contains("is-minimized")?"suspended":"running";
    task.update({state,detail:win.dataset.webosAppId||"WebOS window"});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",scanWindows,{once:true});else scanWindows();
  const workspace=document.getElementById("window-workspace")||document.body;
  new MutationObserver(scanWindows).observe(workspace,{childList:true,subtree:true});
})();
