(() => {
  const EXCLUDED = key => !key || key.startsWith("sb-") ||
    /(^|[-_])(lock|passcode|password|token|secret|credential)([-_]|$)/i.test(key) ||
    ["webos-current-user","webos-users-v1","webos-custom-wallpaper"].includes(key) || key.startsWith("webos-profile-data-");
  const state={mode:"starting",message:"Checking cloud configuration…",user:null,lastSync:null,error:null};
  let client=null,applyingCloud=false,autoTimer=null;
  const publish=()=>{try{window.dispatchEvent(new CustomEvent("webos:cloud-state",{detail:{...state}}));}catch(_){}};
  const setState=patch=>{Object.assign(state,patch);publish();};
  const getStatus=()=>({...state,user:state.user?{id:state.user.id,email:state.user.email}:null});
  const requireClient=()=>{if(!client)throw new Error(state.message||"Cloud authentication is unavailable.");return client;};
  async function init(){
    try{
      const response=await fetch("/api/cloud/config",{cache:"no-store",credentials:"same-origin"});
      if(!response.ok)throw new Error("Cloud configuration endpoint returned HTTP "+response.status+".");
      const config=await response.json();
      if(!config.configured){setState({mode:"local",message:config.message||"Supabase is not configured. WebOS is running locally."});return;}
      if(!window.supabase?.createClient)throw new Error("Supabase browser library could not load.");
      client=window.supabase.createClient(config.url,config.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      client.auth.onAuthStateChange((_event,session)=>setState({mode:"ready",user:session?.user||null,message:session?.user?"Cloud account connected.":"Supabase is ready. Sign in to enable cloud data."}));
      const {data,error}=await client.auth.getSession();if(error)throw error;
      setState({mode:"ready",user:data.session?.user||null,message:data.session?.user?"Cloud account connected.":"Supabase is ready. Sign in to enable cloud data."});
    }catch(error){console.warn("[WebOS Cloud] Using local mode:",error?.message||error);setState({mode:"local",user:null,error:error?.message||String(error),message:"Cloud unavailable · local mode is active."});}
  }
  async function signIn(email,password){
    if(!email||!password)throw new Error("Enter your email and password.");
    const {data,error}=await requireClient().auth.signInWithPassword({email,password});if(error)throw error;
    setState({mode:"ready",user:data.user,message:"Signed in. Cloud data is ready."});return data;
  }
  async function signUp(email,password,displayName){
    if(!email||!password)throw new Error("Enter an email and password.");
    if(password.length<8)throw new Error("Use a password with at least 8 characters.");
    const {data,error}=await requireClient().auth.signUp({email,password,options:{data:displayName?{display_name:displayName}:{}}});if(error)throw error;
    if(data.session)setState({mode:"ready",user:data.user,message:"Account created and signed in."});
    else setState({mode:"ready",user:null,message:"Account created. Check your email to confirm the address, then sign in."});
    return data;
  }
  async function signOut(){const {error}=await requireClient().auth.signOut();if(error)throw error;setState({mode:"ready",user:null,message:"Signed out. Local WebOS data remains on this device."});}
  async function makeSnapshot(){
    const preferences={};
    for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith("webos-")&&!EXCLUDED(key))preferences[key]=localStorage.getItem(key);}
    const filesystem=window.WebOSFileSystem?.exportBackup?await window.WebOSFileSystem.exportBackup():null;
    const payload={format:"webos-cloud-backup",version:1,createdAt:new Date().toISOString(),preferences,filesystem};
    const bytes=new Blob([JSON.stringify(payload)]).size;
    if(bytes>8*1024*1024)throw new Error("Cloud backup is larger than 8 MB. Export large files separately with File Explorer.");
    return {payload,bytes};
  }
  async function sync(direction="push"){
    const supabase=requireClient(),user=state.user;if(!user)throw new Error("Sign in before syncing cloud data.");
    if(direction==="push"){
      const {payload,bytes}=await makeSnapshot();
      const {error}=await supabase.from("webos_cloud_data").upsert({user_id:user.id,payload,updated_at:new Date().toISOString()},{onConflict:"user_id"});
      if(error)throw error;
      const lastSync=new Date().toISOString();localStorage.setItem("webos-cloud-last-sync",lastSync);
      setState({lastSync,message:"Cloud backup is up to date."});return {bytes,files:payload.filesystem?.entries?.length||0};
    }
    const {data,error}=await supabase.from("webos_cloud_data").select("payload,updated_at").eq("user_id",user.id).maybeSingle();
    if(error)throw error;if(!data?.payload)throw new Error("No cloud backup exists for this account yet.");
    const payload=data.payload;if(payload.format!=="webos-cloud-backup"||payload.version!==1)throw new Error("This cloud backup format is not supported.");
    applyingCloud=true;
    try{
      Object.keys(localStorage).filter(key=>key?.startsWith("webos-")&&!EXCLUDED(key)).forEach(key=>localStorage.removeItem(key));
      Object.entries(payload.preferences||{}).forEach(([key,value])=>{if(key.startsWith("webos-")&&!EXCLUDED(key)&&typeof value==="string")localStorage.setItem(key,value);});
      let files=0;if(payload.filesystem&&window.WebOSFileSystem?.importBackup){const result=await window.WebOSFileSystem.importBackup(payload.filesystem,{replace:true});files=result.imported||0;}
      const lastSync=data.updated_at||new Date().toISOString();localStorage.setItem("webos-cloud-last-sync",lastSync);
      setState({lastSync,message:"Cloud backup restored to this device."});return {files};
    }finally{applyingCloud=false;}
  }
  function scheduleAutoSync(){
    if(applyingCloud||localStorage.getItem("webos-cloud-auto-sync")!=="true"||!state.user||state.mode!=="ready")return;
    clearTimeout(autoTimer);autoTimer=setTimeout(()=>sync("push").catch(error=>setState({message:"Automatic sync needs attention: "+(error?.message||"unknown error") })),2500);
  }
  try{
    const originalSet=Storage.prototype.setItem,originalRemove=Storage.prototype.removeItem;
    Storage.prototype.setItem=function(key,value){const result=originalSet.call(this,key,value);if(this===localStorage&&String(key).startsWith("webos-")&&!EXCLUDED(String(key)))scheduleAutoSync();return result;};
    Storage.prototype.removeItem=function(key){const result=originalRemove.call(this,key);if(this===localStorage&&String(key).startsWith("webos-")&&!EXCLUDED(String(key)))scheduleAutoSync();return result;};
  }catch(_){}
  try{
    const fs=window.WebOSFileSystem;
    if(fs){const wrapped=new Set(["putText","putBinary","remove","makeDirectory","copy","move","importBackup"]);
      window.WebOSFileSystem=new Proxy(fs,{get(target,key){const value=Reflect.get(target,key,target);if(wrapped.has(key)&&typeof value==="function")return(...args)=>Promise.resolve(value.apply(target,args)).then(result=>{scheduleAutoSync();return result;});return typeof value==="function"?value.bind(target):value;}});
    }
  }catch(error){console.warn("[WebOS Cloud] Filesystem auto-sync hooks unavailable:",error);}
  window.WebOSCloud=Object.freeze({ready:init(),getStatus,signIn,signUp,signOut,sync});
})();
