/* WebOS Mobile shell controller: shared app engine, mobile presentation and lifecycle. */
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
  const registeredApps = () => {
    try { const apps = window.WebOSAppRegistry?.all?.(); return Array.isArray(apps) ? apps : []; }
    catch (_) { return []; }
  };
  const allApps = () => {
    const registered = registeredApps();
    const map = new Map(fallbackApps.map(app => [app.id, app]));
    registered.forEach(app => map.set(app.id, { ...map.get(app.id), ...app }));
    const legacy = map.get("alpine");
    if (legacy && !map.has("emulator")) map.set("emulator", { ...legacy, id:"emulator", name:"FlairOS", icon:"🖥️" });
    return [...map.values()].filter(app => app.id && (app.handler || app.dynamic || registered.some(item => item.id === app.id)));
  };

  const windowsByApp = new Map();
  const pendingLaunches = new Map();
  let activeWindow = null;
  let activeAppId = null;

  function buttonFor(app, index) {
    const button = document.createElement("button");
    button.className = "app"; button.type = "button";
    button.style.setProperty("--app-index", String(index));
    button.setAttribute("aria-label", "Open " + app.name);
    const icon = document.createElement("span");
    icon.className = "app-icon"; icon.setAttribute("aria-hidden", "true");
    icon.textContent = app.icon || "◈";
    const name = document.createElement("span"); name.textContent = app.name;
    button.append(icon, name);
    button.addEventListener("click", () => openApp(app.id));
    return button;
  }
  function renderRunningApps() {
    const host = $("running-apps"), count = $("running-app-count");
    if (!host || !count) return;
    const running = [...windowsByApp].filter(([,win]) => win.isConnected && !win.classList.contains("is-closing"));
    count.textContent = running.length + (running.length === 1 ? " app open" : " apps open");
    if (!running.length) {
      host.replaceChildren(Object.assign(document.createElement("p"), { className:"muted", textContent:"No apps are running." }));
      return;
    }
    const nodes = running.map(([id,win]) => {
      const app = allApps().find(item => item.id === id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "running-app";
      button.setAttribute("aria-current", String(win === activeWindow));
      const label = document.createElement("span");
      label.className = "running-app-name";
      label.textContent = (app?.icon || "◈") + "  " + (app?.name || win.querySelector(".window-title-text")?.textContent || id);
      const state = document.createElement("small");
      state.textContent = win === activeWindow ? "Open" : win.classList.contains("is-minimized") ? "Paused" : "Running";
      button.append(label,state);
      button.addEventListener("click", () => { activateWindow(win); hideOverlay("quick-panel"); });
      return button;
    });
    host.replaceChildren(...nodes);
  }
  function renderApps(query) {
    const q = (query || "").trim().toLocaleLowerCase();
    const matches = allApps().filter(app => (app.name + " " + (app.description || "") + " " + app.id).toLocaleLowerCase().includes(q));
    $("favourites").replaceChildren(...matches.filter(app => ["files","notes","settings"].includes(app.id)).map(buttonFor));
    $("dock").replaceChildren(...["files","notes","settings","paint"].map((id, index) => {
      const app = allApps().find(item => item.id === id);
      return app ? buttonFor(app, index) : document.createDocumentFragment();
    }));
    $("all-app-grid").replaceChildren(...(matches.length ? matches.map(buttonFor) : [
      Object.assign(document.createElement("div"), { className:"empty", textContent:"No apps found" })
    ]));
  }
  function updateTime() {
    const now = new Date();
    $("clock").textContent = new Intl.DateTimeFormat(undefined, {hour:"numeric",minute:"2-digit"}).format(now);
    $("date").textContent = new Intl.DateTimeFormat(undefined, {weekday:"short",month:"short",day:"numeric"}).format(now);
    const hour = now.getHours();
    $("greeting").textContent = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";
  }
  function showOverlay(id) {
    const panel = $(id); if (!panel) return;
    panel.classList.add("open"); panel.setAttribute("aria-hidden", "false");
  }
  function hideOverlay(id) {
    const panel = $(id); if (!panel) return;
    panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true");
  }
  function toast(message) {
    const node = $("toast"); if (!node) return;
    node.textContent = message; node.classList.add("show");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove("show"), 2600);
  }
  function currentWindows() {
    return [...document.querySelectorAll("#window-workspace > .window-shell:not(.is-closing)")];
  }
  function topWindow(exclude) {
    return currentWindows().filter(win => win !== exclude && !win.classList.contains("is-minimized"))
      .sort((a,b) => (Number(b.style.getPropertyValue("--webos-window-layer")) || Number(b.style.zIndex) || 0) - (Number(a.style.getPropertyValue("--webos-window-layer")) || Number(a.style.zIndex) || 0))[0] || null;
  }
  function activateWindow(win) {
    if (!win?.isConnected || win.classList.contains("is-closing")) return false;
    win.classList.remove("is-minimized");
    if (typeof window.focusWindow === "function") window.focusWindow(win);
    else {
      currentWindows().forEach(item => {
        const active = item === win && !item.classList.contains("is-minimized");
        item.classList.toggle("is-mobile-active", active);
        item.inert = !active;
        item.setAttribute("aria-hidden", String(!active));
      });
    }
    activeWindow = win;
    activeAppId = win.dataset.mobileAppId || win.dataset.webosAppId || null;
    document.body.dataset.appOpen = "true";
    renderRunningApps();
    return true;
  }
  function goHome() {
    if (activeWindow?.isConnected) activeWindow.classList.add("is-minimized");
    const next = topWindow(activeWindow);
    activeWindow = null; activeAppId = null;
    if (next) activateWindow(next);
    else delete document.body.dataset.appOpen;
    renderRunningApps();
  }
  function reconcileWindows() {
    for (const [id, win] of windowsByApp) if (!win.isConnected || win.classList.contains("is-closing")) windowsByApp.delete(id);
    if (activeWindow?.isConnected && !activeWindow.classList.contains("is-minimized") && !activeWindow.classList.contains("is-closing")) return;
    const next = topWindow();
    if (next) activateWindow(next);
    else { activeWindow = null; activeAppId = null; delete document.body.dataset.appOpen; }
    renderRunningApps();
  }
  function findNewWindow(before, result) {
    if (result instanceof HTMLElement && result.matches(".window-shell")) return result;
    return currentWindows().find(item => !before.has(item)) || null;
  }
  async function openApp(id) {
    hideOverlay("drawer"); hideOverlay("quick-panel");
    const app = allApps().find(item => item.id === id);
    if (!app) return;
    const existing = windowsByApp.get(id) || currentWindows().find(win => win.dataset.mobileAppId === id || win.dataset.webosAppId === id);
    if (existing?.isConnected) { activateWindow(existing); return existing; }
    if (pendingLaunches.has(id)) return pendingLaunches.get(id);

    const launch = (async () => {
      try {
        const before = new Set(currentWindows());
        let result;
        if (registeredApps().some(item => item.id === id)) result = window.WebOSAppRegistry.launch(id);
        else {
          const handler = window[app.handler];
          if (typeof handler !== "function") throw new Error(app.name + " is not available in this build.");
          result = handler();
        }
        if (result && typeof result.then === "function") result = await result;
        const win = findNewWindow(before, result);
        if (!win) throw new Error("The app did not create a window.");
        win.classList.add("mobile-app-window");
        win.dataset.mobileAppId = id;
        win.dataset.webosAppId = id;
        win.setAttribute("aria-label", app.name);
        windowsByApp.set(id, win);
        win.addEventListener("webos:window-close", () => {
          if (windowsByApp.get(id) === win) windowsByApp.delete(id);
          if (activeWindow === win) { activeWindow = null; activeAppId = null; }
          queueMicrotask(reconcileWindows);
        }, { once:true });
        win.addEventListener("pointerdown", () => activateWindow(win), { passive:true });
        win.querySelector(".mobile-switcher")?.addEventListener("click", event => { event.stopPropagation(); showOverlay("quick-panel"); renderRunningApps(); });
        win.querySelector(".mobile-home")?.addEventListener("click", event => { event.stopPropagation(); goHome(); });
        activateWindow(win);
        renderRunningApps();
        return win;
      } catch (error) {
        console.error("[WebOS Mobile] Failed to open " + app.name + ":", error);
        toast(app.name + " could not open: " + (error?.message || "unknown error"));
        return null;
      }
    })();
    pendingLaunches.set(id, launch);
    try { return await launch; }
    finally { pendingLaunches.delete(id); }
  }
  function closeTopApp() {
    const win = activeWindow?.isConnected ? activeWindow : topWindow();
    if (!win) return false;
    win.querySelector(".win-btn.close")?.click();
    return true;
  }

  $("all-apps").addEventListener("click", () => { renderApps($("drawer-search").value); showOverlay("drawer"); $("drawer-search").focus(); });
  $("gesture").addEventListener("click", () => showOverlay("drawer"));
  $("quick-open").addEventListener("click", () => showOverlay("quick-panel"));
  $("app-back").addEventListener("click", closeTopApp);
  $("app-home").addEventListener("click", goHome);
  $("home-search").addEventListener("input", event => { renderApps(event.target.value); if (event.target.value) showOverlay("drawer"); });
  $("drawer-search").addEventListener("input", event => renderApps(event.target.value));
  document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => hideOverlay(button.dataset.close)));
  document.querySelectorAll("[data-toggle]").forEach(button => button.addEventListener("click", () => {
    button.classList.toggle("active");
    const state = button.querySelector("small");
    if (state) state.textContent = button.classList.contains("active") ? "On" : "Off";
  }));
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if ($("drawer").classList.contains("open")) { hideOverlay("drawer"); return; }
    if ($("quick-panel").classList.contains("open")) { hideOverlay("quick-panel"); return; }
    if (closeTopApp()) event.preventDefault();
  });

  const workspace = $("window-workspace");
  if (workspace && "MutationObserver" in window) {
    const observer = new MutationObserver(reconcileWindows);
    observer.observe(workspace, { childList:true, subtree:true, attributes:true, attributeFilter:["class"] });
  }
  let touchStart = null;
  document.addEventListener("touchstart", event => {
    if (event.changedTouches.length) {
      const touch = event.changedTouches[0];
      touchStart = { x:touch.clientX, y:touch.clientY, target:event.target, at:Date.now() };
    }
  }, { passive:true });
  document.addEventListener("touchend", event => {
    if (!touchStart || !event.changedTouches.length) return;
    const touch = event.changedTouches[0];
    const dy = touch.clientY - touchStart.y, dx = touch.clientX - touchStart.x;
    const vertical = Math.abs(dy) > 85 && Math.abs(dy) > Math.abs(dx) * 1.2;
    const startedInApp = !!touchStart.target.closest?.("#window-workspace > .window-shell");
    const startedInOverlay = !!touchStart.target.closest?.(".overlay");
    if (vertical && !startedInOverlay) {
      if (dy < 0 && touchStart.y > window.innerHeight - 90) {
        if (startedInApp) {
          showOverlay("quick-panel");
          renderRunningApps();
          refreshSystemStatus();
        } else if (!touchStart.target.closest?.(".app-screen")) {
          showOverlay("drawer");
        }
      } else if (dy > 0 && touchStart.y < 36) {
        showOverlay("quick-panel");
        renderRunningApps();
        refreshSystemStatus();
      }
    }
    touchStart = null;
  }, { passive:true });


  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "Unavailable";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    const units = ["MB","GB","TB"];
    let value = bytes / (1024 * 1024), unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return value.toFixed(value >= 100 ? 0 : 1) + " " + units[unit];
  }
  async function refreshSystemStatus() {
    const api = window.WebOSPlatform?.device;
    const set = (id, value) => { const node = $(id); if (node) node.textContent = value; };
    if (!api?.getSnapshot) {
      set("system-network","Unavailable"); set("system-battery","Unavailable");
      set("system-storage","Unavailable"); set("system-display","Unavailable");
      return;
    }
    set("system-network","Checking…"); set("system-battery","Checking…");
    set("system-storage","Checking…"); set("system-display","Checking…");
    try {
      const data = await api.getSnapshot();
      const c = data.connection;
      set("system-network", c.online ? "Online" : "Offline");
      const networkButton = $("network-indicator");
      if (networkButton) {
        networkButton.textContent = c.online ? "● Online" : "● Offline";
        networkButton.classList.toggle("offline", !c.online);
        networkButton.setAttribute("aria-label","Network status: "+(c.online?"online":"offline")+". Open device status.");
      }
      const networkDetails = [];
      if (c.effectiveType !== "unknown") networkDetails.push(c.effectiveType.toUpperCase());
      if (c.downlink != null) networkDetails.push(c.downlink + " Mbps");
      if (c.rtt != null) networkDetails.push(c.rtt + " ms RTT");
      if (c.saveData) networkDetails.push("Data saver");
      set("system-network-detail", networkDetails.join(" · ") || (c.online ? "Network available; type not exposed" : "Cached features may still work"));
      if (data.battery) {
        set("system-battery", data.battery.level + "%");
        set("system-battery-detail", data.battery.charging ? "Charging" : "Not charging");
        const batteryButton = $("network-indicator");
        if (batteryButton) batteryButton.title = "Online · Battery "+data.battery.level+"%";
      } else {
        set("system-battery","Not exposed");
        set("system-battery-detail","Battery information is blocked or unsupported");
      }
      if (data.storage?.quota) {
        set("system-storage",formatBytes(data.storage.usage) + " used");
        set("system-storage-detail",formatBytes(data.storage.quota) + " available quota · " + (data.storage.percent ?? "—") + "% used");
      } else {
        set("system-storage","Not exposed");
        set("system-storage-detail","Browser storage estimates are unavailable");
      }
      set("system-display",data.formFactor[0].toUpperCase()+data.formFactor.slice(1));
      set("system-display-detail",data.screen.width+" × "+data.screen.height+" · "+(data.screen.orientation.startsWith("landscape")?"Landscape":"Portrait")+" · "+data.screen.pixelRatio+"×");
      set("system-status-note","Updated "+new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit"}).format(new Date(data.timestamp))+". Values are browser-reported and may be approximate.");
    } catch (error) {
      console.warn("[WebOS Mobile] Device status refresh failed:",error);
      set("system-status-note","Some device details could not be read. Try refreshing.");
    }
  }
  $("network-indicator")?.addEventListener("click",() => { showOverlay("quick-panel"); refreshSystemStatus(); });
  $("refresh-system-status")?.addEventListener("click",refreshSystemStatus);
  $("quick-open")?.addEventListener("click",refreshSystemStatus);
  window.WebOSPlatform?.on?.("viewportchange",() => {
    if ($("quick-panel")?.classList.contains("open")) refreshSystemStatus();
  });
  window.WebOSPlatform?.on?.("networkchange",() => {
    if ($("quick-panel")?.classList.contains("open")) refreshSystemStatus();
  });

  const installButton = $("install-app");
  if (installButton) {
    const syncInstallButton = () => { installButton.hidden = !window.WebOSPlatform?.installState?.canPrompt; };
    window.addEventListener("webos:platform:installavailable", syncInstallButton);
    window.addEventListener("appinstalled", syncInstallButton);
    installButton.addEventListener("click", async () => {
      const result = await window.WebOSPlatform?.install?.prompt?.();
      if (result?.outcome === "accepted") toast("WebOS installation started.");
      else if (result?.outcome === "dismissed") toast("Installation was dismissed.");
      syncInstallButton();
    });
    syncInstallButton();
  }
  window.WebOSPlatform?.on?.("networkchange", event => {
    toast(event.online ? "Connection restored." : "You are offline. Cached WebOS features remain available.");
  });

  renderApps("");
  updateTime();
  refreshSystemStatus();
  const clockTimer = setInterval(updateTime, 30000);
  window.addEventListener("pagehide", () => clearInterval(clockTimer), { once:true });
  window.WebOSMobile = Object.freeze({
    openApp, closeTopApp, goHome, activateWindow, renderApps,
    apps:allApps,
    runningApps:() => [...windowsByApp].filter(([,win]) => win.isConnected && !win.classList.contains("is-closing")).map(([id,win]) => ({ id, active:win === activeWindow, minimized:win.classList.contains("is-minimized") }))
  });
})();
