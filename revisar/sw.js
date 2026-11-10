// Service worker do Revisar curadoria. VERSION é trocado pelo build.py.
const VERSION='bf71ea13d5';
const SHELL=['./','index.html','app.css?v='+VERSION,'app.js?v='+VERSION,'manifest.webmanifest','editions.json','reviewed.json','SEED_REVIEWED.json',
  'icon-192.png','icon-512.png','icon-maskable-192.png','icon-maskable-512.png','apple-touch-icon.png'];
const CACHE='revisar-'+VERSION, PAGES='revisar-pages', MAX_PAGES=40;

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('revisar-')&&k!==CACHE&&k!==PAGES).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});

async function trim(c){const ks=await c.keys();for(let i=0;i<ks.length-MAX_PAGES;i++)await c.delete(ks[i])}

// rede primeiro (limite de 4 s) — editions.json e páginas de edição mudam; cache como reserva offline
async function networkFirst(req,name){
  const c=await caches.open(name);
  const net=fetch(req).then(res=>{if(res.ok){c.put(req,res.clone());if(name===PAGES)trim(c)}return res});
  try{
    const res=await Promise.race([net,new Promise(ok=>setTimeout(ok,4000,null))]);
    if(res)return res;
    return (await c.match(req,{ignoreSearch:true}))||await net;
  }catch(err){
    const hit=await c.match(req,{ignoreSearch:true});
    if(hit)return hit;
    if(req.mode==='navigate')return (await caches.match('index.html'))||Response.error();
    throw err;
  }
}

self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);if(u.origin!==location.origin)return;
  const inScope=u.href.startsWith(self.registration.scope);
  // edições (../e/*.html) e ../editions.json ficam num cache próprio que sobrevive às versões
  e.respondWith(networkFirst(r,inScope?CACHE:PAGES));
});
