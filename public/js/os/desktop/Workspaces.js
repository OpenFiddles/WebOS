/* WebOS Core 3.0: persistent virtual desktop/workspace manager. */
(() => {
  "use strict";
  const KEY="webos-workspaces-v1";
  const defaults=[{id:"workspace-1",name:"Desktop 1"}];
  let state;
  try{
    const saved=JSON.parse(localStorage.getItem(KEY)||"null");
    state=saved&&Array.isArray(saved.items)&&saved.items.length?saved: {items:defaults,activeId:defaults[0].id};
    state.items=state.items.filter(x=>x&&/^workspace-[a-z0-9-]+$/i.test(x.id)&&typeof x.name==="string").slice(0,12);
    if(!state.items.length)state.items=defaults;
    if(!state.items.some(x=>x.id===state.activeId))state.activeId=state.items[0].id;
  }catch(_){state={items:defaults,activeId:defaults[0].id};}
  const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(state));}catch(error){console.warn("[WebOS Workspaces] Could not save workspace settings:",error);}};
  const activeId=()=>state.activeId;
  const list=()=>state.items.map(x=>({...x,active:x.id===state.activeId,windows:document.querySelectorAll('.window-shell[data-workspace-id="'+x.id+'"]').length}));
  function apply(){
    document.querySelectorAll("#window-workspace .window-shell").forEach(win=>win.classList.toggle("is-workspace-hidden",win.dataset.workspaceId!==state.activeId));
    document.querySelectorAll(".TaskButton").forEach(btn=>btn.classList.toggle("is-workspace-hidden",btn.dataset.workspaceId!==state.activeId));
    window.dispatchEvent(new CustomEvent("webos:workspace-change",{detail:{activeId:state.activeId,workspaces:list()}}));
  }
  function create(name){
    if(state.items.length>=12)throw new Error("WebOS supports up to 12 virtual desktops.");
    const id="workspace-"+(crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2,8));
    const item={id,name:String(name||("Desktop "+(state.items.length+1))).trim().slice(0,48)||"New Desktop"};
    state.items.push(item);persist();return {...item};
  }
  function rename(id,name){
    const item=state.items.find(x=>x.id===id);if(!item)throw new Error("Workspace not found.");
    item.name=String(name||"").trim().slice(0,48)||item.name;persist();return {...item};
  }
  function switchTo(id){
    if(!state.items.some(x=>x.id===id))throw new Error("Workspace not found.");
    state.activeId=id;persist();apply();return list();
  }
  function assign(winOrId,id){
    if(!state.items.some(x=>x.id===id))throw new Error("Workspace not found.");
    const win=typeof winOrId==="string"?document.getElementById(winOrId):winOrId;
    if(!win?.matches?.(".window-shell"))throw new Error("A valid WebOS window is required.");
    win.dataset.workspaceId=id;
    const btn=document.querySelector('.TaskButton[data-window-id="'+CSS.escape(win.id)+'"]');
    if(btn)btn.dataset.workspaceId=id;
    apply();return true;
  }
  function remove(id,destination){
    if(state.items.length<=1)throw new Error("At least one desktop must remain.");
    if(id===state.activeId)throw new Error("Switch to another desktop before removing this one.");
    const target=state.items.find(x=>x.id===destination);
    if(!target||target.id===id)throw new Error("Choose a different destination desktop.");
    document.querySelectorAll('.window-shell[data-workspace-id="'+id+'"]').forEach(win=>assign(win,target.id));
    state.items=state.items.filter(x=>x.id!==id);persist();apply();return list();
  }
  window.WebOSWorkspaces=Object.freeze({list,activeId,create,rename,switchTo,assign,remove,refresh:apply});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",apply,{once:true});else apply();
  const observer=new MutationObserver(()=>apply());
  observer.observe(document.getElementById("window-workspace")||document.body,{childList:true,subtree:true});
})();
