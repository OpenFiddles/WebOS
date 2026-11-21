/* WebOS Platform Runtime 1.0 — browser/PWA device adaptation layer. */
(() => {
  "use strict";
  if (window.WebOSPlatform) return;

  const root = document.documentElement;
  const body = document.body;
  const events = new EventTarget();
  const media = {
    coarse: window.matchMedia("(pointer: coarse)"),
    hover: window.matchMedia("(hover: hover)"),
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)"),
    standalone: window.matchMedia("(display-mode: standalone)")
  };
  let deferredInstallPrompt = null;
  let previousFormFactor = "";
  let disposed = false;

  const rounded = value => Number.isFinite(value) ? Math.round(value) : 0;
  function getViewport() {
    const vv = window.visualViewport;
    return Object.freeze({
      width: rounded(vv?.width || window.innerWidth),
      height: rounded(vv?.height || window.innerHeight),
      scale: Number(vv?.scale || 1),
      offsetTop: rounded(vv?.offsetTop || 0),
      offsetLeft: rounded(vv?.offsetLeft || 0),
      orientation: window.screen?.orientation?.type || (innerWidth >= innerHeight ? "landscape" : "portrait"),
      pixelRatio: Math.min(3, Number(window.devicePixelRatio || 1))
    });
  }
  function getFormFactor() {
    const width = Math.min(window.innerWidth || 0, window.screen?.width || window.innerWidth || 0);
    const touch = navigator.maxTouchPoints > 0 || media.coarse.matches;
    if (width <= 600 && touch) return "phone";
    if (width <= 1100 && touch) return "tablet";
    return "desktop";
  }
  function getInstallState() {
    const installed = media.standalone.matches || navigator.standalone === true;
    return Object.freeze({ installed, mode: installed ? "standalone" : "browser", canPrompt: !!deferredInstallPrompt });
  }
  function emit(type, detail = {}) {
    const payload = Object.freeze({ type, at: Date.now(), ...detail });
    events.dispatchEvent(new CustomEvent(type, { detail: payload }));
    window.dispatchEvent(new CustomEvent("webos:platform:" + type, { detail: payload }));
  }
  function syncEnvironment(reason = "resize") {
    const formFactor = getFormFactor();
    const viewport = getViewport();
    root.dataset.webosFormFactor = formFactor;
    root.dataset.webosOrientation = viewport.orientation.startsWith("landscape") ? "landscape" : "portrait";
    if (body) {
      body.dataset.webosFormFactor = formFactor;
      body.dataset.webosOrientation = root.dataset.webosOrientation;
    }
    if (formFactor !== previousFormFactor) {
      emit("formfactorchange", { previous: previousFormFactor, formFactor });
      previousFormFactor = formFactor;
    }
    emit("viewportchange", { viewport, reason });
  }
  const onResize = () => syncEnvironment("resize");
  const onOrientation = () => syncEnvironment("orientation");
  const onVisibility = () => emit("visibilitychange", { state: document.visibilityState, visible: !document.hidden });
  const onOnline = () => emit("networkchange", { online: true });
  const onOffline = () => emit("networkchange", { online: false });
  const onInstallPrompt = event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    emit("installavailable", { install: getInstallState() });
  };
  const onInstalled = () => {
    deferredInstallPrompt = null;
    emit("installed", { install: getInstallState() });
  };

  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("orientationchange", onOrientation, { passive: true });
  window.visualViewport?.addEventListener("resize", onResize, { passive: true });
  window.visualViewport?.addEventListener("scroll", onResize, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener("beforeinstallprompt", onInstallPrompt);
  window.addEventListener("appinstalled", onInstalled);
  Object.values(media).forEach(query => query.addEventListener?.("change", onResize));

  const viewport = Object.freeze({
    get: getViewport,
    getFormFactor,
    getSafeAreaInsets() {
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
      body?.appendChild(probe);
      const style = window.getComputedStyle(probe);
      const insets = { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0, bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
      probe.remove();
      return Object.freeze(insets);
    }
  });
  const input = Object.freeze({
    get touch() { return media.coarse.matches || navigator.maxTouchPoints > 0; },
    get hover() { return media.hover.matches; },
    get reducedMotion() { return media.reducedMotion.matches; },
    get pointer() { return media.coarse.matches ? "coarse" : "fine"; },
    get maxTouchPoints() { return Number(navigator.maxTouchPoints || 0); }
  });
  const lifecycle = Object.freeze({
    get visible() { return !document.hidden; },
    get state() { return document.visibilityState; },
    onChange(callback) {
      if (typeof callback !== "function") throw new TypeError("Lifecycle callback must be a function.");
      const handler = event => callback(event.detail);
      events.addEventListener("visibilitychange", handler);
      return () => events.removeEventListener("visibilitychange", handler);
    }
  });
  const network = Object.freeze({
    get online() { return navigator.onLine; },
    onChange(callback) {
      if (typeof callback !== "function") throw new TypeError("Network callback must be a function.");
      const handler = event => callback(event.detail);
      events.addEventListener("networkchange", handler);
      return () => events.removeEventListener("networkchange", handler);
    }
  });
  const install = Object.freeze({
    getState: getInstallState,
    async prompt() {
      if (!deferredInstallPrompt) return { outcome: "unavailable" };
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      emit("installchoice", { outcome: choice?.outcome || "unknown" });
      return { outcome: choice?.outcome || "unknown" };
    }
  });
  const device = Object.freeze({
    getConnection() {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      return Object.freeze({
        online: navigator.onLine,
        type: connection?.type || "unknown",
        effectiveType: connection?.effectiveType || "unknown",
        downlink: Number.isFinite(connection?.downlink) ? connection.downlink : null,
        rtt: Number.isFinite(connection?.rtt) ? connection.rtt : null,
        saveData: !!connection?.saveData
      });
    },
    async getBattery() {
      if (typeof navigator.getBattery !== "function") return null;
      try {
        const battery = await navigator.getBattery();
        return Object.freeze({
          level: Math.round(battery.level * 100),
          charging: !!battery.charging,
          chargingTime: Number.isFinite(battery.chargingTime) ? battery.chargingTime : null,
          dischargingTime: Number.isFinite(battery.dischargingTime) ? battery.dischargingTime : null
        });
      } catch (_) { return null; }
    },
    async getStorage() {
      if (!navigator.storage?.estimate) return null;
      try {
        const estimate = await navigator.storage.estimate();
        const usage = Number(estimate.usage || 0), quota = Number(estimate.quota || 0);
        return Object.freeze({ usage, quota, percent: quota > 0 ? Math.min(100, Math.round(usage / quota * 100)) : null });
      } catch (_) { return null; }
    },
    async getSnapshot() {
      const [battery, storage] = await Promise.all([this.getBattery(), this.getStorage()]);
      const connection = this.getConnection();
      const screen = getViewport();
      return Object.freeze({
        connection, battery, storage, screen,
        formFactor: getFormFactor(),
        install: getInstallState(),
        timestamp: Date.now()
      });
    }
  });
  const capabilities = Object.freeze({
    serviceWorker: "serviceWorker" in navigator,
    push: "PushManager" in window,
    notifications: "Notification" in window,
    share: typeof navigator.share === "function",
    fileHandling: typeof window.launchQueue?.setConsumer === "function",
    fileSystemAccess: typeof window.showOpenFilePicker === "function",
    opfs: typeof navigator.storage?.getDirectory === "function",
    webShareTarget: typeof navigator.canShare === "function"
  });
  const api = Object.freeze({
    version: "1.0.0",
    runtime: "pwa",
    get formFactor() { return getFormFactor(); },
    get installState() { return getInstallState(); },
    viewport, input, lifecycle, network, install, device, capabilities,
    on(type, callback) {
      if (typeof callback !== "function") throw new TypeError("Event callback must be a function.");
      events.addEventListener(type, callback);
      return () => events.removeEventListener(type, callback);
    },
    emit,
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientation);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      Object.values(media).forEach(query => query.removeEventListener?.("change", onResize));
    }
  });

  window.WebOSPlatform = api;
  window.WebOS = window.WebOS || {};
  window.WebOS.platform = api;
  syncEnvironment("startup");
  window.dispatchEvent(new CustomEvent("webos:platform-ready", { detail: { version: api.version, formFactor: api.formFactor } }));
})();
