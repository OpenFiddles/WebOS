/* WebOS Interface Mode — shared automatic desktop/mobile/hybrid selector. */
(() => {
  "use strict";
  if (window.WebOSInterfaceMode) return;

  const STORAGE_KEY = "webos.interface-mode.v1";
  const VALID = new Set(["auto", "desktop", "mobile"]);
  const media = {
    coarse: window.matchMedia("(pointer: coarse)"),
    hover: window.matchMedia("(hover: hover)")
  };
  const listeners = new Set();

  function getViewport() {
    const width = Math.round(window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 0);
    const height = Math.round(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0);
    return Object.freeze({ width, height, orientation: width >= height ? "landscape" : "portrait" });
  }

  function getCapabilities() {
    return Object.freeze({
      touch: Number(navigator.maxTouchPoints || 0) > 0 || media.coarse.matches,
      hover: media.hover.matches,
      pointer: media.coarse.matches ? "coarse" : "fine",
      keyboardLikely: media.hover.matches && !media.coarse.matches,
      maxTouchPoints: Number(navigator.maxTouchPoints || 0)
    });
  }

  function detectFormFactor() {
    const { width } = getViewport();
    const { touch } = getCapabilities();
    if (touch && width <= 600) return "phone";
    if (touch && width <= 1100) return "tablet";
    return "desktop";
  }

  function getPreference() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return VALID.has(value) ? value : "auto";
    } catch (_) {
      return "auto";
    }
  }

  function resolve() {
    const preference = getPreference();
    const formFactor = detectFormFactor();
    const mode = preference === "auto" ? (formFactor === "phone" ? "mobile" : "desktop") : preference;
    return Object.freeze({
      preference,
      mode,
      formFactor,
      layout: formFactor === "tablet" && preference === "auto" ? "hybrid" : mode,
      viewport: getViewport(),
      input: getCapabilities()
    });
  }

  function apply(reason = "manual") {
    const state = resolve();
    const root = document.documentElement;
    root.dataset.webosMode = state.layout;
    root.dataset.webosFormFactor = state.formFactor;
    if (document.body) {
      document.body.dataset.webosMode = state.layout;
      document.body.dataset.webosFormFactor = state.formFactor;
    }
    const detail = Object.freeze({ ...state, reason });
    window.dispatchEvent(new CustomEvent("webos:interfacechange", { detail }));
    listeners.forEach(listener => {
      try { listener(detail); } catch (error) { console.warn("[WebOS InterfaceMode] Listener failed:", error); }
    });
    return detail;
  }

  function setPreference(value) {
    if (!VALID.has(value)) throw new TypeError("Interface mode must be auto, desktop, or mobile.");
    try { localStorage.setItem(STORAGE_KEY, value); }
    catch (error) { console.warn("[WebOS InterfaceMode] Could not save preference:", error); }
    return apply("preference");
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Interface mode listener must be a function.");
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  let resizeFrame = 0;
  function scheduleApply() {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      apply("viewport-or-input-change");
    });
  }
  window.addEventListener("resize", scheduleApply, { passive: true });
  window.addEventListener("orientationchange", scheduleApply, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleApply, { passive: true });
  Object.values(media).forEach(query => query.addEventListener?.("change", scheduleApply));

  window.WebOSInterfaceMode = Object.freeze({
    version: "1.0.0",
    getPreference,
    resolve,
    apply,
    setPreference,
    subscribe,
    get formFactor() { return detectFormFactor(); },
    get mode() { return resolve().mode; }
  });

  apply("startup");
})();