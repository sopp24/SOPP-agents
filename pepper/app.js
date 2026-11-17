const STORAGE_KEY="pepper-trip-state-v1";
const LEGACY_KEY="pimientos-state-v1";
const DEFAULT_CHECKLIST=["Vérifier les papiers d’identité et les visas","Confirmer les billets, horaires et formalités d’enregistrement","Confirmer l’hébergement et les heures d’arrivée / départ","Vérifier les conditions de bagages et les documents nécessaires","Prévoir les moyens de paiement et télécharger les documents hors ligne"];
const $=(s,root=document)=>root.querySelector(s),$$=(s,root=document)=>Array.from(root.querySelectorAll(s));
const parse=(v,f)=>{try{return JSON.parse(v)}catch(e){return f}};
const uid=()=>"pepper-"+Math.random().toString(36).slice(2,9)+"-"+Date.now().toString(36);
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const dateLabel=v=>v?new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"short",year:"numeric"}).format(new Date(v+"T12:00:00")):"À définir";
const money=(v,c)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:c||"EUR",maximumFractionDigits:0}).format(Number(v||0));
const icons={train:"🚆",plane:"✈️",car:"🚗",bus:"🚌",ferry:"⛴"};
const modeName={train:"Train",plane:"Avion",car:"Voiture",bus:"Bus",ferry:"Ferry"};
const directionName={outbound:"Aller",return:"Retour",connection:"Correspondance",other:"Étape"};
let state=parse(localStorage.getItem(STORAGE_KEY),null)||parse(localStorage.getItem(LEGACY_KEY),null)||{trips:[],activeTripId:null};
state.trips=Array.isArray(state.trips)?state.trips:[];
state.trips.forEach(t=>{t.activities=t.activities||[];t.expenses=t.expenses||[];t.checklist=t.checklist||DEFAULT_CHECKLIST.map(label=>({id:uid(),label,done:false}));t.transport=t.transport||[];t.accommodation=t.accommodation||null});
let map=null,markers=null,mapTripId=null,weatherData=null,weatherError="",weatherRequest=0;
const modalRoot=$("#modal-root");
function activeTrip(){return state.trips.find(t=>t.id===state.activeTripId)||state.trips[0]||null}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch(e){toast("Le stockage de cet appareil est saturé. Exporte le voyage pour le sauvegarder.","error")}}
function toast(message,type){const n=document.createElement("div");n.className="toast "+(type||"");n.textContent=message;$("#toast-root").appendChild(n);setTimeout(()=>n.remove(),4200)}
function dateTime(date,time){if(!date)return null;const d=new Date(date+"T"+(time||"00:00")+":00");return Number.isNaN(d.getTime())?null:d}
function dateTimeLabel(d){return new Intl.DateTimeFormat("fr-FR",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(d)}
function getAdvice(leg){
 const mode=leg.mode,operator=String(leg.operator||"").toLowerCase();
 if(mode==="train"){
  if(operator.includes("ouigo"))return{minutes:30,title:"OUIGO : viser 30 minutes avant",detail:"SNCF Connect conseille une présentation 30 minutes avant ; l’accès au train n’est plus garanti à moins de 5 minutes du départ. Prépare le billet et les justificatifs requis.",url:"https://www.sncf-connect.com/tgv",source:"SNCF Connect"};
  if(operator.includes("tgv inoui")||operator==="inoui")return{minutes:20,title:"TGV INOUI : viser 20 minutes avant",detail:"SNCF Connect conseille d’arriver 20 minutes avant ; l’accès au train peut être fermé 2 minutes avant le départ. Vérifie l’affichage du quai et garde le billet prêt.",url:"https://www.sncf-connect.com/aide/presentation-a-l-embarquement",source:"SNCF Connect"};
  if(operator.includes("eurostar")&&(String(leg.origin||"")+" "+String(leg.destination||"")).toLowerCase().includes("londres"))return{minutes:60,title:"Eurostar vers Londres : viser 1 heure avant",detail:"Les contrôles d’identité et douaniers imposent une marge plus importante. Les limites d’enregistrement et d’embarquement inscrites sur le billet priment.",url:"https://www.sncf-connect.com/aide/voyager-avec-eurostar",source:"Eurostar / SNCF Connect"};
  return{minutes:null,title:"Marge à confirmer auprès du transporteur",detail:"Renseigne le transporteur et vérifie l’heure de présentation figurant sur ton billet. Les règles changent selon la ligne, la gare et les contrôles.",url:"https://www.sncf-connect.com/aide/presentation-a-l-embarquement",source:"SNCF Connect"};
 }
 if(mode==="plane"){
  if(operator.includes("air france")){
   if(leg.routeType==="international")return{minutes:180,title:"Air France : repère de 3 h avant l’international",detail:"En l’absence d’une heure différente sur la carte d’embarquement, Air France recommande 3 h avant un vol international. Vérifie la fin d’enregistrement et la fermeture de la porte.",url:"https://wwws.airfrance.fr/information/aeroport/enregistrement",source:"Air France"};
   if(leg.routeType==="domestic"||leg.routeType==="europe")return{minutes:120,title:"Air France : repère de 2 h avant France / Europe",detail:"En l’absence d’une heure différente sur la carte d’embarquement, Air France recommande 2 h avant un vol en France ou en Europe. Vérifie l’heure limite de dépôt bagages et d’embarquement.",url:"https://wwws.airfrance.fr/information/aeroport/enregistrement",source:"Air France"};
   return{minutes:null,title:"Air France : préciser le type de vol",detail:"Repère Air France : 2 h pour la France / Europe, 3 h pour l’international, sauf heure différente sur la carte d’embarquement. Indique le type de vol.",url:"https://wwws.airfrance.fr/information/aeroport/enregistrement",source:"Air France"};
  }
  return{minutes:null,title:"Marge à confirmer auprès de la compagnie",detail:"Le temps conseillé dépend de la compagnie, de l’aéroport, du pays, des bagages et des contrôles. L’heure indiquée sur le billet / la carte d’embarquement est prioritaire.",url:"",source:""};
 }
 if(mode==="car")return{minutes:null,title:"Voiture : prévoir les pauses et les aléas",detail:"Sur un long trajet, la Sécurité routière recommande une pause au moins toutes les 2 h et dès les signes de fatigue. Vérifie le véhicule, le trafic, les péages, les zones réglementées et le stationnement.",url:"https://www.securite-routiere.gouv.fr/dangers-de-la-route/la-fatigue-et-la-conduite",source:"Sécurité routière"};
 return{minutes:null,title:"Marge à confirmer auprès du transporteur",detail:"Les règles de présentation, bagages et embarquement sont propres au transporteur et au trajet. Vérifie le billet et les consignes officielles.",url:"",source:""};
}
function arrivalInfo(leg){
 const advice=getAdvice(leg),custom=leg.arrivalBufferMinutes!==""&&leg.arrivalBufferMinutes!=null,minutes=custom?Number(leg.arrivalBufferMinutes):advice.minutes,departure=dateTime(leg.departureDate,leg.departureTime);
 if(custom){advice.title="Marge personnalisée : "+minutes+" minutes";advice.detail="Marge saisie manuellement. Vérifie qu’elle respecte les instructions du billet, la fermeture de l’enregistrement et les éventuels contrôles."}
 return{advice:advice,minutes:minutes,arrivalBy:departure&&minutes!=null?new Date(departure.getTime()-minutes*60000):null,custom:custom};
}
function getWarnings(trip){
 const warnings=[],legs=trip.transport||[],activities=trip.activities||[];
 legs.forEach(leg=>{
  const dep=dateTime(leg.departureDate,leg.departureTime),arr=dateTime(leg.arrivalDate,leg.arrivalTime),info=arrivalInfo(leg);
  activities.forEach(a=>{
   if(!a.date||!a.startTime)return;
   const start=dateTime(a.date,a.startTime),end=start?new Date(start.getTime()+Number(a.duration||60)*60000):null;if(!start)return;
   if(dep&&a.date===leg.departureDate){const margin=new Date(dep.getTime()-(info.minutes==null?60:info.minutes)*60000);if(end&&end>margin&&start<dep)warnings.push("« "+a.name+" » est proche du départ "+directionName[leg.direction].toLowerCase()+". Vérifie le temps pour rejoindre "+(leg.origin||"le point de départ")+".")}
   if(arr&&a.date===leg.arrivalDate&&start>=arr&&start<new Date(arr.getTime()+90*60000))warnings.push("« "+a.name+" » commence moins de 1 h 30 après l’arrivée du trajet. Prévois débarquement, bagages et déplacement.")
  });
 });
 const stay=trip.accommodation;
 if(stay)(legs||[]).forEach(leg=>{
  const arrival=dateTime(leg.arrivalDate,leg.arrivalTime),departure=dateTime(leg.departureDate,leg.departureTime);
  if(arrival&&stay.checkInDate===leg.arrivalDate&&stay.checkInTime){const check=dateTime(stay.checkInDate,stay.checkInTime);if(check&&arrival>check)warnings.push("L’arrivée du "+directionName[leg.direction].toLowerCase()+" est après le check-in du logement. Confirme une arrivée tardive ou un accès autonome.")}
  if(departure&&stay.checkOutDate===leg.departureDate&&stay.checkOutTime){const out=dateTime(stay.checkOutDate,stay.checkOutTime);if(out&&out>departure)warnings.push("Le check-out est après le départ prévu. Vérifie une consigne à bagages ou un départ anticipé.")}
 });
 return Array.from(new Set(warnings));
}
function render(){
 const t=activeTrip();$("#empty-state").hidden=!!t;$("#trip-workspace").hidden=!t;if(!t)return;
 $("#trip-destination").textContent=t.destination||"Destination";
 $("#trip-dates").textContent=t.startDate?dateLabel(t.startDate)+(t.endDate?" — "+dateLabel(t.endDate):""):"Dates à définir";
 $("#trip-travellers").textContent=(t.people||1)+((t.people||1)===1?" voyageur":" voyageurs");
 const start=t.startDate?new Date(t.startDate+"T00:00:00"):null,end=t.endDate?new Date(t.endDate+"T23:59:59"):null,now=new Date();
 $("#trip-status").textContent=!start?"À organiser":start>now?"À venir":end&&end<now?"Terminé":"En cours";
 if(start){const days=Math.ceil((start-new Date(today()+"T00:00:00"))/86400000);$("#trip-countdown").textContent=days>1?"J - "+days:days===1?"Départ demain":days===0?"C’est le départ !":"Voyage passé"}else $("#trip-countdown").textContent="Dates à définir";
 $("#trip-switcher").innerHTML=state.trips.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===t.id?"selected":"")+'>'+esc(x.destination)+'</option>').join("");
 const q=encodeURIComponent(t.destination||"");$("#link-google-maps").href="https://www.google.com/maps/search/?api=1&query="+q;$("#link-apple-maps").href="https://maps.apple.com/?q="+q;$("#link-waze").href="https://www.waze.com/ul?q="+q+"&navigate=yes";$("#link-fuel").href="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent("station-service carburant "+t.destination);
 renderStay(t);renderTransport(t);renderActivities(t);renderBudget(t);renderChecklist(t);
 if(!t.geo&&t.destination)fetchDestination(t);else{renderMap(t);if(!weatherData||weatherData.tripId!==t.id)fetchWeather(t)}
}
function renderStay(t){
 const s=t.accommodation,node=$("#accommodation-content");if(!s||!s.name){node.innerHTML='<div class="empty-inline">Ajoute ton logement pour connaître les horaires, l’accès, les équipements et les consignes d’arrivée / départ.</div>';return}
 const facts=[["Arrivée / check-in",(s.checkInDate?dateLabel(s.checkInDate):"À confirmer")+" · "+(s.checkInTime||"Horaire à confirmer")],["Départ / check-out",(s.checkOutDate?dateLabel(s.checkOutDate):"À confirmer")+" · "+(s.checkOutTime||"Horaire à confirmer")],["Type",s.type||"Non précisé"],["Contact",s.contact||"À confirmer"],["Téléphone",s.phone||"Non renseigné"],["Équipements",s.amenities||"À préciser"],["Parking",s.parking||"À vérifier"],["Petit-déjeuner",s.breakfast||"À vérifier"]];
 node.innerHTML='<div class="stay-top"><div><div class="stay-name">'+esc(s.name)+'</div><div class="stay-address">'+esc(s.address||"Adresse à préciser")+'</div></div><span class="status-pill">'+esc(s.status||"À confirmer")+'</span></div><div class="stay-grid">'+facts.map(f=>'<div class="stay-fact"><small>'+esc(f[0])+'</small><strong>'+esc(f[1])+'</strong></div>').join("")+'</div>'+(s.access||s.notes?'<div class="stay-notes">'+(s.access?"<strong>Accès / arrivée :</strong> "+esc(s.access)+"<br>":"")+(s.notes?"<strong>Consignes :</strong> "+esc(s.notes):"")+'</div>':"")+'<div class="inline-links">'+(s.bookingUrl?'<a href="'+esc(s.bookingUrl)+'" target="_blank" rel="noopener noreferrer">Réservation ↗</a>':"")+'<a href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(s.address||s.name)+'" target="_blank" rel="noopener noreferrer">Itinéraire vers le logement ↗</a></div>';
}
function renderTransport(t){
 const node=$("#transport-content"),legs=t.transport||[];if(!legs.length){node.innerHTML='<div class="empty-inline">Aucun trajet renseigné. Ajoute ton aller, ton retour ou une correspondance pour afficher les marges et alertes de planning.</div>';return}
 node.innerHTML='<div class="transport-list">'+legs.map(leg=>{
  const info=arrivalInfo(leg),dep=dateTime(leg.departureDate,leg.departureTime),arr=dateTime(leg.arrivalDate,leg.arrivalTime),facts=[["Départ",dep?dateTimeLabel(dep):"À préciser"],["Arrivée",arr?dateTimeLabel(arr):"À préciser"],["Voie / terminal",leg.platform||"À vérifier"],["Bagages",leg.baggage||"À vérifier"],["Limite d’embarquement",leg.boardingDeadline||"À vérifier"]];
  const when=info.arrivalBy?"Arrivée conseillée au plus tard : "+dateTimeLabel(info.arrivalBy)+". ":"";
  const advice='<div class="arrival-advice"><strong>'+esc(info.advice.title)+'</strong>'+esc(when+info.advice.detail)+'<br><small>'+(info.custom?"Marge personnalisée": "Repère transporteur")+(info.advice.source?" · "+esc(info.advice.source):"")+'</small>'+(info.advice.url?'<br><a href="'+esc(info.advice.url)+'" target="_blank" rel="noopener noreferrer">Consigne officielle ↗</a>':"")+'</div>';
  const pauses=leg.mode==="car"&&Number(leg.drivingDurationMinutes)>120?'<div class="transport-warning">Trajet long : prévois une pause au moins toutes les 2 heures et dès les premiers signes de fatigue. '+(leg.plannedStops?"Pauses planifiées : "+esc(leg.plannedStops)+".":"")+'</div>':"";
  return '<article class="transport-card"><div class="transport-card-head"><div class="transport-mode"><span class="transport-mode-icon">'+(icons[leg.mode]||"↗")+'</span><span><strong>'+esc(directionName[leg.direction]||"Trajet")+' · '+esc(modeName[leg.mode]||"Transport")+'</strong><small>'+esc(leg.operator||"Transporteur à préciser")+(leg.service?" · "+esc(leg.service):"")+(leg.number?" · "+esc(leg.number):"")+'</small></span></div><span class="status-pill">À vérifier</span></div><div class="transport-route"><div class="transport-stop"><strong>'+esc(leg.origin||"Départ")+'</strong><small>'+esc(leg.departureDate?dateLabel(leg.departureDate):"Date à préciser")+' · '+esc(leg.departureTime||"—")+'</small></div><span class="transport-line">→</span><div class="transport-stop"><strong>'+esc(leg.destination||"Arrivée")+'</strong><small>'+esc(leg.arrivalDate?dateLabel(leg.arrivalDate):"Date à préciser")+' · '+esc(leg.arrivalTime||"—")+'</small></div></div><div class="transport-facts">'+facts.map(f=>'<div class="transport-fact"><small>'+esc(f[0])+'</small><strong>'+esc(f[1])+'</strong></div>').join("")+'</div>'+advice+pauses+(leg.notes?'<div class="stay-notes">'+esc(leg.notes)+'</div>':"")+'<div class="inline-links">'+(leg.ticketUrl?'<a href="'+esc(leg.ticketUrl)+'" target="_blank" rel="noopener noreferrer">Ouvrir le billet / transporteur ↗</a>':"")+'<a href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent((leg.origin||"")+" "+(leg.destination||""))+'" target="_blank" rel="noopener noreferrer">Voir le trajet ↗</a></div><div class="transport-actions"><button type="button" data-action="edit-transport" data-id="'+esc(leg.id)+'">Modifier</button><button type="button" data-action="delete-transport" data-id="'+esc(leg.id)+'">Supprimer</button></div></article>';
 }).join("")+'</div>';
 const warnings=getWarnings(t);if(warnings.length)node.innerHTML+='<div class="transport-warnings">'+warnings.map(w=>'<div class="transport-warning">⚠ '+esc(w)+'</div>').join("")+'</div>';
}
function renderActivities(t){
 const items=(t.activities||[]).slice().sort((a,b)=>((a.date||"9999-99-99")+" "+(a.startTime||"99:99")).localeCompare((b.date||"9999-99-99")+" "+(b.startTime||"99:99"))),done=items.filter(a=>a.done).length;
 $("#itinerary-summary").innerHTML='<span class="summary-chip">'+items.length+' activité(s)</span><span class="summary-chip">'+done+' faite(s)</span><span class="summary-chip">'+items.filter(a=>a.bookingRequired&&!a.done).length+' réservation(s) à vérifier</span>';
 if(!items.length){$("#activities-list").innerHTML='<div class="empty-inline">Ton programme est encore vierge.<br>Ajoute un lieu ou demande à PIMI de préparer une étape.</div>';return}
 $("#activities-list").innerHTML=items.map((a)=>{
  const d=a.date?new Date(a.date+"T12:00:00"):null,day=d?new Intl.DateTimeFormat("fr-FR",{day:"2-digit"}).format(d):"—",month=d?new Intl.DateTimeFormat("fr-FR",{month:"short"}).format(d).replace(".",""):"à fixer";
  const priority=a.priority==="must"?"Prioritaire":a.priority==="low"?"Option":"À voir",cls=a.priority==="must"?"":a.priority==="low"?"low":"medium";
  return '<div class="activity-row '+(a.done?"is-complete":"")+'"><label class="activity-check" title="Marquer comme faite"><input type="checkbox" data-action="toggle-activity" data-id="'+esc(a.id)+'" '+(a.done?"checked":"")+' aria-label="Activité faite : '+esc(a.name)+'"></label><span class="activity-date"><strong>'+day+'</strong><small>'+esc(month)+'</small></span><button class="activity-info" type="button" data-action="activity-detail" data-id="'+esc(a.id)+'"><strong>'+esc(a.name)+'</strong><small>'+esc(a.category||"Visite")+' · '+esc(a.startTime||"Horaire libre")+(a.duration?" · "+esc(a.duration)+" min":"")+'</small></button><span class="activity-end">'+(a.done?'<span class="completion-tag">Faite ✓</span>':'<span class="priority '+cls+'">'+priority+'</span>')+'<span>↗</span></span></div>';
 }).join("");
}
function renderBudget(t){
 const total=(t.expenses||[]).reduce((s,x)=>s+Number(x.amount||0),0),budget=Number(t.budget||0),pct=budget>0?Math.min(100,Math.round(total/budget*100)):0;
 $("#budget-content").innerHTML='<div class="budget-top"><div><div class="budget-spent">'+money(total,t.currency)+'</div><div class="budget-cap">Dépensé'+(budget>0?" sur "+money(budget,t.currency):"")+'</div></div><div class="budget-cap">'+(budget>0?pct+" % du budget":"Budget non défini")+'</div></div><div class="budget-track"><div class="budget-fill" style="width:'+pct+'%"></div></div><div class="expense-list">'+((t.expenses||[]).slice(-4).reverse().map(x=>'<div class="expense-row"><span>'+esc(x.label)+' <small>'+esc(x.category||"Divers")+'</small></span><strong>'+money(x.amount,t.currency)+'</strong></div>').join("")||'<div class="empty-inline">Aucune dépense enregistrée.</div>')+'</div>';
}
function renderChecklist(t){
 const list=t.checklist||[],done=list.filter(x=>x.done).length;$("#check-progress").textContent=done+" / "+list.length;
 $("#checklist-content").innerHTML=list.map(x=>'<label class="check-row '+(x.done?"done":"")+'"><input type="checkbox" data-action="toggle-check" data-id="'+esc(x.id)+'" '+(x.done?"checked":"")+'><span>'+esc(x.label)+'</span></label>').join("")||'<div class="empty-inline">Aucune tâche.</div>';
}
function renderMap(t){
 if(!window.L){setTimeout(()=>{if(window.L&&activeTrip())renderMap(activeTrip())},350);return}
 const center=t.geo?[t.geo.lat,t.geo.lon]:[20,0];
 if(!map){map=L.map("map",{scrollWheelZoom:false}).setView(center,t.geo?12:2);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);markers=L.layerGroup().addTo(map)}
 if(mapTripId!==t.id){mapTripId=t.id;map.setView(center,t.geo?12:2)}markers.clearLayers();
 if(t.geo){const icon=L.divIcon({className:"",html:'<div class="pimi-map-pin destination"><span>✦</span></div>',iconSize:[28,28],iconAnchor:[13,26]});L.marker(center,{icon}).addTo(markers).bindPopup("<strong>"+esc(t.destination)+"</strong><br>Destination")}
 if(t.accommodation&&t.accommodation.geo){const g=t.accommodation.geo,icon=L.divIcon({className:"",html:'<div class="pimi-map-pin" style="background:#b4d58a"><span>⌂</span></div>',iconSize:[28,28],iconAnchor:[13,26]});L.marker([g.lat,g.lon],{icon}).addTo(markers).bindPopup("<strong>"+esc(t.accommodation.name)+"</strong><br>Hébergement")}
 const points=[];(t.activities||[]).forEach((a,i)=>{if(!a.geo)return;const p=[a.geo.lat,a.geo.lon];points.push(p);const icon=L.divIcon({className:"",html:'<div class="pimi-map-pin"><span>'+(i+1)+'</span></div>',iconSize:[28,28],iconAnchor:[13,26]});L.marker(p,{icon}).addTo(markers).bindPopup("<strong>"+esc(a.name)+"</strong><br>"+esc(a.date?dateLabel(a.date):"Date à définir"))});
 if(points.length>1)L.polyline(points,{color:"#ed78c5",weight:2,opacity:.62,dashArray:"5 7"}).addTo(markers);
 setTimeout(()=>map.invalidateSize(),100);
}
function fitMap(){if(!map)return;const layers=markers?markers.getLayers():[];if(layers.length>1)map.fitBounds(L.featureGroup(layers).getBounds().pad(.18),{maxZoom:14});else if(activeTrip()&&activeTrip().geo)map.setView([activeTrip().geo.lat,activeTrip().geo.lon],13)}
async function geocode(query){if(!query)return null;const r=await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q="+encodeURIComponent(query),{headers:{"Accept-Language":"fr"}});if(!r.ok)throw new Error("Géolocalisation indisponible");const rows=await r.json();if(!rows.length)return null;return{lat:Number(rows[0].lat),lon:Number(rows[0].lon),label:rows[0].display_name}}
async function fetchDestination(t){const id=t.id,q=t.destination;try{const g=await geocode(q);if(activeTrip()&&activeTrip().id===id&&g){t.geo=g;save();renderMap(t);fetchWeather(t)}}catch(e){if(activeTrip()&&activeTrip().id===id)renderMap(t)}}
async function geocodeStay(){const t=activeTrip(),s=t&&t.accommodation;if(!t||!s||!s.address)return;try{const g=await geocode(s.address);if(g&&activeTrip()&&activeTrip().id===t.id){s.geo=g;save();renderMap(t)}}catch(e){}}
const weatherText=c=>({0:"Ciel dégagé",1:"Plutôt dégagé",2:"Partiellement nuageux",3:"Couvert",45:"Brouillard",48:"Brouillard givrant",51:"Bruine légère",53:"Bruine",55:"Bruine dense",61:"Pluie faible",63:"Pluie",65:"Forte pluie",71:"Neige faible",73:"Neige",75:"Forte neige",80:"Averses",81:"Averses",82:"Fortes averses",95:"Orage",96:"Orage et grêle",99:"Orage violent"}[c]||"Conditions variables");
const weatherIcon=c=>c===0?"☀":c<=3?"⛅":c<=48?"☁":c<=67?"🌧":c<=77?"❄":c<=82?"🌦":"⛈";
async function fetchWeather(t){const id=++weatherRequest;weatherData=null;weatherError="";if(!t.geo)return;try{const url="https://api.open-meteo.com/v1/forecast?latitude="+t.geo.lat+"&longitude="+t.geo.lon+"&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=5&timezone=auto",r=await fetch(url);if(!r.ok)throw new Error("Prévisions indisponibles");const d=await r.json();if(id!==weatherRequest)return;weatherData={tripId:t.id,data:d};renderWeather()}catch(e){weatherError="La météo n’est pas disponible.";renderWeather()}}
function renderWeather(){const n=$("#weather-content");if(weatherError){n.textContent=weatherError;return}if(!weatherData){n.innerHTML='<span class="loading-spinner"></span><span>Recherche de la météo…</span>';return}const c=weatherData.data.current,d=weatherData.data.daily;n.innerHTML='<div class="weather-temp">'+Math.round(c.temperature_2m)+'°</div><div class="weather-copy"><strong>'+weatherIcon(c.weather_code)+' '+weatherText(c.weather_code)+'</strong><small>Ressenti '+Math.round(c.apparent_temperature)+'° · Vent '+Math.round(c.wind_speed_10m)+' km/h</small><small>Humidité '+c.relative_humidity_2m+' %</small></div><div class="weather-days">'+d.time.map((x,i)=>'<div class="weather-day"><span>'+["Auj.","Dem.","J+2","J+3","J+4"][i]+'</span><strong>'+weatherIcon(d.weather_code[i])+'</strong><span>'+Math.round(d.temperature_2m_min[i])+'° / '+Math.round(d.temperature_2m_max[i])+'°</span></div>').join("")+'</div>'}
function openModal(title,subtitle,body){modalRoot.innerHTML='<div class="modal-overlay" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><div class="modal-head"><div><h2>'+esc(title)+'</h2><p>'+esc(subtitle||"")+'</p></div><button class="modal-close" type="button" data-action="close-modal">×</button></div>'+body+'</section></div>';const first=$("input,textarea,select,button",modalRoot);if(first)first.focus({preventScroll:true})}
function closeModal(){modalRoot.innerHTML=""}
function tripForm(t){
 const x=t||{},body='<form id="trip-form"><input type="hidden" name="id" value="'+esc(x.id||"")+'"><div class="form-grid"><div class="field full"><label>DESTINATION</label><input name="destination" required placeholder="Ex. : Athènes, Grèce" value="'+esc(x.destination||"")+'"></div><div class="field"><label>DATE DE DÉPART</label><input type="date" name="startDate" value="'+esc(x.startDate||today())+'"></div><div class="field"><label>DATE DE RETOUR</label><input type="date" name="endDate" value="'+esc(x.endDate||"")+'"></div><div class="field"><label>VOYAGEURS</label><input type="number" min="1" max="30" name="people" value="'+esc(x.people||1)+'"></div><div class="field"><label>BUDGET TOTAL</label><input type="number" min="0" step="10" name="budget" value="'+esc(x.budget||"")+'"></div><div class="field"><label>DEVISE</label><select name="currency">'+["EUR","USD","GBP","JPY","CHF","CAD","MAD","THB"].map(c=>'<option '+((x.currency||"EUR")===c?"selected":"")+'>'+c+'</option>').join("")+'</select></div><div class="field full"><label>NOTES GÉNÉRALES</label><textarea name="notes">'+esc(x.notes||"")+'</textarea></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">Annuler</button><button class="primary-button" type="submit">Enregistrer</button></div></form>';
 openModal(t?"Modifier le voyage":"Créer un voyage","Les premières informations de ton carnet.",body);
}
function stayForm(){
 const t=activeTrip();if(!t){toast("Crée d’abord un voyage.","error");return}const s=t.accommodation||{};
 const body='<form id="stay-form"><div class="form-grid"><div class="field full"><label>NOM DU LOGEMENT</label><input name="name" required value="'+esc(s.name||"")+'" placeholder="Hôtel, appartement, maison…"></div><div class="field"><label>TYPE</label><select name="type">'+["Hôtel","Appartement","Location","Auberge","Chez des proches","Autre"].map(v=>'<option '+((s.type||"Hôtel")===v?"selected":"")+'>'+v+'</option>').join("")+'</select></div><div class="field"><label>STATUT</label><select name="status">'+["Réservé","À confirmer","Non réservé"].map(v=>'<option '+((s.status||"À confirmer")===v?"selected":"")+'>'+v+'</option>').join("")+'</select></div><div class="field full"><label>ADRESSE COMPLÈTE</label><input name="address" value="'+esc(s.address||"")+'" placeholder="Adresse, ville, pays"></div><div class="field"><label>DATE D’ARRIVÉE</label><input type="date" name="checkInDate" value="'+esc(s.checkInDate||t.startDate||"")+'"></div><div class="field"><label>HEURE DE CHECK-IN</label><input type="time" name="checkInTime" value="'+esc(s.checkInTime||"")+'"></div><div class="field"><label>DATE DE DÉPART</label><input type="date" name="checkOutDate" value="'+esc(s.checkOutDate||t.endDate||"")+'"></div><div class="field"><label>HEURE DE CHECK-OUT</label><input type="time" name="checkOutTime" value="'+esc(s.checkOutTime||"")+'"></div><div class="field"><label>CONTACT / RÉCEPTION</label><input name="contact" value="'+esc(s.contact||"")+'"></div><div class="field"><label>TÉLÉPHONE</label><input name="phone" value="'+esc(s.phone||"")+'"></div><div class="field"><label>PARKING</label><input name="parking" value="'+esc(s.parking||"")+'" placeholder="Inclus, payant, rue…"></div><div class="field"><label>PETIT-DÉJEUNER</label><input name="breakfast" value="'+esc(s.breakfast||"")+'" placeholder="Inclus, horaires…"></div><div class="field full"><label>ÉQUIPEMENTS / SERVICES</label><input name="amenities" value="'+esc(s.amenities||"")+'" placeholder="Wi-Fi, climatisation, cuisine, ascenseur…"></div><div class="field full"><label>ACCÈS / ARRIVÉE</label><textarea name="access">'+esc(s.access||"")+'</textarea></div><div class="field full"><label>CONSIGNES / NOTES</label><textarea name="notes">'+esc(s.notes||"")+'</textarea></div><div class="field full"><label>LIEN DE RÉSERVATION</label><input type="url" name="bookingUrl" value="'+esc(s.bookingUrl||"")+'" placeholder="https://…"></div><div class="field full"><label>CODE DE RÉSERVATION (LOCAL UNIQUEMENT)</label><input name="bookingCode" autocomplete="off" value="'+esc(s.bookingCode||"")+'"><span class="field-help">Reste sur cet appareil. Ne le partage pas dans un dépôt GitHub public.</span></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">Annuler</button><button class="primary-button" type="submit">Enregistrer le logement</button></div></form>';
 openModal("Ton hébergement","Toutes les informations pratiques de ton lieu de séjour.",body);
}
function transportForm(existing){
 const t=activeTrip(),x=existing||{};
 const body='<form id="transport-form"><input type="hidden" name="id" value="'+esc(x.id||"")+'"><div class="form-grid"><div class="field"><label>SENS DU TRAJET</label><select name="direction">'+[["outbound","Aller"],["return","Retour"],["connection","Correspondance"],["other","Autre étape"]].map(v=>'<option value="'+v[0]+'" '+((x.direction||"outbound")===v[0]?"selected":"")+'>'+v[1]+'</option>').join("")+'</select></div><div class="field"><label>MODE</label><select name="mode">'+[["train","Train"],["plane","Avion"],["car","Voiture"],["bus","Bus"],["ferry","Ferry"]].map(v=>'<option value="'+v[0]+'" '+((x.mode||"train")===v[0]?"selected":"")+'>'+v[1]+'</option>').join("")+'</select></div><div class="field full"><label>COMPAGNIE / TRANSPORTEUR</label><input name="operator" value="'+esc(x.operator||"")+'" placeholder="SNCF TGV INOUI, OUIGO, Air France…"></div><div class="field"><label>LIGNE / VOL / SERVICE</label><input name="service" value="'+esc(x.service||"")+'"></div><div class="field"><label>NUMÉRO DE TRAIN / VOL</label><input name="number" value="'+esc(x.number||"")+'"></div><div class="field full"><label>GARE / AÉROPORT / ADRESSE DE DÉPART</label><input name="origin" required value="'+esc(x.origin||"")+'"></div><div class="field full"><label>GARE / AÉROPORT / ADRESSE D’ARRIVÉE</label><input name="destination" required value="'+esc(x.destination||t.destination||"")+'"></div><div class="field"><label>DATE DE DÉPART</label><input type="date" name="departureDate" value="'+esc(x.departureDate||t.startDate||"")+'"></div><div class="field"><label>HEURE DE DÉPART</label><input type="time" name="departureTime" value="'+esc(x.departureTime||"")+'"></div><div class="field"><label>DATE D’ARRIVÉE</label><input type="date" name="arrivalDate" value="'+esc(x.arrivalDate||"")+'"></div><div class="field"><label>HEURE D’ARRIVÉE</label><input type="time" name="arrivalTime" value="'+esc(x.arrivalTime||"")+'"></div><div class="field"><label>VOIE / QUAI / TERMINAL</label><input name="platform" value="'+esc(x.platform||"")+'"></div><div class="field"><label>BAGAGES / DIMENSIONS</label><input name="baggage" value="'+esc(x.baggage||"")+'" placeholder="Cabine, soute, poids…"></div><div class="field"><label>TYPE DE VOL (AIR FRANCE)</label><select name="routeType"><option value="unknown">À préciser</option><option value="domestic" '+(x.routeType==="domestic"?"selected":"")+'>France</option><option value="europe" '+(x.routeType==="europe"?"selected":"")+'>Europe</option><option value="international" '+(x.routeType==="international"?"selected":"")+'>International</option></select></div><div class="field"><label>MARGE D’ARRIVÉE (MIN)</label><input type="number" name="arrivalBufferMinutes" min="0" step="5" value="'+esc(x.arrivalBufferMinutes==null?"":x.arrivalBufferMinutes)+'" placeholder="Auto selon compagnie"></div><div class="field"><label>DURÉE DE CONDUITE (MIN)</label><input type="number" name="drivingDurationMinutes" min="0" step="15" value="'+esc(x.drivingDurationMinutes||"")+'" placeholder="Si voiture"></div><div class="field"><label>PAUSES PRÉVUES</label><input name="plannedStops" value="'+esc(x.plannedStops||"")+'"></div><div class="field full"><label>HEURE LIMITE / FIN D’EMBARQUEMENT</label><input name="boardingDeadline" value="'+esc(x.boardingDeadline||"")+'" placeholder="Ex. : embarquement clos à 08:40"></div><div class="field full"><label>LIEN DU BILLET / DU TRANSPORTEUR</label><input type="url" name="ticketUrl" value="'+esc(x.ticketUrl||"")+'" placeholder="Lien officiel ou espace de réservation"></div><div class="field full"><label>CODE DE RÉSERVATION (LOCAL UNIQUEMENT)</label><input name="bookingRef" autocomplete="off" value="'+esc(x.bookingRef||"")+'"><span class="field-help">Ne copie pas le code, le QR code ou le billet complet dans GitHub public.</span></div><div class="field full"><label>CONSIGNES / CORRESPONDANCE / NOTES</label><textarea name="notes">'+esc(x.notes||"")+'</textarea></div></div><div class="arrival-helper">PEPPER propose une marge uniquement lorsqu’une règle liée au transporteur est identifiable. Le billet et les consignes de la gare / de l’aéroport priment toujours.</div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">Annuler</button><button class="primary-button" type="submit">Enregistrer le trajet</button></div></form>';
 openModal(existing?"Modifier le trajet":"Ajouter un trajet","Renseigne les informations visibles sur ton billet ou ton itinéraire.",body);
}
function activityForm(){
 const t=activeTrip();if(!t){toast("Crée d’abord un voyage.","error");return}
 const body='<form id="activity-form"><div class="form-grid"><div class="field full"><label>NOM DU LIEU / ACTIVITÉ</label><input name="name" required placeholder="Musée, restaurant, balade…"></div><div class="field"><label>CATÉGORIE</label><select name="category">'+["Culture","Architecture","Nature","Restaurant","Sortie","Shopping","Transport","Autre"].map(v=>'<option>'+v+'</option>').join("")+'</select></div><div class="field"><label>DATE</label><input type="date" name="date" min="'+esc(t.startDate||"")+'" max="'+esc(t.endDate||"")+'"></div><div class="field"><label>HEURE</label><input type="time" name="startTime"></div><div class="field"><label>DURÉE (MIN)</label><input type="number" name="duration" min="15" step="15" placeholder="90"></div><div class="field full"><label>ADRESSE / QUARTIER</label><input name="address"></div><div class="field"><label>PRIX ESTIMÉ</label><input type="number" name="price" min="0" step="0.5"></div><div class="field"><label>RÉSERVATION NÉCESSAIRE ?</label><select name="bookingRequired"><option value="false">Non / à vérifier</option><option value="true">Oui</option></select></div><div class="field full"><label>DESCRIPTION / POINTS À RETENIR</label><textarea name="description"></textarea></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">Annuler</button><button class="primary-button" type="submit">Ajouter au programme</button></div></form>';
 openModal("Ajouter une activité","Tu pourras ensuite faire vérifier cette étape avec PIMI dans ChatGPT.",body);
}
function expenseForm(){openModal("Ajouter une dépense","Garde une vision simple du budget.",'<form id="expense-form"><div class="form-grid"><div class="field full"><label>LIBELLÉ</label><input name="label" required></div><div class="field"><label>MONTANT</label><input type="number" name="amount" min="0" step="0.01" required></div><div class="field"><label>CATÉGORIE</label><select name="category">'+["Repas","Transport","Hébergement","Visite","Shopping","Divers"].map(v=>'<option>'+v+'</option>').join("")+'</select></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">Annuler</button><button class="primary-button" type="submit">Ajouter la dépense</button></div></form>')}
function detailModal(id){
 const t=activeTrip(),a=t.activities.find(x=>x.id===id);if(!a)return;
 const bullets=(a.highlights||[]).map(x=>"<li>"+esc(x)+"</li>").join(""),sources=(a.sources||[]).filter(x=>x.url).map(x=>'<li><a href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">'+esc(x.title||x.url)+' ↗</a></li>').join("");
 openModal("Détail de l’étape","Fiche pratique, durée, budget et avancement.",'<div class="detail-hero"><h3>'+esc(a.name)+'</h3><p>'+esc(a.description||"Aucune description disponible.")+'</p></div><div class="detail-grid"><div class="detail-item"><small>Date / heure</small><strong>'+esc(a.date?dateLabel(a.date):"À planifier")+' · '+esc(a.startTime||"Libre")+'</strong></div><div class="detail-item"><small>Durée</small><strong>'+esc(a.duration?a.duration+" min":"À confirmer")+'</strong></div><div class="detail-item"><small>Budget</small><strong>'+esc(a.price!=null?money(a.price,t.currency):"À confirmer")+'</strong></div><div class="detail-item"><small>Priorité</small><strong>'+esc(a.priority==="must"?"Incontournable":a.priority==="low"?"Optionnel":"À évaluer")+'</strong></div><div class="detail-item"><small>Réservation</small><strong>'+(a.bookingRequired?"À réserver / vérifier":"Non indiquée")+'</strong></div><div class="detail-item"><small>Avancement</small><strong>'+(a.done?"Faite ✓":"À faire")+'</strong></div></div>'+(bullets?'<div class="detail-section"><h4>À retenir</h4><ul>'+bullets+'</ul></div>':"")+(sources?'<div class="detail-section"><h4>Sources consultées</h4><ul>'+sources+'</ul></div>':"")+'<div class="detail-section"><h4>Localisation</h4><p>'+esc(a.address||"Adresse à préciser")+'</p><a class="text-button" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent((a.address||a.name)+" "+t.destination)+'" target="_blank" rel="noopener noreferrer">Ouvrir dans Maps ↗</a></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="delete-activity" data-id="'+esc(a.id)+'">Supprimer</button><button class="primary-button" type="button" data-action="close-modal">Terminé</button></div>');
}
function saveTripForm(form){
 const d=Object.fromEntries(new FormData(form).entries());if(d.startDate&&d.endDate&&d.endDate<d.startDate){toast("La date de retour doit suivre celle de départ.","error");return}
 let t=state.trips.find(x=>x.id===d.id);if(!t){t={id:uid(),activities:[],transport:[],expenses:[],checklist:DEFAULT_CHECKLIST.map(label=>({id:uid(),label,done:false})),accommodation:null,createdAt:new Date().toISOString()};state.trips.push(t)}
 Object.assign(t,{destination:d.destination.trim(),startDate:d.startDate,endDate:d.endDate,people:Number(d.people||1),budget:Number(d.budget||0),currency:d.currency||"EUR",notes:d.notes||""});
 state.activeTripId=t.id;weatherData=null;save();closeModal();render();toast("Voyage enregistré sur cet appareil.");
}
function saveStay(form){
 const d=Object.fromEntries(new FormData(form).entries()),t=activeTrip(),old=t.accommodation||{};
 t.accommodation={id:old.id||uid(),name:d.name.trim(),type:d.type,status:d.status,address:d.address,checkInDate:d.checkInDate,checkInTime:d.checkInTime,checkOutDate:d.checkOutDate,checkOutTime:d.checkOutTime,contact:d.contact,phone:d.phone,parking:d.parking,breakfast:d.breakfast,amenities:d.amenities,access:d.access,notes:d.notes,bookingUrl:d.bookingUrl,bookingCode:d.bookingCode};
 save();closeModal();render();geocodeStay();toast("Les informations du logement sont enregistrées localement.");
}
function saveLeg(form){
 const d=Object.fromEntries(new FormData(form).entries()),t=activeTrip();if(d.departureDate&&d.arrivalDate&&d.arrivalDate<d.departureDate){toast("L’arrivée ne peut pas précéder le départ.","error");return}
 let x=t.transport.find(a=>a.id===d.id);if(!x){x={id:uid()};t.transport.push(x)}
 Object.assign(x,{direction:d.direction,mode:d.mode,operator:d.operator,service:d.service,number:d.number,origin:d.origin,destination:d.destination,departureDate:d.departureDate,departureTime:d.departureTime,arrivalDate:d.arrivalDate,arrivalTime:d.arrivalTime,platform:d.platform,baggage:d.baggage,routeType:d.routeType,arrivalBufferMinutes:d.arrivalBufferMinutes===""?null:Number(d.arrivalBufferMinutes),drivingDurationMinutes:d.drivingDurationMinutes===""?null:Number(d.drivingDurationMinutes),plannedStops:d.plannedStops,boardingDeadline:d.boardingDeadline,ticketUrl:d.ticketUrl,bookingRef:d.bookingRef,notes:d.notes});
 save();closeModal();render();toast("Trajet enregistré. Vérifie la marge et les alertes de cohérence.");
}
async function addActivity(form){
 const d=Object.fromEntries(new FormData(form).entries()),t=activeTrip(),a={id:uid(),name:d.name.trim(),category:d.category,date:d.date,startTime:d.startTime,duration:d.duration?Number(d.duration):null,address:d.address,description:d.description,price:d.price===""?null:Number(d.price),bookingRequired:d.bookingRequired==="true",priority:"medium",done:false,status:"À organiser",highlights:[],createdAt:new Date().toISOString()};
 t.activities.push(a);save();closeModal();render();toast("Activité ajoutée au programme.");
 if(a.address)try{const g=await geocode(a.address+", "+t.destination);if(g){a.geo=g;save();renderMap(t)}}catch(e){}
}
function addExpense(form){const d=Object.fromEntries(new FormData(form).entries()),t=activeTrip();t.expenses.push({id:uid(),label:d.label.trim(),amount:Number(d.amount),category:d.category,date:today()});save();closeModal();renderBudget(t);toast("Dépense ajoutée.")}
function deleteActivity(id){const t=activeTrip();t.activities=t.activities.filter(a=>a.id!==id);save();closeModal();render();toast("Activité supprimée.")}
function deleteTransport(id){const t=activeTrip();t.transport=t.transport.filter(a=>a.id!==id);save();render();toast("Trajet supprimé.")}
function markActivity(event){
 const t=activeTrip(),a=t&&t.activities.find(x=>x.id===event.target.dataset.id);if(!a)return;a.done=event.target.checked;a.completedAt=a.done?new Date().toISOString():null;save();renderActivities(t);toast(a.done?"Activité cochée comme faite. Sauvegardée sur cet appareil.":"Activité remise dans les étapes à faire.");
}
function markChecklist(event){const t=activeTrip(),item=t&&t.checklist.find(x=>x.id===event.target.dataset.id);if(!item)return;item.done=event.target.checked;save();renderChecklist(t)}
function addChecklist(){const label=prompt("Quelle tâche veux-tu ajouter à ta checklist ?");if(!label||!label.trim())return;const t=activeTrip();t.checklist.push({id:uid(),label:label.trim(),done:false});save();renderChecklist(t)}
function slug(v){return String(v||"voyage").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"voyage"}
function download(content,name,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
function exportJSON(){const t=activeTrip();if(t)download(JSON.stringify(t,null,2),slug(t.destination)+"-pepper.json","application/json")}
function exportICS(){
 const t=activeTrip();if(!t)return;const pad=n=>String(n).padStart(2,"0"),stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
 const events=t.activities.filter(a=>a.date).map(a=>{
  const start=a.date.replace(/-/g,"")+"T"+(a.startTime?a.startTime.replace(":",""):"0900")+"00",endD=new Date(a.date+"T"+(a.startTime||"09:00")+":00");endD.setMinutes(endD.getMinutes()+Number(a.duration||60));
  const end=endD.getFullYear()+pad(endD.getMonth()+1)+pad(endD.getDate())+"T"+pad(endD.getHours())+pad(endD.getMinutes())+"00",clean=v=>String(v||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n");
  return"BEGIN:VEVENT\r\nUID:"+a.id+"@pepper\r\nDTSTAMP:"+stamp+"\r\nDTSTART:"+start+"\r\nDTEND:"+end+"\r\nSUMMARY:"+clean(a.name)+"\r\nLOCATION:"+clean(a.address||t.destination)+"\r\nDESCRIPTION:"+clean(a.description)+"\r\nEND:VEVENT";
 }).join("\r\n");download("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//PEPPER//Travel Companion//FR\r\nCALSCALE:GREGORIAN\r\n"+events+"\r\nEND:VCALENDAR",slug(t.destination)+"-pepper.ics","text/calendar;charset=utf-8");
}
function shareContext(t){
 return{
  destination:t.destination,dates:{start:t.startDate,end:t.endDate},travellers:t.people,budget:t.budget,currency:t.currency,
  accommodation:t.accommodation?{name:t.accommodation.name,type:t.accommodation.type,address:t.accommodation.address,checkInDate:t.accommodation.checkInDate,checkInTime:t.accommodation.checkInTime,checkOutDate:t.accommodation.checkOutDate,checkOutTime:t.accommodation.checkOutTime,amenities:t.accommodation.amenities,parking:t.accommodation.parking,breakfast:t.accommodation.breakfast,bookingUrl:t.accommodation.bookingUrl}:null,
  transport:t.transport.map(x=>({direction:x.direction,mode:x.mode,operator:x.operator,service:x.service,number:x.number,origin:x.origin,destination:x.destination,departureDate:x.departureDate,departureTime:x.departureTime,arrivalDate:x.arrivalDate,arrivalTime:x.arrivalTime,platform:x.platform,baggage:x.baggage,routeType:x.routeType,arrivalBufferMinutes:x.arrivalBufferMinutes,drivingDurationMinutes:x.drivingDurationMinutes,plannedStops:x.plannedStops,boardingDeadline:x.boardingDeadline,notes:x.notes})),
  activities:t.activities.map(x=>({name:x.name,category:x.category,date:x.date,startTime:x.startTime,duration:x.duration,address:x.address,description:x.description,priority:x.priority,done:!!x.done,bookingRequired:x.bookingRequired,price:x.price})),
  checklist:t.checklist.map(x=>({label:x.label,done:!!x.done}))
 };
}
async function copyText(value){
 try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(value);return true}}catch(e){}
 const field=document.createElement("textarea");field.value=value;field.style.position="fixed";field.style.opacity="0";document.body.appendChild(field);field.select();let ok=false;try{ok=document.execCommand("copy")}catch(e){}field.remove();return ok;
}
async function copyContext(){
 const t=activeTrip();if(!t)return;
 const value="Voici le contexte actuel de mon voyage dans PEPPER. Vérifie les règles sur les sites officiels, contrôle la cohérence des horaires et pose-moi les questions manquantes.\n\n"+JSON.stringify(shareContext(t),null,2)+"\n\nLes codes de réservation, billets complets, QR codes, téléphones et instructions d’accès privées ne sont pas inclus.";
 if(await copyText(value))toast("Contexte copié. Colle-le dans cette conversation ChatGPT.");else toast("Copie impossible. Exporte le JSON et partage seulement les informations utiles.","error");
}
async function copyRequest(event){
 if(event)event.preventDefault();const t=activeTrip(),idea=$("#idea-input").value.trim();if(!t)return;
 if(!idea){await copyContext();return}
 const value="PIMI, voici une nouvelle demande pour mon voyage. Vérifie les informations officielles à jour, les horaires, les réservations, les temps de déplacement et la cohérence avec mon hébergement et mes trajets. Pose-moi les questions manquantes avant de l’intégrer. Si une mise à jour du code de l’application est nécessaire, modifie le projet GitHub sans publier de données privées.\n\nCONTEXTE :\n"+JSON.stringify(shareContext(t),null,2)+"\n\nNOUVELLE IDÉE / INFORMATION :\n"+idea;
 if(await copyText(value)){toast("Demande copiée. Colle-la dans cette conversation pour que PIMI puisse la traiter.");$("#idea-input").value=""}else toast("Copie impossible. Sélectionne et copie le texte manuellement.","error");
}
function onAction(event){
 const el=event.target.closest("[data-action]");if(!el)return;const n=el.dataset.action,id=el.dataset.id;
 if(n==="close-modal"){if(event.target===el||el.matches("button"))closeModal();return}
 if(n==="create-trip"){tripForm(null);return}if(n==="edit-trip"){tripForm(activeTrip());return}
 if(n==="edit-accommodation"){stayForm();return}if(n==="add-transport"){transportForm(null);return}
 if(n==="edit-transport"){transportForm(activeTrip().transport.find(x=>x.id===id));return}if(n==="delete-transport"){if(confirm("Supprimer ce trajet ?"))deleteTransport(id);return}
 if(n==="add-activity"){activityForm();return}if(n==="add-expense"){expenseForm();return}
 if(n==="activity-detail"){detailModal(id);return}if(n==="delete-activity"){if(confirm("Supprimer cette activité ?"))deleteActivity(id);return}
 if(n==="fit-map"){fitMap();return}if(n==="export-ics"){exportICS();return}if(n==="export-json"){exportJSON();return}
 if(n==="add-check"){addChecklist();return}if(n==="copy-trip-context"){copyContext();return}if(n==="copy-pimi-request"){copyRequest();return}
}
document.addEventListener("click",onAction);
document.addEventListener("change",e=>{
 if(e.target.id==="trip-switcher"){state.activeTripId=e.target.value;weatherData=null;weatherError="";save();render()}
 if(e.target.matches('[data-action="toggle-activity"]'))markActivity(e);
 if(e.target.matches('[data-action="toggle-check"]'))markChecklist(e);
});
document.addEventListener("submit",e=>{
 const f=e.target;
 if(f.id==="trip-form"){e.preventDefault();saveTripForm(f)}
 if(f.id==="stay-form"){e.preventDefault();saveStay(f)}
 if(f.id==="transport-form"){e.preventDefault();saveLeg(f)}
 if(f.id==="activity-form"){e.preventDefault();addActivity(f)}
 if(f.id==="expense-form"){e.preventDefault();addExpense(f)}
 if(f.id==="idea-form")copyRequest(e);
});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});
$$("[data-scroll]").forEach(b=>b.addEventListener("click",()=>{const id=b.dataset.scroll,node=id==="assistant-panel"?$(".assistant-panel"):$("#"+id);if(node)node.scrollIntoView({behavior:"smooth",block:"start"})}));
function initialise(){if(state.trips.length&&!state.activeTripId)state.activeTripId=state.trips[0].id;save();render();if("serviceWorker" in navigator)navigator.serviceWorker.register("./service-worker.js").catch(()=>{})}
initialise();