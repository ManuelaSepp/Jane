const CACHE_NAME="jane-zahlungen-test-update-v2";
const OFFLINE_FILES=["./index.html","./app.js?v=pdf-quantities-hover-test-20261020-9","./config.js?v=zahlungen-test-readonly-2"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(OFFLINE_FILES)));
 self.skipWaiting();
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("jane-zahlungen-test-")&&key!==CACHE_NAME).map(key=>caches.delete(key)))));
 self.clients.claim();
});
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 if(!url.pathname.startsWith(self.registration.scope.replace(self.location.origin,"")))return;
 event.respondWith(fetch(event.request,{cache:"no-store"}).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)));}
  return response;
 }).catch(()=>caches.match(event.request)));
});