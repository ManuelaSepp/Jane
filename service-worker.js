const CACHE_NAME="jane-live-v1-1-13-20261021";
const APP_ASSETS=["./","./index.html","./config.js?v=3.0","./app.js?v=live-1-1-13-20261021","./manifest.json","./icons/favicon-32.png","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_ASSETS)));
 self.skipWaiting();
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME&&!key.startsWith("jane-zahlungen-test-")).map(key=>caches.delete(key)))));
 self.clients.claim();
});
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 if(url.pathname.includes("/jane-zahlungen-test/"))return;
 event.respondWith(fetch(event.request,{cache:"no-store"}).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)));}
  return response;
 }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match("./index.html"))));
});