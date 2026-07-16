const CACHE_NAME='duc-classroom-2026.07.16.2';
const CORE=[
  './',
  './index.html',
  './manifest.webmanifest',
  './version.json',
  './assets/logo-duc.jpg',
  './assets/thay-duc.jpg',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.7',
  'https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/dist/tus.min.js'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await Promise.allSettled(CORE.map(url=>cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name!==CACHE_NAME).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.hostname.endsWith('.supabase.co'))return;

  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request);
        if(response.ok){
          const cache=await caches.open(CACHE_NAME);
          cache.put('./index.html',response.clone());
        }
        return response;
      }catch{
        return (await caches.match('./index.html'))||(await caches.match('./'));
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cached=await caches.match(request);
    if(cached)return cached;
    const response=await fetch(request);
    if(response.ok||response.type==='opaque'){
      const cache=await caches.open(CACHE_NAME);
      cache.put(request,response.clone());
    }
    return response;
  })());
});
