/**
 * WebOS browser bootstrap.
 * Vercel Analytics and Speed Insights are loaded by the document's script tags.
 */
(() => {
  async function registerKernel() {
    if (!("serviceWorker" in navigator)) {
      console.warn("WebOS: Service Workers are unavailable in this browser.");
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none"
      });
      await registration.update();
      console.log("WebOS Kernel registered. Scope:", registration.scope);
    } catch (error) {
      console.error("WebOS Service Worker registration failed:", error);
    }
  }

  if (document.readyState === "complete") registerKernel();
  else window.addEventListener("load", registerKernel, { once: true });
})();
