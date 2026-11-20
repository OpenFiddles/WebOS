/* WebOS Core 3.0: origin-local, per-app IndexedDB data namespaces.
 * This is cooperative data separation, not a security sandbox. */
(() => {
  "use strict";
  const databases=new Map();
  const validApp=id=>{const value=String(id||"").trim();if(!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(value))throw new TypeError("Invalid WebOS app ID.");return value;};
  const validKey=key=>{const value=String(key);if(!value||value.length>240||value.includes("\\0"))throw new TypeError("Invalid app storage key.");return value;};
  function open(appId){
    const app=validApp(appId);if(databases.has(app))return databases.get(app);
    const promise=new Promise((resolve,reject)=>{
      const request=indexedDB.open("webos-app-data-"+app,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains("data"))request.result.createObjectStore("data",{keyPath:"key"});};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    databases.set(app,promise);promise.catch(()=>databases.delete(app));return promise;
  }
  async function run(appId,mode,operation){
    const db=await open(appId);
    return new Promise((resolve,reject)=>{
      const tx=db.transaction("data",mode),store=tx.objectStore("data");let result;
      try{result=operation(store);}catch(error){tx.abort();reject(error);return;}
      tx.oncomplete=()=>resolve(result?.result??result);
      tx.onerror=()=>reject(tx.error||result?.error);
      tx.onabort=()=>reject(tx.error||new Error("App storage transaction aborted."));
    });
  }
  async function get(app,key){
    const db=await open(app),id=validKey(key);
    return new Promise((resolve,reject)=>{const tx=db.transaction("data","readonly"),r=tx.objectStore("data").get(id);r.onsuccess=()=>resolve(r.result?.value);r.onerror=()=>reject(r.error);});
  }
  async function set(app,key,value){
    const id=validKey(key);return run(app,"readwrite",store=>store.put({key:id,value,updatedAt:Date.now()}));
  }
  async function remove(app,key){const id=validKey(key);await run(app,"readwrite",store=>store.delete(id));return true;}
  async function keys(app){
    const db=await open(app);return new Promise((resolve,reject)=>{const tx=db.transaction("data","readonly"),r=tx.objectStore("data").getAllKeys();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});
  }
  async function clear(app){await run(app,"readwrite",store=>store.clear());return true;}
  async function estimate(app){
    const db=await open(app);return new Promise((resolve,reject)=>{const tx=db.transaction("data","readonly"),r=tx.objectStore("data").getAll();r.onsuccess=()=>{let bytes=0;(r.result||[]).forEach(item=>{try{bytes+=new Blob([JSON.stringify(item)]).size;}catch(_){}});resolve({keys:r.result?.length||0,approximateBytes:bytes});};r.onerror=()=>reject(r.error);});
  }
  window.WebOSAppStorage=Object.freeze({get,set,delete:remove,keys,clear,estimate});
})();
