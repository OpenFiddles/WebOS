(() => {
  const items=[];let panel=null,unread=0;
  const count=document.getElementById("notification-count");
  const toggle=document.getElementById("notification-toggle");
  function updateCount(){if(!count)return;count.textContent=String(unread);count.hidden=!unread;toggle?.setAttribute("aria-label",unread?unread+" unread notifications":"Notifications");}
  function close(){if(panel){panel.remove();panel=null;}toggle?.setAttribute("aria-expanded","false");}
  function render(){
    if(!panel)return;
    panel.replaceChildren();
    const head=document.createElement("header");head.className="webos-notifications-head";
    const title=document.createElement("strong");title.textContent="Notifications";
    const clear=document.createElement("button");clear.type="button";clear.textContent="Clear all";clear.addEventListener("click",()=>{items.length=0;unread=0;updateCount();render();});
    head.append(title,clear);panel.appendChild(head);
    if(!items.length){const empty=document.createElement("p");empty.className="webos-notifications-empty";empty.textContent="You're all caught up.";panel.appendChild(empty);return;}
    items.forEach(item=>{const row=document.createElement("article");row.className="webos-notification";
      const icon=document.createElement("span");icon.textContent=item.icon;const body=document.createElement("div");
      const heading=document.createElement("strong");heading.textContent=item.title;const message=document.createElement("p");message.textContent=item.message;
      const time=document.createElement("small");time.textContent=item.time;body.append(heading,message,time);row.append(icon,body);panel.appendChild(row);
    });
  }
  function open(){
    if(panel){close();return;}
    panel=document.createElement("aside");panel.className="webos-notifications-panel";panel.setAttribute("aria-label","Notification center");
    document.body.appendChild(panel);unread=0;updateCount();render();toggle?.setAttribute("aria-expanded","true");
  }
  function notify(title,message,options={}){
    const item={title:String(title||"WebOS"),message:String(message||""),icon:String(options.icon||"●"),time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})};
    items.unshift(item);if(items.length>40)items.length=40;unread++;updateCount();render();
    window.dispatchEvent(new CustomEvent("webos:notification",{detail:item}));
    return item;
  }
  toggle?.addEventListener("click",open);
  document.addEventListener("pointerdown",event=>{if(panel&&!panel.contains(event.target)&&!toggle?.contains(event.target))close();});
  document.addEventListener("keydown",event=>{if(event.key==="Escape")close();});
  window.WebOSNotifications=Object.freeze({notify,open,close,all:()=>items.slice()});
  window.addEventListener("error",event=>{if(event.message)notify("Application error",event.message,{icon:"⚠"});});
})();