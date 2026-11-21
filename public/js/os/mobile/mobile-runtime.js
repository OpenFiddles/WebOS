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

  const FAVORITES_KEY = "webos.mobile.favorites.v1";
  const DEFAULT_FAVORITES = ["files","notes","settings"];
  function loadFavorites() {
    try {
      const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "null");
      if (Array.isArray(value)) return [...new Set(value.filter(id => typeof id === "string"))];
    } catch (_) {}
    return [...DEFAULT_FAVORITES];
  }
  let favoriteIds = loadFavorites();
  function saveFavorites() {
    try { localStorage.setItem(FAVORITES_KEY,JSON.stringify(favoriteIds)); }
    catch (error) { console.warn("[WebOS Mobile] Could not save favourites:",error); }
  }
  function toggleFavorite(id) {
    favoriteIds = favoriteIds.includes(id) ? favoriteIds.filter(item => item !== id) : [...favoriteIds,id];
    saveFavorites();
    renderApps($("drawer-search")?.value || "");
    toast(favoriteIds.includes(id) ? "Added to favourites." : "Removed from favourites.");
  }
  function buttonFor(app, index, allowPin = false) {
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
    if (!allowPin) return button;
    const tile = document.createElement("div");
    tile.className = "app-tile";
    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "app-pin";
    pin.textContent = favoriteIds.includes(app.id) ? "★" : "☆";
    pin.setAttribute("aria-label",(favoriteIds.includes(app.id)?"Remove ":"Add ")+app.name+" "+(favoriteIds.includes(app.id)?"from":"to")+" favourites");
    pin.setAttribute("aria-pressed",String(favoriteIds.includes(app.id)));
    pin.addEventListener("click",event => { event.stopPropagation(); toggleFavorite(app.id); });
    tile.append(button,pin);
    return tile;
  }
  function renderRunningApps() {
    const host = $("running-apps"), count = $("running-app-count"), closeAll = $("close-all-apps");
    if (!host || !count) return;
    const running = [...windowsByApp].filter(([,win]) => win.isConnected && !win.classList.contains("is-closing"));
    count.textContent = running.length + (running.length === 1 ? " app open" : " apps open");
    if (closeAll) closeAll.hidden = running.length === 0;
    if (!running.length) {
      host.replaceChildren(Object.assign(document.createElement("p"), { className:"muted", textContent:"No apps are running." }));
      return;
    }
    const nodes = running.map(([id,win]) => {
      const app = allApps().find(item => item.id === id);
      const row = document.createElement("div");
      row.className = "running-app-row";
      const focus = document.createElement("button");
      focus.type = "button";
      focus.className = "running-app";
      focus.setAttribute("aria-current", String(win === activeWindow));
      const label = document.createElement("span");
      label.className = "running-app-name";
      label.textContent = (app?.icon || "◈") + "  " + (app?.name || win.querySelector(".window-title-text")?.textContent || id);
      const state = document.createElement("small");
      state.textContent = win === activeWindow ? "Open" : win.classList.contains("is-minimized") ? "Paused" : "Running";
      focus.append(label,state);
      focus.addEventListener("click", () => { activateWindow(win); hideOverlay("quick-panel"); });
      const close = document.createElement("button");
      close.type = "button";
      close.className = "running-app-close";
      close.textContent = "×";
      close.setAttribute("aria-label","Close "+(app?.name || id));
      close.addEventListener("click", () => {
        win.querySelector(".win-btn.close")?.click();
        queueMicrotask(reconcileWindows);
      });
      row.append(focus,close);
      return row;
    });
    host.replaceChildren(...nodes);
  }
  function closeAllApps() {
    const snapshot = [...windowsByApp.values()].filter(win => win.isConnected && !win.classList.contains("is-closing"));
    snapshot.forEach(win => win.querySelector(".win-btn.close")?.click());
    queueMicrotask(reconcileWindows);
    return snapshot.length;
  }

  function renderApps(query) {
    const q = (query || "").trim().toLocaleLowerCase();
    const apps = allApps();
    const matches = apps.filter(app => (app.name + " " + (app.description || "") + " " + app.id).toLocaleLowerCase().includes(q));
    const favorites = apps.filter(app => favoriteIds.includes(app.id));
    $("favourites").replaceChildren(...(favorites.length ? favorites.map((app,index) => buttonFor(app,index,true)) : [
      Object.assign(document.createElement("div"), { className:"empty favorites-empty", textContent:"Pin apps from All apps to build your favourites." })
    ]));
    $("dock").replaceChildren(...["files","notes","settings","paint"].map((id, index) => {
      const app = apps.find(item => item.id === id);
      return app ? buttonFor(app, index, false) : document.createDocumentFragment();
    }));
    $("all-app-grid").replaceChildren(...(matches.length ? matches.map((app,index) => buttonFor(app,index,true)) : [
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
  $("close-all-apps")?.addEventListener("click", () => { const count = closeAllApps(); toast(count ? "Closed "+count+" app"+(count===1?"":"s") : "No apps to close."); });
  $("app-back").addEventListener("click", closeTopApp);
  $("app-home").addEventListener("click", goHome);
  $("home-search").addEventListener("input", event => { $("drawer-search").value = event.target.value; renderApps(event.target.value); if (event.target.value) showOverlay("drawer"); });
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
      const batteryButton = $("battery-indicator");
      const batteryPercent = $("battery-percent");
      if (batteryButton && batteryPercent) {
        if (data.battery) {
          const level = data.battery.level;
          batteryPercent.textContent = level + "%";
          batteryButton.classList.toggle("charging", data.battery.charging);
          batteryButton.classList.toggle("low", level <= 20 && !data.battery.charging);
          batteryButton.textContent = (data.battery.charging ? "ϟ " : "▰ ") + level + "%";
          batteryButton.setAttribute("aria-label","Battery " + level + "%, " + (data.battery.charging ? "charging" : "not charging"));
          batteryButton.title = "Battery " + level + "%" + (data.battery.charging ? " · Charging" : "");
        } else {
          batteryPercent.textContent = "—";
          batteryButton.textContent = "▰ —";
          batteryButton.classList.remove("charging","low");
          batteryButton.setAttribute("aria-label","Battery status unavailable in this browser");
          batteryButton.title = "Battery information is not exposed by this browser";
        }
      }
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
  $("battery-indicator")?.addEventListener("click",() => { showOverlay("quick-panel"); refreshSystemStatus(); });
  window.WebOSPlatform?.on?.("batterychanged", () => refreshSystemStatus());
  $("share-webos")?.addEventListener("click",async () => {
    const shareData = { title:"WebOS", text:"Explore WebOS — a community-built browser desktop.", url:window.location.origin };
    try {
      if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
        toast("WebOS share sheet opened.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareData.url);
        toast("WebOS link copied.");
      } else {
        toast("Sharing is not available in this browser.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.warn("[WebOS Mobile] Share failed:",error);
        toast("Could not share WebOS from this browser.");
      }
    }
  });
  $("refresh-system-status")?.addEventListener("click",refreshSystemStatus);
  $("quick-open")?.addEventListener("click",refreshSystemStatus);
  window.WebOSPlatform?.on?.("viewportchange",() => {
    if ($("quick-panel")?.classList.contains("open")) refreshSystemStatus();
  });
  window.WebOSPlatform?.on?.("networkchange",() => {
    if ($("quick-panel")?.classList.contains("open")) refreshSystemStatus();
  });

  const updateBanner = $("update-banner");
  const showUpdateBanner = version => {
    if (!updateBanner) return;
    $("update-banner-detail").textContent = version ? "Version "+version+" is ready. Reload to apply it." : "A new version is ready. Reload to apply it.";
    updateBanner.hidden = false;
  };
  $("update-reload")?.addEventListener("click",() => window.location.reload());
  $("update-dismiss")?.addEventListener("click",() => { if (updateBanner) updateBanner.hidden = true; });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message",event => {
      if (event.data?.type === "WEBOS_UPDATE_AVAILABLE") showUpdateBanner(event.data.data?.version);
      if (event.data?.type === "CACHE_ERROR" && event.data.data?.url) {
        console.warn("[WebOS PWA] Asset was not cached:",event.data.data.url,event.data.data.error);
      }
    });
  }

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
    const indicator = $("network-indicator");
    if (indicator) {
      indicator.textContent = event.online ? "● Online" : "● Offline";
      indicator.classList.toggle("offline",!event.online);
      indicator.setAttribute("aria-label","Network status: "+(event.online?"online":"offline")+". Open device status.");
    }
    toast(event.online ? "Connection restored." : "You are offline. Cached WebOS features remain available.");
    if ($("quick-panel")?.classList.contains("open")) refreshSystemStatus();
  });

  renderApps("");
  updateTime();
  refreshSystemStatus();
  const clockTimer = setInterval(updateTime, 30000);
  window.addEventListener("pagehide", () => clearInterval(clockTimer), { once:true });
  window.WebOSMobile = Object.freeze({
    openApp, closeTopApp, goHome, activateWindow, renderApps,
    apps:allApps,
    favorites:() => [...favoriteIds],
    toggleFavorite,
    runningApps:() => [...windowsByApp].filter(([,win]) => win.isConnected && !win.classList.contains("is-closing")).map(([id,win]) => ({ id, active:win === activeWindow, minimized:win.classList.contains("is-minimized") })),
    closeAllApps
  });
})();
