(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const fallbackApps = [
    {id:"files",name:"Files",icon:"📁",description:"Browse your WebOS files and folders.",handler:"openFiles"},
    {id:"notes",name:"Notes",icon:"📝",description:"Write and organize notes.",handler:"openNotes"},
    {id:"settings",name:"Settings",icon:"⚙️",description:"Configure your WebOS environment.",handler:"openSettings"},
    {id:"calculator",name:"Calculator",icon:"🧮",description:"Everyday calculations.",handler:"openCalculator"},
    {id:"calendar",name:"Calendar",icon:"📅",description:"Dates, events, and reminders.",handler:"openCalendar"},
    {id:"monitor",name:"System Monitor",icon:"📊",description:"Inspect system status.",handler:"openSystemMonitor"},
    {id:"wasm",name:"WASM Lab",icon:"🧩",description:"Build and run WebAssembly projects.",handler:"openWasmLab"},
    {id:"appcreator",name:"App Creator",icon:"🛠️",description:"Create JavaScript and WASM apps.",handler:"openAppCreator"},
    {id:"paint",name:"Paint",icon:"🎨",description:"Draw and export images.",handler:"openPaint"},
    {id:"animation",name:"Animation Studio",icon:"🎞️",description:"Design and preview motion.",handler:"openAnimationStudio"},
    {id:"docs",name:"Documentation",icon:"📚",description:"WebOS guides and API documentation.",handler:"openDocumentation"},
    {id:"about",name:"About WebOS",icon:"ⓘ",description:"System information and credits.",handler:"openAbout"},
    {id:"emulator",name:"FlairOS",icon:"🖥️",description:"Open the FlairOS hosted emulator.",handler:"openEmulator"}
  ];
  const extras = () => {
    try { return (window.WebOSAppRegistry?.all?.() || []).map(item => ({...item})); }
    catch (_) { return []; }
  };
  const allApps = () => {
    const map = new Map(fallbackApps.map(app => [app.id, app]));
    extras().forEach(app => map.set(app.id, {...map.get(app.id), ...app}));
    // The desktop registry calls this entry "alpine" in older builds.
    const legacy = map.get("alpine");
    if (legacy && !map.has("emulator")) map.set("emulator", {...legacy,id:"emulator",name:"FlairOS",icon:"🖥️"});
    return [...map.values()].filter(app => app.id && (app.handler || app.dynamic || window.WebOSAppRegistry?.all?.().some(x => x.id === app.id)));
  };

  let activeWindow = null;
  let activeAppId = null;
  let launchToken = 0;
  let busy = false;

  function buttonFor(app, index) {
    const button = document.createElement("button");
    button.className = "app"; button.type = "button";
    button.style.setProperty("--app-index", String(index));
    button.setAttribute("aria-label", "Open " + app.name);
    const icon = document.createElement("span");
    icon.className = "app-icon"; icon.setAttribute("aria-hidden", "true");
    icon.textContent = app.icon || "◈";
    const name = document.createElement("span"); name.textContent = app.name;
    button.append(icon,name);
    button.addEventListener("click", () => openApp(app.id));
    return button;
  }
  function renderApps(query) {
    const q = (query || "").trim().toLocaleLowerCase();
    const matches = allApps().filter(app => (app.name+" "+(app.description||"")+" "+app.id).toLocaleLowerCase().includes(q));
    $("favourites").replaceChildren(...matches.filter(app => ["files","notes","settings"].includes(app.id)).map(buttonFor));
    $("dock").replaceChildren(...["files","notes","settings","paint"].map((id,i) => {
      const app = allApps().find(item => item.id === id);
      return app ? buttonFor(app,i) : document.createDocumentFragment();
    }));
    $("all-app-grid").replaceChildren(...(matches.length ? matches.map(buttonFor) : [
      Object.assign(document.createElement("div"),{className:"empty",textContent:"No apps found"})
    ]));
  }
  function updateTime() {
    const now = new Date();
    $("clock").textContent = new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit"}).format(now);
    $("date").textContent = new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric"}).format(now);
    const h = now.getHours();
    $("greeting").textContent = h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening.";
  }
  function showOverlay(id) {
    const panel=$(id); if(!panel)return;
    panel.classList.add("open"); panel.setAttribute("aria-hidden","false");
  }
  function hideOverlay(id) {
    const panel=$(id); if(!panel)return;
    panel.classList.remove("open"); panel.setAttribute("aria-hidden","true");
  }
  function toast(message) {
    const node=$("toast"); node.textContent=message; node.classList.add("show");
    clearTimeout(toast.timer); toast.timer=setTimeout(()=>node.classList.remove("show"),2400);
  }
  function currentWindows() {
    return [...document.querySelectorAll("#window-workspace > .window-shell:not(.is-closing)")];
  }
  function findNewWindow(before,result) {
    if(result instanceof HTMLElement && result.matches(".window-shell")) return result;
    return currentWindows().find(item=>!before.has(item)) || null;
  }
  const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
  async function closeCurrentWindows() {
    const windows=currentWindows();
    windows.forEach(win=>win.querySelector(".win-btn.close")?.click());
    if(windows.length) await wait(220);
  }
  async function openApp(id) {
    hideOverlay("drawer"); hideOverlay("quick-panel");
    const app=allApps().find(item=>item.id===id);
    if(!app)return;
    if(activeWindow?.isConnected && activeAppId===id && !activeWindow.classList.contains("is-closing")) {
      activeWindow.classList.remove("is-minimized");
      activeWindow.style.zIndex="214748300";
      return;
    }
    if(busy)return;
    busy=true;
    const token=++launchToken;
    try {
      await closeCurrentWindows();
      if(token!==launchToken)return;
      activeWindow=null; activeAppId=null;
      const before=new Set(currentWindows());
      let result;
      if(window.WebOSAppRegistry?.all?.().some(item=>item.id===id)) {
        result=window.WebOSAppRegistry.launch(id);
      } else {
        const handler=window[app.handler];
        if(typeof handler!=="function") throw new Error(app.name+" is not available in this build.");
        result=handler();
      }
      if(result && typeof result.then==="function") result=await result;
      const win=findNewWindow(before,result);
      if(!win) throw new Error("The app did not create a window.");
      win.classList.add("mobile-app-window");
      win.dataset.mobileAppId=id;
      activeWindow=win; activeAppId=id;
      document.body.dataset.appOpen="true";
      win.addEventListener("webos:window-close",()=>{
        if(activeWindow===win){activeWindow=null;activeAppId=null;delete document.body.dataset.appOpen;}
      },{once:true});
    } catch(error) {
      console.error("[WebOS Mobile] Failed to open "+app.name+":",error);
      toast(app.name+" could not open: "+(error?.message||"unknown error"));
    } finally { busy=false; }
  }
  function closeTopApp() {
    const win=activeWindow?.isConnected ? activeWindow : currentWindows().at(-1);
    if(!win)return false;
    win.querySelector(".win-btn.close")?.click();
    return true;
  }

  $("all-apps").addEventListener("click",()=>{renderApps($("drawer-search").value);showOverlay("drawer");$("drawer-search").focus();});
  $("gesture").addEventListener("click",()=>showOverlay("drawer"));
  $("quick-open").addEventListener("click",()=>showOverlay("quick-panel"));
  $("app-back").addEventListener("click",closeTopApp);
  $("app-home").addEventListener("click",closeTopApp);
  $("home-search").addEventListener("input",event=>{renderApps(event.target.value);if(event.target.value)showOverlay("drawer");});
  $("drawer-search").addEventListener("input",event=>renderApps(event.target.value));
  document.querySelectorAll("[data-close]").forEach(button=>button.addEventListener("click",()=>hideOverlay(button.dataset.close)));
  document.querySelectorAll("[data-toggle]").forEach(button=>button.addEventListener("click",()=>{
    button.classList.toggle("active"); button.querySelector("small").textContent=button.classList.contains("active")?"On":"Off";
  }));
  document.addEventListener("keydown",event=>{
    if(event.key!=="Escape")return;
    if(closeTopApp()){event.preventDefault();return;}
    hideOverlay("drawer");hideOverlay("quick-panel");
  });
  let touchStart=null;
  document.addEventListener("touchstart",event=>{
    if(event.changedTouches.length)touchStart={x:event.changedTouches[0].clientX,y:event.changedTouches[0].clientY};
  },{passive:true});
  document.addEventListener("touchend",event=>{
    if(!touchStart||!event.changedTouches.length)return;
    const t=event.changedTouches[0],dy=t.clientY-touchStart.y,dx=t.clientX-touchStart.x;
    if(Math.abs(dy)>70&&Math.abs(dy)>Math.abs(dx)){
      if(dy<0&&touchStart.y>window.innerHeight-110)showOverlay("drawer");
      if(dy>0&&activeWindow)closeTopApp();
    }
    touchStart=null;
  },{passive:true});
  renderApps(""); updateTime(); setInterval(updateTime,30000);
  window.WebOSMobile=Object.freeze({openApp,closeTopApp,renderApps,apps:allApps});
})();