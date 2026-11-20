(() => {
 const read=(key,fallback)=>{try{return localStorage.getItem(key)||fallback}catch(_){return fallback}};
 function apply(){
  const name=read("webos-brand-name","WebOS").trim().slice(0,32)||"WebOS";
  const subtitle=read("webos-brand-subtitle","A browser-based desktop environment").trim().slice(0,64);
  const logo=read("webos-brand-logo","🖥️").trim().slice(0,8)||"🖥️";
  const version=read("webos-brand-version","").trim().slice(0,24);
  document.title=name+(version?" · "+version:"");
  document.querySelectorAll(".system-brand-text").forEach(el=>{el.textContent=name;el.title=subtitle||name;});
  const left=document.getElementById("taskbar-left");
  if(left){let icon=left.querySelector(".system-brand-icon");if(!icon){icon=document.createElement("span");icon.className="system-brand-icon";left.insertBefore(icon,left.querySelector(".system-brand-text"));}icon.textContent=logo;icon.setAttribute("aria-hidden","true");}
  document.body.dataset.osBrand=name;
 }
 window.WebOSBranding=Object.freeze({apply});
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",apply,{once:true});else apply();
 window.addEventListener("storage",e=>{if(e.key&&e.key.startsWith("webos-brand-"))apply();});
})();
