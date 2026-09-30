const CACHE_NAME="arbeitszeit-fahrten-v1.7";
const APP_ASSETS=["./","./index.html","./config.js?v=1.7","./app.js?v=1.7","./manifest.json","./icons/favicon-32.png","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_ASSETS)));self.skipWaiting()});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==="navigate"){event.respondWith(fetch(event.request).catch(()=>caches.match("./index.html")));return}
  event.respondWith(fetch(event.request).then(response=>{if(response&&response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy))}return response}).catch(()=>caches.match(event.request)));
});
