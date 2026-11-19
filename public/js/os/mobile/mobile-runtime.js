(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const favourites = ["files", "notes", "settings"];
  const apps = [
    { id:"files", name:"Files", icon:"📁", description:"Browse your WebOS files and folders.", handler:"openFiles" },
    { id:"notes", name:"Notes", icon:"📝", description:"Notes and Markdown Studio.", handler:"openNotes" },
    { id:"settings", name:"Settings", icon:"⚙️", description:"Configure your WebOS environment.", handler:"openSettings" },
    { id:"calculator", name:"Calculator", icon:"🧮", description:"WebOS calculator.", handler:"openCalculator" },
    { id:"calendar", name:"Calendar", icon:"📅", description:"Your calendar and events.", handler:"openCalendar" },
    { id:"monitor", name:"System Monitor", icon:"📊", description:"Inspect the current WebOS session.", handler:"openSystemMonitor" },
    { id:"wasm", name:"WASM Lab", icon:"🧩", description:"Explore WebAssembly modules.", handler:"openWasmLab" },
    { id:"appcreator", name:"App Creator", icon:"🛠️", description:"Create and install WebOS apps.", handler:"openAppCreator" },
    { id:"animation", name:"Animation Studio", icon:"🎞️", description:"Design and preview motion.", handler:"openAnimationStudio" },
    { id:"docs", name:"Documentation", icon:"📚", description:"WebOS guides and documentation.", handler:"openDocumentation" },
    { id:"about", name:"About WebOS", icon:"ⓘ", description:"About this WebOS build.", handler:"openAbout" },
    { id:"emulator", name:"FlairOS", icon:"🖥️", description:"Open the FlairOS hosted emulator.", handler:"openEmulator" }
  ];
  const dynamicApps = () => {
    try {
      return (window.WebOSAppRegistry?.all?.() || [])
        .filter((item) => item && item.id && !apps.some((app) => app.id === item.id))
        .map((item) => Object.assign({}, item, { description:item.description || "Installed WebOS application.", dynamic:true }));
    } catch (_) { return []; }
  };
  const allApps = () => apps.concat(dynamicApps());

  function buttonFor(app, index) {
    const button = document.createElement("button");
    button.className = "app";
    button.type = "button";
    button.style.setProperty("--app-index", String(index));
    button.setAttribute("aria-label", "Open " + app.name);
    const icon = document.createElement("span");
    icon.className = "app-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = app.icon || "◈";
    const name = document.createElement("span");
    name.textContent = app.name;
    button.append(icon, name);
    button.addEventListener("click", () => openApp(app.id));
    return button;
  }

  function renderApps(query) {
    const normalized = (query || "").trim().toLocaleLowerCase();
    const matches = allApps().filter((app) =>
      (app.name + " " + (app.description || "") + " " + app.id).toLocaleLowerCase().includes(normalized)
    );
    $("favourites").replaceChildren(...matches.filter((app) => favourites.includes(app.id)).map(buttonFor));
    $("dock").replaceChildren(...favourites.map((id, index) => {
      const app = allApps().find((item) => item.id === id);
      return app ? buttonFor(app, index) : document.createDocumentFragment();
    }));
    $("all-app-grid").replaceChildren(...(matches.length
      ? matches.map(buttonFor)
      : [Object.assign(document.createElement("div"), { className:"empty", textContent:"No apps found" })]));
  }

  function updateTime() {
    const now = new Date();
    $("clock").textContent = new Intl.DateTimeFormat(undefined, { hour:"numeric", minute:"2-digit" }).format(now);
    $("date").textContent = new Intl.DateTimeFormat(undefined, { weekday:"short", month:"short", day:"numeric" }).format(now);
    const hour = now.getHours();
    $("greeting").textContent = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";
  }

  function showOverlay(id) {
    const panel = $(id);
    if (!panel) return;
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
  }
  function hideOverlay(id) {
    const panel = $(id);
    if (!panel) return;
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
  }
  function toast(message) {
    const node = $("toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 2100);
  }
  function findNewWindow(before, result) {
    if (result instanceof HTMLElement && result.matches(".window-shell")) return result;
    return [...document.querySelectorAll("#window-workspace .window-shell")].find((item) => !before.has(item)) || null;
  }
  function openApp(id) {
    hideOverlay("drawer");
    hideOverlay("quick-panel");
    const app = allApps().find((item) => item.id === id);
    if (!app) return;
    const before = new Set(document.querySelectorAll("#window-workspace .window-shell"));
    let result;
    try {
      if (app.dynamic) result = window.WebOSAppRegistry?.launch?.(app.id);
      else {
        const handler = window[app.handler];
        if (typeof handler !== "function") throw new Error(app.name + " is not available in this build.");
        result = handler();
      }
    } catch (error) {
      console.error("[WebOS Mobile] Failed to open " + app.name + ":", error);
      toast(app.name + " could not open: " + (error.message || "unknown error"));
      return;
    }
    const win = findNewWindow(before, result);
    if (!win) { toast(app.name + " did not create a window."); return; }
    win.classList.add("mobile-app-window");
    win.dataset.mobileAppId = app.id;
    document.body.dataset.appOpen = "true";
    win.addEventListener("webos:window-close", () => { delete document.body.dataset.appOpen; }, { once:true });
  }
  function closeTopApp() {
    const win = document.querySelector("#window-workspace .window-shell:not(.is-closing)");
    if (!win) return false;
    win.querySelector(".win-btn.close")?.click();
    return true;
  }

  $("all-apps").addEventListener("click", () => {
    renderApps($("drawer-search").value);
    showOverlay("drawer");
    $("drawer-search").focus();
  });
  $("gesture").addEventListener("click", () => showOverlay("drawer"));
  $("quick-open").addEventListener("click", () => showOverlay("quick-panel"));
  $("home-search").addEventListener("input", (event) => {
    renderApps(event.target.value);
    if (event.target.value) showOverlay("drawer");
  });
  $("drawer-search").addEventListener("input", (event) => renderApps(event.target.value));
  document.querySelectorAll("[data-close]").forEach((button) =>
    button.addEventListener("click", () => hideOverlay(button.dataset.close))
  );
  document.querySelectorAll("[data-toggle]").forEach((button) => button.addEventListener("click", () => {
    button.classList.toggle("active");
    button.querySelector("small").textContent = button.classList.contains("active") ? "On" : "Off";
  }));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (closeTopApp()) { event.preventDefault(); return; }
    hideOverlay("drawer");
    hideOverlay("quick-panel");
  });

  let touchStart = null;
  document.addEventListener("touchstart", (event) => {
    if (event.changedTouches.length) touchStart = { x:event.changedTouches[0].clientX, y:event.changedTouches[0].clientY };
  }, { passive:true });
  document.addEventListener("touchend", (event) => {
    if (!touchStart || !event.changedTouches.length) return;
    const touch = event.changedTouches[0];
    const dy = touch.clientY - touchStart.y;
    const dx = touch.clientX - touchStart.x;
    if (Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx)) {
      if (dy < 0 && touchStart.y > window.innerHeight - 110) showOverlay("drawer");
      if (dy > 0 && document.querySelector("#window-workspace .window-shell")) closeTopApp();
    }
    touchStart = null;
  }, { passive:true });

  renderApps("");
  updateTime();
  setInterval(updateTime, 30000);
  window.WebOSMobile = Object.freeze({ openApp, closeTopApp, renderApps, apps:allApps });
})();