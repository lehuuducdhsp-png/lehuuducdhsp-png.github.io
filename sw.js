const CACHE_NAME='duc-classroom-2026.07.17.18';
const LOCAL_CORE=[
  './',
  './index.html',
  './tuition-poster.js?v=2026.07.17.18',
  './student/',
  './student/index.html',
  './student/manifest.webmanifest',
  './manifest.webmanifest',
  './assets/logo-duc.jpg',
  './assets/thay-duc.jpg'
];
const OPTIONAL_CORE=[
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.7',
  'https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/dist/tus.min.js'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll(LOCAL_CORE);
    await Promise.allSettled(OPTIONAL_CORE.map(url=>cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith('duc-classroom-')&&name!==CACHE_NAME).map(name=>caches.delete(name)));
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
  if(url.origin===self.location.origin&&url.pathname.endsWith('/version.json'))return;

  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request,{cache:'no-store'});
        if(response.ok){
          const cache=await caches.open(CACHE_NAME);
          cache.put(url.pathname.includes('/student/')?'./student/index.html':'./index.html',response.clone());
        }
        return response;
      }catch{
        return url.pathname.includes('/student/')
          ?(await caches.match('./student/index.html'))
          :(await caches.match('./index.html'))||(await caches.match('./'));
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cached=await caches.match(request);
    const network=fetch(request).then(async response=>{
      if(response.ok||response.type==='opaque'){
        const cache=await caches.open(CACHE_NAME);
        await cache.put(request,response.clone());
      }
      return response;
    });
    if(cached)return cached;
    return network;
  })());
});
