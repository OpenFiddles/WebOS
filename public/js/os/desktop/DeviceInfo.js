/* WebOS host-device information: browser-exposed capabilities only. */
(() => {
  "use strict";
  let battery=null, batteryPromise=null;
  const listeners=new Set();
  const connection=()=>navigator.connection||navigator.mozConnection||navigator.webkitConnection||null;
  async function getBattery(){if(!batteryPromise){batteryPromise=navigator.getBattery?Promise.resolve().then(()=>navigator.getBattery()).then(b=>{battery=b;for(const event of ["chargingchange","levelchange","chargingtimechange","dischargingtimechange"])b.addEventListener(event,emit);return b;}).catch(()=>null):Promise.resolve(null);}return batteryPromise;}
  function snapshot(){const c=connection(),memory=performance.memory,screenInfo=window.screen||{};return{
    platform:navigator.userAgentData?.platform||navigator.platform||"Unavailable",
    browser:navigator.userAgentData?.brands?.map(x=>x.brand+" "+x.version).join(", ")||navigator.userAgent||"Unavailable",
    language:navigator.language||"Unavailable",online:navigator.onLine,
    network:{type:c?.type||"Unavailable",effectiveType:c?.effectiveType||"Unavailable",downlinkMbps:Number.isFinite(c?.downlink)?c.downlink:null,rttMs:Number.isFinite(c?.rtt)?c.rtt:null,saveData:c?.saveData??null,wifiName:null,wifiSignal:null,note:"Browsers do not expose Wi-Fi SSID or signal strength to ordinary web apps."},
    battery:battery?{supported:true,level:Math.round(battery.level*100),charging:battery.charging,chargingTime:Number.isFinite(battery.chargingTime)?battery.chargingTime:null,dischargingTime:Number.isFinite(battery.dischargingTime)?battery.dischargingTime:null}:{supported:!!navigator.getBattery,level:null,charging:null},
    hardware:{logicalCores:navigator.hardwareConcurrency||null,deviceMemoryGB:navigator.deviceMemory||null,touchPoints:navigator.maxTouchPoints||0,screenWidth:screenInfo.width||null,screenHeight:screenInfo.height||null,pixelRatio:window.devicePixelRatio||1},
    memory:memory?{usedBytes:memory.usedJSHeapSize,totalBytes:memory.totalJSHeapSize,limitBytes:memory.jsHeapSizeLimit}:null,
    secureContext:window.isSecureContext===true,visibility:document.visibilityState
  };}
  function emit(){const value=snapshot();listeners.forEach(fn=>{try{fn(value);}catch(e){console.warn("WebOS device info listener:",e);}});window.dispatchEvent(new CustomEvent("webos:device-info",{detail:value}));}
  async function getInfo(){await getBattery();return snapshot();}
  async function getStorage(){if(!navigator.storage?.estimate)return null;try{const e=await navigator.storage.estimate();return{usageBytes:e.usage??null,quotaBytes:e.quota??null,usagePercent:e.quota?Math.round((e.usage||0)/e.quota*1000)/10:null};}catch(_){return null;}}
  function subscribe(fn){if(typeof fn!=="function")throw new TypeError("Listener must be a function.");listeners.add(fn);getBattery().then(emit);return()=>listeners.delete(fn);}
  window.addEventListener("online",emit);window.addEventListener("offline",emit);connection()?.addEventListener?.("change",emit);document.addEventListener("visibilitychange",emit);
  window.WebOSDeviceInfo=Object.freeze({getInfo,getStorage,subscribe,refresh:async()=>{await getBattery();emit();return snapshot();}});
  getBattery().then(emit);
})();
