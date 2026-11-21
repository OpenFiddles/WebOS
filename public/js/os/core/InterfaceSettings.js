/* WebOS Interface Mode settings integration. */
(function () {
  "use strict";
  const original = window.openSettings;
  if (typeof original !== "function" || original.__interfaceModeWrapped) return;
  function openSettingsWithInterfaceMode() {
    const win = original.apply(this, arguments);
    if (!win || !window.WebOSInterfaceMode) return win;
    const accessibility = Array.from(win.querySelectorAll(".settings-section"))
      .find(section => section.querySelector("h2")?.textContent.trim() === "Accessibility");
    if (!accessibility || accessibility.querySelector("#webos-interface-mode")) return win;
    const section = document.createElement("div");
    section.className = "settings-subsection";
    section.style.cssText = "display:flex;flex-direction:column;gap:.65rem;padding-top:1rem;border-top:1px solid rgba(128,128,128,.2)";
    section.innerHTML = '<h3>Interface mode</h3><p>Choose which WebOS layout opens on this device. Automatic uses the mobile interface on phones and the desktop interface on tablets and computers.</p><label for="webos-interface-mode">Preferred interface</label><select id="webos-interface-mode"><option value="auto">Automatic</option><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select><div style="display:flex;gap:.5rem;flex-wrap:wrap"><button type="button" id="webos-interface-save">Save preference</button><button type="button" id="webos-interface-restart">Save &amp; restart WebOS</button></div><p id="webos-interface-status" role="status" aria-live="polite"></p>';
    accessibility.appendChild(section);
    const select = section.querySelector("#webos-interface-mode");
    const status = section.querySelector("#webos-interface-status");
    const current = window.WebOSInterfaceMode.getPreference();
    select.value = ["auto", "desktop", "mobile"].includes(current) ? current : "auto";
    const save = () => {
      try {
        const state = window.WebOSInterfaceMode.setPreference(select.value);
        status.textContent = "Saved: " + select.options[select.selectedIndex].text + ". Current session remains in its existing shell until WebOS restarts.";
        return state;
      } catch (error) {
        status.textContent = "Could not save preference: " + (error.message || error);
        return null;
      }
    };
    section.querySelector("#webos-interface-save").addEventListener("click", save);
    section.querySelector("#webos-interface-restart").addEventListener("click", () => {
      if (!save()) return;
      status.textContent = "Restarting WebOS with the saved interface preference…";
      window.location.href = "BootScreen_popcorn.html";
    });
    const state = window.WebOSInterfaceMode.resolve();
    status.textContent = "Detected: " + state.formFactor + " · Active layout: " + state.layout + ".";
    return win;
  }
  openSettingsWithInterfaceMode.__interfaceModeWrapped = true;
  window.openSettings = openSettingsWithInterfaceMode;
})();
