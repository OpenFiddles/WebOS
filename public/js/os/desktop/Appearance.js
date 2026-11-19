(() => {
  const root=document.documentElement, body=document.body;
  const get=(key,fallback)=>{try{return localStorage.getItem(key)||fallback}catch(_){return fallback}};
  function apply(){
    const theme=get("webos-theme","ocean");
    const accent=get("webos-accent","#53b5ff");
    const wallpaper=get("webos-wallpaper","aurora");
    const custom=get("webos-custom-wallpaper","");
    const motion=get("webos-motion-style","smooth");
    const reduced=get("webos-reduced-motion","false")==="true";
    const liquid=get("webos-liquid-glass","false")==="true";
    const desktopStyle=get("webos-desktop-style","webos");
    const windowStyle=get("webos-window-style","auto");
    const ambient=get("webos-ambient-animation","aurora");
    body.dataset.theme=theme;
    body.dataset.wallpaper=custom?"custom":wallpaper;
    body.dataset.motion=motion;
    body.dataset.reducedMotion=String(reduced);
    body.dataset.liquidGlass=String(liquid);
    body.dataset.desktopStyle=desktopStyle;
    body.dataset.windowStyle=windowStyle;
    body.dataset.ambient=ambient;
    root.style.setProperty("--accent",accent);
    body.style.setProperty("--accent",accent);
    const desktop=document.getElementById("Desktop");
    const imageTarget=desktop||body;
    if(custom){
      const safe=custom.replace(/["\\\n\r]/g,"");
      imageTarget.style.backgroundImage='linear-gradient(135deg,rgba(4,10,20,.30),rgba(4,10,20,.55)),url("'+safe+'")';
      imageTarget.style.backgroundSize="cover";
      imageTarget.style.backgroundPosition="center";
      imageTarget.style.backgroundRepeat="no-repeat";
    }else{
      imageTarget.style.removeProperty("background-image");
      imageTarget.style.removeProperty("background-size");
      imageTarget.style.removeProperty("background-position");
      imageTarget.style.removeProperty("background-repeat");
    }
  }
  window.WebOSAppearance=Object.freeze({apply});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",apply,{once:true});else apply();
  window.addEventListener("storage",event=>{if(event.key&&event.key.startsWith("webos-"))apply();});
})();

/* Local session lock. This is a casual privacy screen, not disk encryption or
   protection against someone with developer-tools/device access. */
(() => {
  const KEY = "webos-lock-config";
  const encoder = new TextEncoder();
  const readConfig = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) { return null; } };
  const bytesToHex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
  async function derive(secret, salt) {
    if (!crypto.subtle) throw new Error("Secure cryptography is unavailable in this browser.");
    const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, ["deriveBits"]);
    return bytesToHex(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: Uint8Array.from(salt.match(/../g), x => parseInt(x, 16)), iterations: 150000, hash: "SHA-256" }, material, 256));
  }
  async function configure(mode, secret) {
    if (!["pin", "pattern", "swipe"].includes(mode)) throw new Error("Choose PIN, pattern, or swipe.");
    if (mode === "swipe") { localStorage.setItem(KEY, JSON.stringify({ mode })); return true; }
    if (typeof secret !== "string" || secret.length < (mode === "pin" ? 4 : 7)) throw new Error(mode === "pin" ? "PIN must contain at least 4 characters." : "Pattern must connect at least 4 different dots.");
    if (mode === "pin" && secret.length > 64) throw new Error("PIN is too long.");
    const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    const verifier = await derive(secret, salt);
    localStorage.setItem(KEY, JSON.stringify({ mode, salt, verifier }));
    return true;
  }
  async function verify(secret) {
    const config = readConfig();
    if (!config) return false;
    if (config.mode === "swipe") return true;
    if (!secret || !config.salt || !config.verifier) return false;
    try { return (await derive(secret, config.salt)) === config.verifier; } catch (_) { return false; }
  }
  let overlay = null, pattern = [], pointerStart = null;
  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("section");
    overlay.id = "webos-lock-screen";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "WebOS session locked");
    overlay.innerHTML = `
      <div class="webos-lock-card">
        <div class="webos-lock-clock" id="webos-lock-clock"></div><div class="webos-lock-date" id="webos-lock-date"></div>
        <div class="webos-lock-message">Session locked</div>
        <form id="webos-lock-pin-form" hidden><label for="webos-lock-pin">Enter your PIN</label><input id="webos-lock-pin" type="password" autocomplete="current-password" inputmode="numeric" maxlength="64"><button type="submit">Unlock</button></form>
        <div id="webos-lock-pattern-wrap" hidden><p>Draw your pattern</p><div class="webos-lock-pattern" id="webos-lock-pattern">${Array.from({length:9},(_,i)=>'<button type="button" data-dot="'+(i+1)+'" aria-label="Pattern dot '+(i+1)+'"></button>').join("")}</div><button type="button" id="webos-lock-pattern-submit">Unlock</button></div>
        <div id="webos-lock-swipe" hidden tabindex="0"><span>Swipe right to unlock</span><div class="webos-lock-swipe-track"><span>⟶</span></div></div>
        <p class="webos-lock-error" id="webos-lock-error" role="status" aria-live="polite"></p><small>WebOS local session lock · This does not encrypt stored files.</small>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#webos-lock-pin-form").addEventListener("submit", async e => { e.preventDefault(); const value=overlay.querySelector("#webos-lock-pin").value; if(await verify(value)) unlock(); else fail(); });
    const grid = overlay.querySelector("#webos-lock-pattern");
    grid.addEventListener("click", e => { const dot=e.target.closest("[data-dot]"); if(!dot)return; const n=dot.dataset.dot; if(!pattern.includes(n)){pattern.push(n);dot.classList.add("selected");} });
    overlay.querySelector("#webos-lock-pattern-submit").addEventListener("click", async () => { if(await verify(pattern.join("-"))) unlock(); else fail(); });
    const swipe = overlay.querySelector("#webos-lock-swipe");
    swipe.addEventListener("pointerdown",e=>{pointerStart={x:e.clientX,y:e.clientY};swipe.setPointerCapture?.(e.pointerId);});
    swipe.addEventListener("pointerup",e=>{if(!pointerStart)return;const dx=e.clientX-pointerStart.x,dy=Math.abs(e.clientY-pointerStart.y);pointerStart=null;if(dx>90&&dx>dy*1.4)unlock();});
    return overlay;
  }
  function fail() { const el=overlay?.querySelector("#webos-lock-error"); if(el)el.textContent="That didn't match. Try again."; pattern=[]; overlay?.querySelectorAll("[data-dot]").forEach(x=>x.classList.remove("selected")); const pin=overlay?.querySelector("#webos-lock-pin");if(pin){pin.value="";pin.focus();} }
  function unlock() { if(!overlay)return; overlay.classList.add("is-unlocking"); setTimeout(()=>{overlay?.remove();overlay=null;document.body.classList.remove("webos-session-locked");},260); }
  function lock() {
    const config=readConfig();
    if(!config){window.dispatchEvent(new CustomEvent("webos:lock-unconfigured"));return false;}
    const el=ensureOverlay();pattern=[];el.querySelectorAll("[data-dot]").forEach(x=>x.classList.remove("selected"));
    el.querySelector("#webos-lock-pin-form").hidden=config.mode!=="pin";
    el.querySelector("#webos-lock-pattern-wrap").hidden=config.mode!=="pattern";
    el.querySelector("#webos-lock-swipe").hidden=config.mode!=="swipe";
    el.querySelector("#webos-lock-error").textContent="";
    document.body.classList.add("webos-session-locked");
    const updateClock=()=>{const now=new Date();el.querySelector("#webos-lock-clock").textContent=now.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});el.querySelector("#webos-lock-date").textContent=now.toLocaleDateString([], {weekday:"long",month:"long",day:"numeric"});};
    updateClock();if(config.mode==="pin")setTimeout(()=>el.querySelector("#webos-lock-pin")?.focus(),80);return true;
  }
  window.WebOSLock=Object.freeze({configure,lock,unlock,isConfigured:()=>!!readConfig(),getMode:()=>readConfig()?.mode||null});
  if(localStorage.getItem("webos-lock-on-startup")==="true" && readConfig()) {
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>setTimeout(lock,250),{once:true});else setTimeout(lock,250);
  }
})();

/* Rehydrate user styles before the first window is created, not only after
   opening Settings. */
(() => {
  function restoreStyles() {
    try {
      const custom = localStorage.getItem("webos-custom-css") || "";
      const designer = localStorage.getItem("webos-window-designer-css") || "";
      if (!custom && !designer) return;
      let style = document.getElementById("custom-user-styles");
      if (!style) { style = document.createElement("style"); style.id = "custom-user-styles"; document.head.appendChild(style); }
      style.textContent = custom + "\n" + designer;
    } catch (error) { console.warn("WebOS could not restore saved appearance styles:", error); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", restoreStyles, { once: true });
  else restoreStyles();
})();
