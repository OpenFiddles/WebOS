/* WebOS browser-shell session controls. These manage the WebOS session, not the host computer. */
(() => {
  const KEY="webos-users-v1", CURRENT="webos-current-user";
  const safeRead=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key));return value??fallback}catch(_){return fallback}};
  let users=safeRead(KEY,[{id:"default",name:"WebOS User",avatar:"◉"}]);
  if(!Array.isArray(users)||!users.length)users=[{id:"default",name:"WebOS User",avatar:"◉"}];
  let current=users.find(user=>user.id===localStorage.getItem(CURRENT))||users[0];
  const PROFILE_PREFIX="webos-profile-data-";
  const isMetaKey=key=>key===KEY||key===CURRENT||key.startsWith(PROFILE_PREFIX);
  function saveCurrentProfile(){
    const snapshot={};
    try{
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i);
        if(!key||isMetaKey(key)||key.startsWith("sb-")||key==="webos-custom-wallpaper")continue;
        snapshot[key]=localStorage.getItem(key);
      }
      localStorage.setItem(PROFILE_PREFIX+current.id,JSON.stringify(snapshot));
    }catch(error){console.warn("WebOS could not snapshot every profile preference:",error)}
  }
  const save=()=>{localStorage.setItem(KEY,JSON.stringify(users));localStorage.setItem(CURRENT,current.id)};
  function activateProfile(profile,persistCurrent=true){
    if(persistCurrent)saveCurrentProfile();
    const snapshot=safeRead(PROFILE_PREFIX+profile.id,{});
    const remove=[];
    for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&!isMetaKey(key)&&!key.startsWith("sb-")&&key!=="webos-custom-wallpaper")remove.push(key)}
    remove.forEach(key=>localStorage.removeItem(key));
    Object.entries(snapshot||{}).forEach(([key,value])=>{if(typeof value==="string")localStorage.setItem(key,value)});
    current=profile;save();location.reload();
  }
  save();
  const toggle=document.getElementById("power-toggle");
  if(!toggle)return;
  let menu=null,overlay=null;
  const closeMenu=()=>{menu?.remove();menu=null;toggle.setAttribute("aria-expanded","false")};
  const addAction=(symbol,label,action)=>{const button=document.createElement("button");button.type="button";const icon=document.createElement("span");icon.textContent=symbol;const text=document.createElement("span");text.textContent=label;button.append(icon,text);button.addEventListener("click",()=>{closeMenu();action()});menu.appendChild(button)};
  function showMenu(){
    if(menu){closeMenu();return}
    menu=document.createElement("section");menu.className="webos-power-menu";menu.setAttribute("aria-label","Power and session");
    const user=document.createElement("div");user.className="webos-power-user";const name=document.createElement("strong");name.textContent=current.avatar+"  "+current.name;const detail=document.createElement("small");detail.textContent="WebOS session";user.append(name,detail);menu.appendChild(user);
    addAction("▣","Lock session",()=>{if(!window.WebOSLock?.lock())alert("Set a PIN, pattern, or swipe lock in Settings → Lock & Security first.");});
    addAction("☾","Sleep",()=>showOverlay("sleep"));
    addAction("↻","Restart WebOS",()=>{showOverlay("restart");setTimeout(()=>location.reload(),650)});
    addAction("⇄","Switch user",()=>showOverlay("users"));
    addAction("⇥","Log out",()=>showOverlay("users"));
    document.body.appendChild(menu);toggle.setAttribute("aria-expanded","true");
  }
  function showOverlay(mode){
    overlay?.remove();overlay=document.createElement("div");overlay.className="webos-session-overlay"+(mode==="sleep"?" webos-sleep-screen":"");
    const card=document.createElement("div");card.className="webos-session-card";
    const title=document.createElement("h1"),description=document.createElement("p");card.append(title,description);
    const finish=()=>{overlay?.remove();overlay=null};
    if(mode==="locked"){
      title.textContent="WebOS is locked";description.textContent="Your desktop session is paused. Select Continue to return.";
      const unlock=document.createElement("button");unlock.textContent="Continue to WebOS";unlock.addEventListener("click",finish);card.appendChild(unlock);
    }else if(mode==="sleep"){
      title.textContent="Sleeping";description.textContent="WebOS is in sleep mode. Wake the session to continue.";
      const wake=document.createElement("button");wake.textContent="Wake WebOS";wake.addEventListener("click",finish);card.appendChild(wake);
      overlay.addEventListener("click",event=>{if(event.target===overlay)finish()});
    }else if(mode==="restart"){
      title.textContent="Restarting WebOS…";description.textContent="Saving the session and restarting the desktop.";
    }else{
      title.textContent="Choose a user";description.textContent="Switch to a local WebOS profile or create another profile.";
      const select=document.createElement("select");users.forEach(profile=>{const option=document.createElement("option");option.value=profile.id;option.textContent=profile.avatar+"  "+profile.name;select.appendChild(option)});select.value=current.id;
      const switchButton=document.createElement("button");switchButton.textContent="Continue";switchButton.addEventListener("click",()=>activateProfile(users.find(profile=>profile.id===select.value)||users[0]));
      const createButton=document.createElement("button");createButton.className="secondary";createButton.textContent="＋ Add user";
      createButton.addEventListener("click",()=>{const name=prompt("Name for the new local WebOS profile:");if(!name||!name.trim())return;saveCurrentProfile();const profile={id:"user-"+Date.now().toString(36),name:name.trim().slice(0,32),avatar:"◉"};users.push(profile);current=profile;save();activateProfile(profile,false)});
      const back=document.createElement("button");back.className="secondary";back.textContent="Cancel";back.addEventListener("click",finish);card.append(select,switchButton,createButton,back);
      if(mode==="users"){} 
    }
    overlay.appendChild(card);document.body.appendChild(overlay);
  }
  toggle.addEventListener("click",showMenu);
  document.addEventListener("pointerdown",event=>{if(menu&&!menu.contains(event.target)&&event.target!==toggle)closeMenu()});
  document.addEventListener("keydown",event=>{if(event.key==="Escape")closeMenu()});
  window.WebOSSession=Object.freeze({currentUser:()=>({...current}),lock:()=>window.WebOSLock?.lock()||false,sleep:()=>showOverlay("sleep"),switchUser:()=>showOverlay("users"),restart:()=>location.reload(),logout:()=>showOverlay("users")});
})();