const STORAGE_KEY="pimientos-state-v1";
const DEFAULT_CHECKLIST=["Vérifier les papiers d’identité et les visas","Confirmer les transports et l’hébergement","Vérifier les conditions d’entrée et l’assurance","Prévoir les moyens de paiement","Télécharger les billets et documents hors ligne"];
const $=(s,root=document)=>root.querySelector(s),$$=(s,root=document)=>Array.from(root.querySelectorAll(s));
const safeParse=(v,f)=>{try{return JSON.parse(v)}catch(e){return f}};
const uid=()=>"pimi-"+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const dateLabel=v=>v?new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"short",year:"numeric"}).format(new Date(v+"T12:00:00")):"Date à définir";
const money=(n,c)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:c||"EUR",maximumFractionDigits:0}).format(Number(n||0));
let state=safeParse(localStorage.getItem(STORAGE_KEY),null)||{trips:[],activeTripId:null,settings:{aiEndpoint:""}};
let map=null,markers=null,mapTripId=null,weatherData=null,weatherError="",weatherReq=0,aiMessages=[],aiDraft=null,aiAssessment=null,aiBusy=false;
const modalRoot=$("#modal-root");
function activeTrip(){return state.trips.find(t=>t.id===state.activeTripId)||state.trips[0]||null}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch(e){notify("Stockage local saturé : exporte tes données pour les sauvegarder.","error")}}
function notify(message,type=""){const n=document.createElement("div");n.className="toast "+type;n.textContent=message;$("#toast-root").appendChild(n);setTimeout(()=>n.remove(),4300)}
function mergeTrips(a,b){const m=new Map();[...(a||[]),...(b||[])].forEach(t=>{if(t&&t.id)m.set(t.id,t)});return Array.from(m.values())}
function render(){
 const trip=activeTrip();$("#empty-state").hidden=!!trip;$("#trip-workspace").hidden=!trip;if(!trip)return;
 $("#trip-destination").textContent=trip.destination||trip.name||"Ton voyage";
 $("#trip-dates").textContent=trip.startDate?dateLabel(trip.startDate)+(trip.endDate?" — "+dateLabel(trip.endDate):""):"Dates à définir";
 $("#trip-travellers").textContent=(trip.people||1)+((trip.people||1)===1?" voyageur":" voyageurs");
 const start=trip.startDate?new Date(trip.startDate+"T00:00:00"):null,end=trip.endDate?new Date(trip.endDate+"T23:59:59"):null,now=new Date();
 $("#trip-status").textContent=!start?"À organiser":start>now?"À venir":end&&end<now?"Terminé":"En cours";
 if(start){const days=Math.ceil((start-new Date(today()+"T00:00:00"))/86400000);$("#trip-countdown").textContent=days>1?"J - "+days:days===1?"Départ demain":days===0?"C’est le départ !":"Voyage passé"}else $("#trip-countdown").textContent="Dates à définir";
 $("#trip-switcher").innerHTML=state.trips.map(t=>'<option value="'+esc(t.id)+'" '+(t.id===trip.id?"selected":"")+'>'+esc(t.destination||t.name)+'</option>').join("");
 $("#map-location-label").textContent=trip.destination||"Destination";
 const q=encodeURIComponent(trip.destination||"");
 $("#link-google-maps").href="https://www.google.com/maps/search/?api=1&query="+q;
 $("#link-apple-maps").href="https://maps.apple.com/?q="+q;
 $("#link-waze").href="https://www.waze.com/ul?q="+q+"&navigate=yes";
 $("#link-fuel").href="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent("station-service carburant "+(trip.destination||""));
 renderActivities(trip);renderBudget(trip);renderChecklist(trip);renderAI();
 if(!trip.geo&&trip.destination)fetchDestinationData(trip);
 else{renderMap(trip);if(!weatherData||weatherData.tripId!==trip.id)fetchWeather(trip)}
}
function renderActivities(trip){
 const items=(trip.activities||[]).slice().sort((a,b)=>((a.date||"9999-99-99")+" "+(a.startTime||"99:99")).localeCompare((b.date||"9999-99-99")+" "+(b.startTime||"99:99")));
 $("#itinerary-summary").innerHTML='<span class="summary-chip">'+items.length+' activité'+(items.length>1?"s":"")+'</span><span class="summary-chip">'+items.filter(i=>i.date).length+' planifiée(s)</span><span class="summary-chip">'+items.filter(i=>i.bookingRequired).length+' réservation(s) à anticiper</span>';
 if(!items.length){$("#activities-list").innerHTML='<div class="empty-inline">Ton programme est encore vierge.<br>Ajoute un lieu ou demande à PIMI de préparer une étape.</div>';return}
 $("#activities-list").innerHTML=items.map(i=>{
  const d=i.date?new Date(i.date+"T12:00:00"):null,day=d?new Intl.DateTimeFormat("fr-FR",{day:"2-digit"}).format(d):"—",month=d?new Intl.DateTimeFormat("fr-FR",{month:"short"}).format(d).replace(".",""):"à fixer";
  const label=i.priority==="must"?"Prioritaire":i.priority==="low"?"Option":"À voir",cls=i.priority==="must"?"":i.priority==="low"?"low":"medium";
  return '<button class="activity-row" type="button" data-action="activity-detail" data-id="'+esc(i.id)+'"><span class="activity-date"><strong>'+day+'</strong><small>'+esc(month)+'</small></span><span class="activity-info"><strong>'+esc(i.name)+'</strong><small>'+esc(i.category||"Visite")+' · '+esc(i.startTime||"Horaire libre")+(i.duration?" · "+esc(i.duration)+" min":"")+'</small></span><span class="activity-end"><span class="priority '+cls+'">'+label+'</span><span>↗</span></span></button>'
 }).join("");
}
function renderBudget(trip){
 const total=(trip.expenses||[]).reduce((s,i)=>s+Number(i.amount||0),0),budget=Number(trip.budget||0),pct=budget>0?Math.min(100,Math.round(total/budget*100)):0;
 $("#budget-content").innerHTML='<div class="budget-top"><div><div class="budget-spent">'+money(total,trip.currency)+'</div><div class="budget-cap">Dépensé'+(budget>0?" sur "+money(budget,trip.currency):"")+'</div></div><div class="budget-cap">'+(budget>0?pct+" % du budget":"Budget non défini")+'</div></div><div class="budget-track"><div class="budget-fill" style="width:'+pct+'%"></div></div><div class="expense-list">'+((trip.expenses||[]).slice(-4).reverse().map(i=>'<div class="expense-row"><span>'+esc(i.label)+' <small>'+esc(i.category||"Divers")+'</small></span><strong>'+money(i.amount,trip.currency)+'</strong></div>').join("")||'<div class="empty-inline">Aucune dépense enregistrée pour le moment.</div>')+'</div>';
}
function renderChecklist(trip){
 const list=trip.checklist||[],done=list.filter(i=>i.done).length;$("#check-progress").textContent=done+" / "+list.length;
 $("#checklist-content").innerHTML=list.map(i=>'<label class="check-row '+(i.done?"done":"")+'"><input type="checkbox" data-action="toggle-check" data-id="'+esc(i.id)+'" '+(i.done?"checked":"")+'><span>'+esc(i.label)+'</span></label>').join("")||'<div class="empty-inline">Aucune tâche pour l’instant.</div>';
}
function renderAI(){
 $("#ai-connection-state").textContent=aiBusy?"PIMI réfléchit…":(state.settings&&state.settings.aiEndpoint?"PIMI connecté":"À configurer");
 $("#ai-thread").innerHTML=aiMessages.length?aiMessages.slice(-12).map(m=>'<div class="chat-message '+(m.role==="user"?"user-message":"assistant-message")+'">'+esc(m.content)+'</div>').join(""):'<div class="chat-message assistant-message">Salut ! Donne-moi le nom d’un lieu ou d’une activité. Je vais t’aider à voir si ça vaut le détour et ce qu’il faut prévoir.</div>';
 $("#ai-thread").scrollTop=$("#ai-thread").scrollHeight;
 const p=$("#ai-draft-preview");
 if(aiDraft){const pr=aiAssessment&&aiAssessment.priority?aiAssessment.priority:{},level=pr.level||aiDraft.priority||"À évaluer";p.hidden=false;p.innerHTML='<div class="draft-title">✳ '+esc(aiDraft.name||"Nouvelle activité")+'</div><div class="draft-meta">'+esc(aiDraft.date?dateLabel(aiDraft.date):"Date à définir")+(aiDraft.startTime?" · "+esc(aiDraft.startTime):"")+(aiDraft.duration?" · "+esc(aiDraft.duration)+" min":"")+'<br>'+esc(pr.reason||aiDraft.priorityReason||"")+'<br><strong>Priorité : '+esc(level)+'</strong></div><div class="draft-actions"><button type="button" data-action="add-ai-draft">＋ Ajouter au planning</button><button type="button" data-action="discard-ai-draft">Ignorer</button></div>'}else p.hidden=true;
}
function renderMap(trip){
 if(!window.L){setTimeout(()=>{if(window.L&&activeTrip())renderMap(activeTrip())},350);return}
 const center=trip.geo?[trip.geo.lat,trip.geo.lon]:[20,0];
 if(!map){map=L.map("map",{scrollWheelZoom:false}).setView(center,trip.geo?12:2);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);markers=L.layerGroup().addTo(map)}
 if(mapTripId!==trip.id){mapTripId=trip.id;map.setView(center,trip.geo?12:2)}markers.clearLayers();
 if(trip.geo){const icon=L.divIcon({className:"",html:'<div class="pimi-map-pin destination"><span>✦</span></div>',iconSize:[28,28],iconAnchor:[13,26]});L.marker(center,{icon}).addTo(markers).bindPopup("<strong>"+esc(trip.destination)+"</strong><br>Destination")}
 const points=[];(trip.activities||[]).forEach((i,n)=>{if(!i.geo)return;const point=[Number(i.geo.lat),Number(i.geo.lon)];points.push(point);const icon=L.divIcon({className:"",html:'<div class="pimi-map-pin"><span>'+(n+1)+'</span></div>',iconSize:[28,28],iconAnchor:[13,26]});L.marker(point,{icon}).addTo(markers).bindPopup("<strong>"+esc(i.name)+"</strong><br>"+esc(i.date?dateLabel(i.date):"Date à définir"))});
 if(points.length>1)L.polyline(points,{color:"#ed78c5",weight:2,opacity:.62,dashArray:"5 7"}).addTo(markers);
 setTimeout(()=>map.invalidateSize(),100);
}
function fitMap(){if(!map)return;const layers=markers?markers.getLayers():[];if(layers.length>1)map.fitBounds(L.featureGroup(layers).getBounds().pad(.18),{maxZoom:14});else if(activeTrip()&&activeTrip().geo)map.setView([activeTrip().geo.lat,activeTrip().geo.lon],13)}
async function geocode(query){
 if(!query)return null;const response=await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q="+encodeURIComponent(query),{headers:{"Accept-Language":"fr"}});
 if(!response.ok)throw new Error("Géolocalisation indisponible");const list=await response.json();if(!list.length)return null;return{lat:Number(list[0].lat),lon:Number(list[0].lon),label:list[0].display_name};
}
async function fetchDestinationData(trip){
 const id=trip.id;try{const result=await geocode(trip.destination);if(activeTrip()&&activeTrip().id===id&&result){trip.geo=result;persist();renderMap(trip);fetchWeather(trip)}else if(!result){$("#map-location-label").textContent="Lieu introuvable";renderMap(trip)}}catch(e){$("#map-location-label").textContent="Carte indisponible";renderMap(trip)}
}
const wxLabel=c=>({0:"Ciel dégagé",1:"Plutôt dégagé",2:"Partiellement nuageux",3:"Couvert",45:"Brouillard",48:"Brouillard givrant",51:"Bruine légère",53:"Bruine",55:"Bruine dense",61:"Pluie faible",63:"Pluie",65:"Forte pluie",71:"Neige faible",73:"Neige",75:"Forte neige",80:"Averses",81:"Averses",82:"Fortes averses",95:"Orage",96:"Orage et grêle",99:"Orage violent"}[c]||"Conditions variables");
const wxIcon=c=>c===0?"☀":c<=3?"⛅":c<=48?"☁":c<=67?"🌧":c<=77?"❄":c<=82?"🌦":"⛈";
async function fetchWeather(trip){
 const id=++weatherReq;weatherData=null;weatherError="";if(!trip.geo)return;
 try{const url="https://api.open-meteo.com/v1/forecast?latitude="+trip.geo.lat+"&longitude="+trip.geo.lon+"&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=5&timezone=auto";const r=await fetch(url);if(!r.ok)throw new Error("Météo indisponible");const data=await r.json();if(id!==weatherReq)return;weatherData={tripId:trip.id,data};renderWeather()}catch(e){weatherError="La météo n’est pas disponible pour le moment.";renderWeather()}
}
function renderWeather(){
 const node=$("#weather-content");if(weatherError){node.innerHTML='<span class="chat-message">'+esc(weatherError)+'</span>';return}if(!weatherData){node.innerHTML='<span class="loading-spinner"></span><span>Recherche de la météo…</span>';return}
 const c=weatherData.data.current,d=weatherData.data.daily;node.innerHTML='<div class="weather-temp">'+Math.round(c.temperature_2m)+'°</div><div class="weather-copy"><strong>'+wxIcon(c.weather_code)+' '+wxLabel(c.weather_code)+'</strong><small>Ressenti '+Math.round(c.apparent_temperature)+'° · Vent '+Math.round(c.wind_speed_10m)+' km/h</small><small>Humidité '+c.relative_humidity_2m+' %</small></div><div class="weather-days">'+d.time.map((day,i)=>'<div class="weather-day"><span>'+["Auj.","Dem.","J+2","J+3","J+4"][i]+'</span><strong>'+wxIcon(d.weather_code[i])+'</strong><span>'+Math.round(d.temperature_2m_min[i])+'° / '+Math.round(d.temperature_2m_max[i])+'°</span></div>').join("")+'</div>';
}
function openModal(title,subtitle,body){
 modalRoot.innerHTML='<div class="modal-overlay" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-label="'+esc(title)+'" data-modal-inner><div class="modal-head"><div><h2>'+esc(title)+'</h2><p>'+esc(subtitle||"")+'</p></div><button class="modal-close" type="button" data-action="close-modal" aria-label="Fermer">×</button></div>'+body+'</section></div>';
 const first=$("input,textarea,select,button",modalRoot);if(first)first.focus({preventScroll:true});
}
function closeModal(){modalRoot.innerHTML=""}
function tripForm(trip){
 const t=trip||{},html='<form id="trip-form"><input type="hidden" name="id" value="'+esc(t.id||"")+'"><div class="form-grid"><div class="field full"><label>DESTINATION</label><input name="destination" required placeholder="Ex. : Lisbonne, Portugal" value="'+esc(t.destination||"")+'"></div><div class="field"><label>DATE DE DÉPART</label><input type="date" name="startDate" value="'+esc(t.startDate||today())+'"></div><div class="field"><label>DATE DE RETOUR</label><input type="date" name="endDate" value="'+esc(t.endDate||"")+'"></div><div class="field"><label>VOYAGEURS</label><input type="number" name="people" min="1" max="30" value="'+esc(t.people||1)+'"></div><div class="field"><label>BUDGET TOTAL</label><input type="number" name="budget" min="0" step="10" placeholder="Ex. : 1200" value="'+esc(t.budget||"")+'"></div><div class="field"><label>DEVISE</label><select name="currency">'+["EUR","USD","GBP","JPY","CHF","CAD","MAD","THB"].map(c=>'<option '+((t.currency||"EUR")===c?"selected":"")+'>'+c+'</option>').join("")+'</select></div><div class="field"><label>HÉBERGEMENT (FACULTATIF)</label><input name="accommodation" value="'+esc(t.accommodation||"")+'" placeholder="Hôtel, adresse…"></div><div class="field full"><label>TES NOTES</label><textarea name="notes" placeholder="Ce qu’il faut savoir sur ce voyage…">'+esc(t.notes||"")+'</textarea></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">Annuler</button><button class="primary-button" type="submit">Enregistrer le voyage ↗</button></div></form>';
 openModal(trip?"Modifier le voyage":"Créer un voyage",trip?"Ajuste les informations de départ.":"On pose les premières bases de ton escapade.",html);
}
function activityForm(){
 const t=activeTrip();if(!t){notify("Crée d’abord un voyage.","error");return}
 const html='<form id="activity-form"><div class="form-grid"><div class="field full"><label>NOM DU LIEU / ACTIVITÉ</label><input name="name" required placeholder="Ex. : musée, restaurant, balade…"></div><div class="field"><label>CATÉGORIE</label><select name="category">'+["Culture","Architecture","Nature","Restaurant","Sortie","Shopping","Transport","Autre"].map(v=>'<option>'+v+'</option>').join("")+'</select></div><div class="field"><label>DATE</label><input type="date" name="date" min="'+esc(t.startDate||"")+'" max="'+esc(t.endDate||"")+'"></div><div class="field"><label>HEURE</label><input type="time" name="startTime"></div><div class="field"><label>DURÉE (MINUTES)</label><input type="number" name="duration" min="15" step="15" placeholder="90"></div><div class="field full"><label>ADRESSE / QUARTIER</label><input name="address" placeholder="Pour la placer sur la carte"></div><div class="field"><label>PRIX ESTIMÉ ('+esc(t.currency||"EUR")+')</label><input type="number" name="price" min="0" step="0.5" placeholder="0"></div><div class="field"><label>RÉSERVATION NÉCESSAIRE ?</label><select name="bookingRequired"><option value="false">Non / à vérifier</option><option value="true">Oui</option></select></div><div class="field full"><label>DESCRIPTION / POINTS À RETENIR</label><textarea name="description" placeholder="Pourquoi y aller, ce qu’il faut voir…"></textarea></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">Annuler</button><button class="primary-button" type="submit">Ajouter au programme</button></div></form>';
 openModal("Ajouter une activité","Une étape manuelle, que tu pourras ensuite détailler avec PIMI.",html);
}
function expenseForm(){
 openModal("Ajouter une dépense","Garde une vision simple de ton budget.",'<form id="expense-form"><div class="form-grid"><div class="field full"><label>LIBELLÉ</label><input name="label" required placeholder="Ex. : dîner, métro, musée…"></div><div class="field"><label>MONTANT</label><input type="number" name="amount" required min="0" step="0.01" placeholder="24.50"></div><div class="field"><label>CATÉGORIE</label><select name="category">'+["Repas","Transport","Hébergement","Visite","Shopping","Divers"].map(v=>'<option>'+v+'</option>').join("")+'</select></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">Annuler</button><button class="primary-button" type="submit">Ajouter la dépense</button></div></form>');
}
function settingsForm(){
 const s=state.settings||{};
 openModal("Réglages PIMIENTOS","L’agent IA et la synchronisation GitHub passent par un Worker privé.",'<form id="settings-form"><div class="field"><label>URL DE TON CLOUDFLARE WORKER</label><input name="aiEndpoint" type="url" placeholder="https://pimientos-agent.ton-compte.workers.dev" value="'+esc(s.aiEndpoint||"")+'"><span class="field-help">Laisse vide pour désactiver l’agent IA et la synchronisation distante.</span></div><div class="notice">Sécurité : aucune clé OpenAI ni aucun token GitHub n’est demandé dans cette page. Ils doivent rester dans les secrets Cloudflare Worker. Le README explique le déploiement.</div><div class="field" style="margin-top:14px"><label>DÉPÔT DE SYNCHRONISATION</label><input value="sopp24/SOPP-agents · pimientos/data/trips.json" disabled><span class="field-help">Le Worker est limité à ce dépôt et à ce fichier.</span></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">Fermer</button><button class="primary-button" type="submit">Enregistrer</button></div></form>');
}
function detailModal(id){
 const t=activeTrip(),i=(t.activities||[]).find(a=>a.id===id);if(!i)return;
 const priority=i.priority==="must"?"Prioritaire":i.priority==="low"?"Optionnel":"À évaluer";
 const bullets=(i.highlights||[]).map(v=>"<li>"+esc(v)+"</li>").join("");
 const sources=(i.sources||[]).filter(s=>s.url).map(s=>'<li><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title||s.url)+' ↗</a></li>').join("");
 const url=i.bookingUrl||"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent((i.address||i.name)+" "+t.destination);
 openModal("Détail de l’étape","La fiche pratique de ton activité.",'<div class="detail-hero"><h3>'+esc(i.name)+'</h3><p>'+esc(i.description||"Aucune description ajoutée pour le moment.")+'</p></div><div class="detail-grid"><div class="detail-item"><small>Date & heure</small><strong>'+esc(i.date?dateLabel(i.date):"À planifier")+' · '+esc(i.startTime||"Libre")+'</strong></div><div class="detail-item"><small>Durée estimée</small><strong>'+esc(i.duration?i.duration+" min":"À confirmer")+'</strong></div><div class="detail-item"><small>Budget estimé</small><strong>'+esc(i.price!=null?money(i.price,t.currency):"À confirmer")+'</strong></div><div class="detail-item"><small>Priorité</small><strong>'+priority+'</strong></div><div class="detail-item"><small>Réservation</small><strong>'+(i.bookingRequired?"À réserver / vérifier":"Non indiquée")+'</strong></div><div class="detail-item"><small>Statut</small><strong>'+esc(i.status||"À organiser")+'</strong></div></div>'+(bullets?'<div class="detail-section"><h4>À retenir</h4><ul>'+bullets+'</ul></div>':"")+(sources?'<div class="detail-section"><h4>Sources consultées</h4><ul>'+sources+'</ul></div>':"")+'<div class="detail-section"><h4>Localisation</h4><p>'+esc(i.address||"Adresse à préciser")+'</p><a class="text-button" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Ouvrir dans Maps / réservation ↗</a></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="delete-activity" data-id="'+esc(i.id)+'">Supprimer</button><button class="primary-button" type="button" data-action="close-modal">Terminé</button></div>');
}
function saveTripForm(form){
 const d=Object.fromEntries(new FormData(form).entries());if(d.startDate&&d.endDate&&d.endDate<d.startDate){notify("La date de retour doit suivre la date de départ.","error");return}
 let t=state.trips.find(x=>x.id===d.id);if(!t){t={id:uid(),activities:[],expenses:[],checklist:DEFAULT_CHECKLIST.map(label=>({id:uid(),label,done:false})),createdAt:new Date().toISOString()};state.trips.push(t)}
 Object.assign(t,{name:d.destination.trim(),destination:d.destination.trim(),startDate:d.startDate,endDate:d.endDate,people:Number(d.people||1),budget:Number(d.budget||0),currency:d.currency||"EUR",accommodation:d.accommodation||"",notes:d.notes||""});
 state.activeTripId=t.id;weatherData=null;weatherError="";aiMessages=[];aiDraft=null;persist();closeModal();render();fetchDestinationData(t);notify("Ton voyage est prêt à prendre forme.");
}
async function addManualActivity(form){
 const d=Object.fromEntries(new FormData(form).entries()),t=activeTrip();if(!t)return;
 const item={id:uid(),name:d.name.trim(),category:d.category,date:d.date||"",startTime:d.startTime||"",duration:d.duration?Number(d.duration):null,address:d.address||"",description:d.description||"",price:d.price===""?null:Number(d.price),bookingRequired:d.bookingRequired==="true",priority:"medium",status:"À organiser",highlights:[],createdAt:new Date().toISOString()};
 t.activities.push(item);persist();closeModal();render();notify("Étape ajoutée au programme.");
 if(item.address||t.destination){try{const geo=await geocode((item.address?item.address+", ":"")+t.destination);if(geo){item.geo=geo;persist();renderMap(t)}}catch(e){}}
}
async function addAiDraft(){
 const t=activeTrip();if(!t||!aiDraft)return;const s=aiDraft,p=aiAssessment&&aiAssessment.priority?aiAssessment.priority:{};
 const item={id:uid(),name:s.name||"Nouvelle activité",category:s.category||"Visite",date:s.date||"",startTime:s.startTime||"",duration:s.duration?Number(s.duration):null,address:s.address||"",description:s.description||"",price:s.price==null?null:Number(s.price),bookingRequired:!!s.bookingRequired,bookingUrl:s.bookingUrl||"",priority:p.level||s.priority||"medium",priorityReason:p.reason||s.priorityReason||"",status:s.bookingRequired?"Réservation à vérifier":"À organiser",highlights:s.highlights||[],sources:(aiAssessment&&aiAssessment.evidence)||[],createdAt:new Date().toISOString()};
 t.activities.push(item);aiMessages.push({role:"assistant",content:"C’est ajouté à ton programme. Ouvre la fiche pour retrouver les informations, puis synchronise le voyage dans GitHub."});aiDraft=null;aiAssessment=null;persist();render();notify("L’activité a été ajoutée à ton voyage.");
 if(item.address||t.destination){try{const geo=await geocode((item.address?item.address+", ":"")+t.destination);if(geo){item.geo=geo;persist();renderMap(t)}}catch(e){}}
}
function download(content,name,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
function slug(v){return String(v||"voyage").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"voyage"}
function exportJSON(){const t=activeTrip();if(t)download(JSON.stringify(t,null,2),slug(t.destination)+"-pimientos.json","application/json")}
function exportICS(){
 const t=activeTrip();if(!t)return;const pad=n=>String(n).padStart(2,"0"),stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
 const events=(t.activities||[]).filter(i=>i.date).map(i=>{
  const start=i.date.replace(/-/g,"")+"T"+(i.startTime?i.startTime.replace(":",""):"0900")+"00",endDate=new Date(i.date+"T"+(i.startTime||"09:00")+":00");endDate.setMinutes(endDate.getMinutes()+Number(i.duration||60));
  const end=endDate.getFullYear()+pad(endDate.getMonth()+1)+pad(endDate.getDate())+"T"+pad(endDate.getHours())+pad(endDate.getMinutes())+"00",escI=v=>String(v||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n");
  return "BEGIN:VEVENT\r\nUID:"+i.id+"@pimientos\r\nDTSTAMP:"+stamp+"\r\nDTSTART:"+start+"\r\nDTEND:"+end+"\r\nSUMMARY:"+escI(i.name)+"\r\nLOCATION:"+escI(i.address||t.destination)+"\r\nDESCRIPTION:"+escI(i.description)+"\r\nEND:VEVENT"
 }).join("\r\n");
 download("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//PIMIENTOS//Travel Companion//FR\r\nCALSCALE:GREGORIAN\r\n"+events+"\r\nEND:VCALENDAR",slug(t.destination)+"-pimientos.ics","text/calendar;charset=utf-8");
}
async function syncGitHub(){
 const endpoint=(state.settings&&state.settings.aiEndpoint||"").replace(/\/+$/,"");if(!endpoint){settingsForm();notify("Configure d’abord ton Worker dans les réglages.","error");return}
 const button=$('[data-action="sync"]');if(button){button.disabled=true;button.textContent="↥…"}
 try{const r=await fetch(endpoint+"/api/github-sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tripData:{schemaVersion:1,updatedAt:new Date().toISOString(),trips:state.trips}})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Synchronisation refusée");notify("Voyage enregistré dans GitHub · commit "+String(d.commit||"").slice(0,7));}
 catch(e){notify(e.message||"Worker indisponible. Vérifie son URL et ses secrets.","error")}
 finally{if(button){button.disabled=false;button.textContent="↥"}}
}
function parseAI(text){
 let cleaned=String(text||"").trim(),a=cleaned.indexOf("{"),b=cleaned.lastIndexOf("}");if(a>=0&&b>a)cleaned=cleaned.slice(a,b+1);
 try{return JSON.parse(cleaned)}catch(e){return{message:text||"Je n’ai pas réussi à structurer ma réponse. Peux-tu reformuler ?",status:"questions"}}
}
async function sendAI(event){
 event.preventDefault();const input=$("#ai-input"),message=input.value.trim();if(!message||aiBusy)return;const t=activeTrip();if(!t){notify("Crée d’abord un voyage.","error");return}
 const endpoint=(state.settings&&state.settings.aiEndpoint||"").replace(/\/+$/,"");
 if(!endpoint){aiMessages.push({role:"user",content:message},{role:"assistant",content:"Je suis prête, mais mon moteur IA n’est pas encore connecté. Ouvre Réglages et ajoute l’URL du Cloudflare Worker. Le README explique comment l’installer avec la recherche web et la synchronisation GitHub."});input.value="";renderAI();return}
 aiMessages.push({role:"user",content:message});input.value="";aiBusy=true;renderAI();
 try{const r=await fetch(endpoint+"/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:aiMessages.slice(-12),trip:{destination:t.destination,startDate:t.startDate,endDate:t.endDate,people:t.people,budget:t.budget,currency:t.currency,activities:t.activities},draft:aiDraft,locale:"fr-FR"})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Agent IA indisponible");const parsed=parseAI(d.text||"");aiAssessment=parsed;if(parsed.activity&&parsed.activity.name)aiDraft=parsed.activity;aiMessages.push({role:"assistant",content:parsed.message||d.text||"Voici mon analyse."});}
 catch(e){aiMessages.push({role:"assistant",content:"Je n’ai pas pu joindre le moteur IA : "+e.message+" Vérifie l’URL du Worker et ses secrets."})}
 finally{aiBusy=false;renderAI()}
}
function addChecklist(){
 const label=window.prompt("Quelle tâche veux-tu ajouter à ta checklist ?");if(!label||!label.trim())return;const t=activeTrip();t.checklist.push({id:uid(),label:label.trim(),done:false});persist();renderChecklist(t)
}
function deleteActivity(id){const t=activeTrip();t.activities=t.activities.filter(i=>i.id!==id);persist();closeModal();render();notify("Étape supprimée.")}
function onAction(e){
 const a=e.target.closest("[data-action]");if(!a)return;const n=a.dataset.action,id=a.dataset.id;
 if(n==="close-modal"){if(e.target===a||a.matches("button"))closeModal();return}
 if(n==="create-trip"){tripForm(null);return}if(n==="edit-trip"){tripForm(activeTrip());return}if(n==="settings"){settingsForm();return}
 if(n==="add-activity"){activityForm();return}if(n==="add-expense"){expenseForm();return}if(n==="sync"){syncGitHub();return}
 if(n==="activity-detail"){detailModal(id);return}if(n==="delete-activity"){if(confirm("Supprimer cette activité du voyage ?"))deleteActivity(id);return}
 if(n==="add-ai-draft"){addAiDraft();return}if(n==="discard-ai-draft"){aiDraft=null;aiAssessment=null;renderAI();return}
 if(n==="fit-map"){fitMap();return}if(n==="export-ics"){exportICS();return}if(n==="export-json"){exportJSON();return}if(n==="add-check"){addChecklist();return}
}
document.addEventListener("click",onAction);
document.addEventListener("change",e=>{
 if(e.target.id==="trip-switcher"){state.activeTripId=e.target.value;weatherData=null;weatherError="";aiMessages=[];aiDraft=null;persist();render()}
 if(e.target.matches('[data-action="toggle-check"]')){const t=activeTrip(),item=t&&t.checklist.find(i=>i.id===e.target.dataset.id);if(item){item.done=e.target.checked;persist();renderChecklist(t)}}
});
document.addEventListener("submit",async e=>{
 const f=e.target;if(f.id==="trip-form"){e.preventDefault();saveTripForm(f)}
 if(f.id==="activity-form"){e.preventDefault();await addManualActivity(f)}
 if(f.id==="expense-form"){e.preventDefault();const d=Object.fromEntries(new FormData(f).entries()),t=activeTrip();t.expenses.push({id:uid(),label:d.label.trim(),amount:Number(d.amount),category:d.category,date:today()});persist();closeModal();renderBudget(t);notify("Dépense ajoutée.")}
 if(f.id==="settings-form"){e.preventDefault();const d=Object.fromEntries(new FormData(f).entries());state.settings=state.settings||{};state.settings.aiEndpoint=(d.aiEndpoint||"").trim().replace(/\/+$/,"");persist();closeModal();renderAI();notify("Réglages enregistrés.")}
});
$("#ai-form").addEventListener("submit",sendAI);
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});
$$("[data-scroll]").forEach(button=>button.addEventListener("click",()=>{const id=button.dataset.scroll,node=id==="assistant-panel"?$(".assistant-panel"):$("#"+id);if(node)node.scrollIntoView({behavior:"smooth",block:"start"})}));
async function loadPublishedTrips(){
 try{const r=await fetch("./data/trips.json",{cache:"no-store"});if(!r.ok)return;const d=await r.json();if(!d.trips||!d.trips.length)return;state.trips=mergeTrips(state.trips,d.trips);if(!state.activeTripId&&state.trips.length)state.activeTripId=state.trips[0].id;persist();render()}catch(e){}
}
if("serviceWorker" in navigator)navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
render();loadPublishedTrips();