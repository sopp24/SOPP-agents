self.addEventListener("install",e=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(k=>k.indexOf("pimientos-")===0).map(k=>caches.delete(k)));
 await self.registration.unregister();
 const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
 for(const client of clients){if(client.url.indexOf("/pimientos/")!==-1)client.navigate("../pepper/?from=sopp-agents");}
})()));