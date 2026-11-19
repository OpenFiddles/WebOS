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
    body.dataset.theme=theme;
    body.dataset.wallpaper=custom?"custom":wallpaper;
    body.dataset.motion=motion;
    body.dataset.reducedMotion=String(reduced);
    body.dataset.liquidGlass=String(liquid);
    body.dataset.desktopStyle=desktopStyle;
    body.dataset.windowStyle=windowStyle;
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