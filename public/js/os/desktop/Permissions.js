/* WebOS cooperative permission broker. Not a JavaScript sandbox. */
(() => {
  const catalog = {
    "filesystem.read": ["Read WebOS files", "Read files and folders in the WebOS virtual filesystem."],
    "filesystem.write": ["Create and edit WebOS files", "Create folders and write text files in WebOS storage."],
    "filesystem.delete": ["Delete WebOS files", "Remove files or folders from WebOS storage."],
    "notifications": ["Show WebOS notifications", "Display notifications in the WebOS desktop."],
    "geolocation": ["Access device location", "Request device location through the host browser."],
    "clipboard.read": ["Read clipboard text", "Read text from the system clipboard when permitted."],
    "clipboard.write": ["Write clipboard text", "Copy text to the system clipboard when permitted."]
  };
  const decisions = new Map();
  const key = (app, permission) => String(app) + ":" + permission;
  function query(app, permission) {
    if (!catalog[permission]) return "unavailable";
    return decisions.get(key(app, permission)) || "prompt";
  }
  function request(app, permission, reason) {
    if (!catalog[permission]) return Promise.reject(new Error("Unknown WebOS permission: " + permission));
    const id = key(app, permission), state = decisions.get(id);
    if (state === "granted") return Promise.resolve(true);
    if (state === "denied") return Promise.reject(new Error("Permission denied: " + permission));
    return new Promise((resolve, reject) => {
      const overlay = document.createElement("div");
      overlay.className = "webos-permission-overlay";
      const dialog = document.createElement("section");
      dialog.className = "webos-permission-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      const appName = document.createElement("div");
      appName.className = "webos-permission-app";
      appName.textContent = "Permission request · " + String(app);
      const title = document.createElement("h2");
      title.textContent = catalog[permission][0];
      const message = document.createElement("p");
      message.textContent = String(reason || catalog[permission][1]);
      const detail = document.createElement("p");
      detail.textContent = catalog[permission][1];
      const actions = document.createElement("div");
      actions.className = "webos-permission-actions";
      const deny = document.createElement("button");
      deny.type = "button"; deny.textContent = "Deny";
      const allow = document.createElement("button");
      allow.type = "button"; allow.dataset.allow = "true"; allow.textContent = "Allow";
      actions.append(deny, allow);
      dialog.append(appName, title, message, detail, actions);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      let settled = false;
      const finish = allowed => {
        if (settled) return;
        settled = true;
        decisions.set(id, allowed ? "granted" : "denied");
        overlay.remove();
        if (allowed) resolve(true);
        else reject(new Error("Permission denied: " + permission));
      };
      deny.addEventListener("click", () => finish(false));
      allow.addEventListener("click", () => finish(true));
      overlay.addEventListener("keydown", event => { if (event.key === "Escape") finish(false); });
      allow.focus();
    });
  }
  function revoke(app, permission) { decisions.delete(key(app, permission)); return true; }
  function list(app) {
    return Object.keys(catalog).map(permission => ({ permission, label: catalog[permission][0], state: query(app, permission) }));
  }
  window.WebOSPermissions = Object.freeze({ request, query, revoke, list, available: Object.freeze(Object.keys(catalog)) });
})();