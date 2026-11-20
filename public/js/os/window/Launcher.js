/* Accessible application launcher with search, filters and recent apps. */
(() => {
  "use strict";
  const launcher=document.getElementById("Launcher"), launcherBtn=document.getElementById("open-launcher");
  const search=document.getElementById("launcher-search"), grid=document.getElementById("launcher-grid");
  const inner=launcher?.querySelector(".LauncherInner"), RECENT_KEY="webos-launcher-recent-v1";
  let activeFilter="all", filters=null, count=null;
  const readRecent=()=>{try{const v=JSON.parse(localStorage.getItem(RECENT_KEY)||"[]");return Array.isArray(v)?v.filter(x=>typeof x==="string").slice(0,20):[];}catch(_){return [];}};
  const getApps=()=>window.WebOSAppRegistry?.all?.()||[];
  function makeFilterUI(){
    if(!inner||!grid||filters)return;
    filters=document.createElement("nav");filters.className="LauncherFilters";filters.setAttribute("aria-label","Filter applications");
    [["all","All apps"],["pinned","Pinned"],["recent","Recent"]].forEach(([id,label])=>{
      const b=document.createElement("button");b.type="button";b.className="LauncherFilter";b.dataset.filter=id;b.textContent=label;b.setAttribute("aria-pressed",String(id===activeFilter));
      b.addEventListener("click",()=>{activeFilter=id;applyFilters();});filters.append(b);
    });
    count=document.createElement("p");count.className="LauncherCount";count.setAttribute("aria-live","polite");
    inner.insertBefore(filters,grid);inner.insertBefore(count,grid);
  }
  function applyFilters(){
    if(!grid)return;makeFilterUI();const query=(search?.value||"").trim().toLocaleLowerCase(),apps=getApps(),recent=readRecent();let visible=0;
    grid.querySelectorAll(".AppIcon").forEach(icon=>{
      const id=icon.dataset.app||"",app=apps.find(item=>item.id===id),text=(icon.dataset.search||icon.textContent||"").toLocaleLowerCase();
      const matchQuery=!query||text.includes(query),matchFilter=activeFilter==="all"||(activeFilter==="pinned"?!!app?.dock:recent.includes(id));
      icon.hidden=!(matchQuery&&matchFilter);if(!icon.hidden)visible++;
    });
    filters?.querySelectorAll(".LauncherFilter").forEach(b=>{const selected=b.dataset.filter===activeFilter;b.classList.toggle("active",selected);b.setAttribute("aria-pressed",String(selected));});
    if(count)count.textContent=visible+" application"+(visible===1?"":"s");
  }
  function openLauncher(){if(!launcher)return;launcher.classList.remove("hidden");launcher.classList.add("active");launcherBtn?.setAttribute("aria-expanded","true");if(search)search.value="";applyFilters();if(search)requestAnimationFrame(()=>search.focus());}
  function closeLauncher(returnFocus=false){if(!launcher)return;launcher.classList.add("hidden");launcher.classList.remove("active");launcherBtn?.setAttribute("aria-expanded","false");if(returnFocus)launcherBtn?.focus();}
  function toggleLauncher(){if(launcher?.classList.contains("active"))closeLauncher();else openLauncher();}
  launcherBtn?.addEventListener("click",toggleLauncher);
  launcher?.addEventListener("click",e=>{if(e.target===launcher)closeLauncher(true);});
  grid?.addEventListener("click",e=>{const icon=e.target.closest(".AppIcon");if(!icon)return;const id=icon.dataset.app;if(id){const recent=[id,...readRecent().filter(x=>x!==id)].slice(0,20);try{localStorage.setItem(RECENT_KEY,JSON.stringify(recent));}catch(_){}}closeLauncher();});
  search?.addEventListener("input",applyFilters);
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&launcher?.classList.contains("active")){e.preventDefault();closeLauncher(true);}
    if((e.ctrlKey||e.metaKey)&&e.code==="Space"){e.preventDefault();toggleLauncher();}
    if(e.key==="/"&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName||"")&&!e.target?.isContentEditable){if(!launcher?.classList.contains("active"))openLauncher();e.preventDefault();search?.focus();}
  });
  window.openLauncher=openLauncher;window.closeLauncher=closeLauncher;window.addEventListener("webos:apps-changed",applyFilters);makeFilterUI();
})();
