// Keeps a copy of the app, your saved recipes and plan, and recently seen photos so Simmer opens without a connection.
// App files and your recipes are fetched fresh when online, so updates show up straight away.
const CACHE='simmer-v1',PHOTOS='simmer-photos-v1',MAX_PHOTOS=400;
const SHELL=['/','/index.html','/styles.css','/discovery.css','/polish.css','/app.js','/filter-picker.js','/cook-mode.js','/ingredients.js','/steps.js','/manifest.webmanifest','/icon.svg','/assets/icon-192.png','/assets/favicon-32.png'];

self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&key!==PHOTOS).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});

async function trimPhotos(cache){const keys=await cache.keys();for(const key of keys.slice(0,Math.max(0,keys.length-MAX_PHOTOS)))await cache.delete(key);}
self.addEventListener('fetch',event=>{
 const {request}=event,url=new URL(request.url);
 if(request.method!=='GET')return;
 const isFont=url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com';
 if(url.origin!==self.location.origin&&!isFont)return;
 // Only the shared state (saved recipes and meal plan) is kept for offline use; searches always go to the server.
 if(url.pathname.startsWith('/api/')&&url.pathname!=='/api/state')return;
 event.respondWith((async()=>{
  // Catalogue photos never change: use the saved copy first.
  if(url.pathname.startsWith('/catalogue-images/')){
   const cache=await caches.open(PHOTOS),saved=await cache.match(request);if(saved)return saved;
   const fresh=await fetch(request);if(fresh.ok){await cache.put(request,fresh.clone());trimPhotos(cache);}return fresh;
  }
  const cache=await caches.open(CACHE);
  if(isFont){const saved=await cache.match(request);if(saved)return saved;}
  try{const fresh=await fetch(request);if(fresh.ok||fresh.type==='opaque')cache.put(request,fresh.clone());return fresh;}
  catch(error){
   const saved=await cache.match(request,{ignoreSearch:request.mode==='navigate'});if(saved)return saved;
   if(request.mode==='navigate')return (await cache.match('/index.html'))??Response.error();
   throw error;
  }
 })());
});
