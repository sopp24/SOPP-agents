const cors=origin=>({"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin"});
const json=(data,status,origin)=>new Response(JSON.stringify(data),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const encode=value=>{const bytes=new TextEncoder().encode(value);let bin="";bytes.forEach(b=>bin+=String.fromCharCode(b));return btoa(bin)};
const decode=value=>{const bin=atob(String(value||"").replace(/\s/g,""));return new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0)))};
const PROMPT=[
"Tu es PIMI, un agent de voyage premium, méthodique, indépendant et francophone.",
"Transforme chaque idée de lieu ou d'activité en étape fiable, réaliste et intégrable au programme.",
"Utilise la recherche web pour vérifier les informations actuelles : horaires, jours d'ouverture, tarifs, réservation, travaux, fermetures temporaires, conditions d'accès, transports et événements. Priorise les sources officielles.",
"Ne présente jamais une estimation comme un fait confirmé. Distingue les faits vérifiés, les estimations et les points à confirmer. Donne des URLs de sources officielles.",
"Comprends d'abord l'intention et le contexte. Pose les questions manquantes de manière ciblée : date, créneau, durée, nombre de personnes, budget, mobilité, contraintes, préférences, billets ou réservation.",
"Vérifie la cohérence géographique et temporelle avec les autres étapes, les temps de déplacement, les marges et les éventuelles incompatibilités.",
"Attribue une priorité : must (incontournable au regard du voyage), medium (intéressant mais non essentiel), low (optionnel). Explique le raisonnement sans flatter systématiquement.",
"Ne prétends jamais avoir réservé ou acheté un billet. Fournis le lien officiel pour le faire.",
"Quand des informations essentielles manquent, status vaut questions. Quand l'étape est suffisamment documentée et intégrable, status vaut ready. Si un lieu est ambigu, demande une précision.",
"Réponds EXCLUSIVEMENT avec un objet JSON valide, sans Markdown, suivant ce schéma :",
"{\\"message\\":\\"réponse en français\\",\\"status\\":\\"questions|ready\\",\\"questions\\":[\\"question suivante\\"],\\"activity\\":{\\"name\\":\\"\\",\\"category\\":\\"\\",\\"date\\":\\"YYYY-MM-DD ou vide\\",\\"startTime\\":\\"HH:MM ou vide\\",\\"duration\\":90,\\"address\\":\\"\\",\\"description\\":\\"\\",\\"highlights\\":[\\"\\],\\"price\\":null,\\"bookingRequired\\":false,\\"bookingUrl\\":\\"\\",\\"priority\\":\\"must|medium|low\\"},\\"priority\\":{\\"level\\":\\"must|medium|low\\",\\"reason\\":\\"\\"},\\"evidence\\":[{\\"title\\":\\"\\",\\"url\\":\\"\\",\\"note\\":\\"\\"}],\\"warnings\\":[\\"\\"]}",
"N'invente jamais une adresse, un prix, une durée officielle, un horaire ou une disponibilité. Si une information n'est pas vérifiable, indique-le clairement."
].join("\\n");
async function assistant(request,env,origin){
 if(!env.OPENAI_API_KEY)return json({error:"Le secret OPENAI_API_KEY n’est pas configuré dans le Worker."},503,origin);
 const body=await request.json(),messages=Array.isArray(body.messages)?body.messages.slice(-12):[];
 const transcript=messages.map(m=>(m.role==="assistant"?"PIMI":"VOYAGEUR")+": "+String(m.content||"")).join("\\n\\n");
 const context="Contexte du voyage : "+JSON.stringify(body.trip||{})+"\\nBrouillon : "+JSON.stringify(body.draft||null)+"\\nLangue : français.";
 const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({
  model:env.OPENAI_MODEL||"gpt-6-astra",reasoning:{effort:env.OPENAI_REASONING_EFFORT||"high"},tools:[{type:"web_search"}],instructions:PROMPT,
  input:context+"\\n\\nConversation :\\n"+transcript+"\\n\\nRéponds maintenant en JSON strict.",max_output_tokens:3500,store:false
 })});
 const result=await r.json();if(!r.ok)return json({error:result.error&&result.error.message||"Erreur du service IA."},r.status,origin);
 const text=(result.output||[]).filter(i=>i.type==="message").flatMap(i=>i.content||[]).filter(i=>i.type==="output_text").map(i=>i.text).join("\\n");
 return text?json({text,model:result.model||env.OPENAI_MODEL||"gpt-6-astra"},200,origin):json({error:"Réponse IA inexploitable."},502,origin);
}
async function githubSync(request,env,origin){
 if(!env.GITHUB_TOKEN)return json({error:"Le secret GITHUB_TOKEN n’est pas configuré dans le Worker."},503,origin);
 const body=await request.json();if(!body.tripData||!Array.isArray(body.tripData.trips))return json({error:"Données de voyage invalides."},400,origin);
 const owner=env.GITHUB_OWNER||"sopp24",repo=env.GITHUB_REPO||"SOPP-agents",branch=env.GITHUB_BRANCH||"main",path=env.PIMIENTOS_DATA_PATH||"pimientos/data/trips.json";
 const api="https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo)+"/contents/"+path.split("/").map(encodeURIComponent).join("/");
 const h={"Authorization":"Bearer "+env.GITHUB_TOKEN,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"PIMIENTOS"};
 const current=await fetch(api+"?ref="+encodeURIComponent(branch),{headers:h});let sha=null,remote=[];
 if(current.ok){const f=await current.json();sha=f.sha||null;try{const parsed=JSON.parse(decode(f.content));remote=Array.isArray(parsed.trips)?parsed.trips:[]}catch(e){return json({error:"Le fichier distant n’est pas un JSON lisible. Aucun changement n’a été écrit."},409,origin)}}
 else if(current.status!==404){const e=await current.json().catch(()=>({}));return json({error:e.message||"Impossible de lire le fichier distant."},current.status,origin)}
 const merged=new Map();remote.concat(body.tripData.trips).forEach(t=>{if(t&&t.id)merged.set(t.id,t)});
 const payload={schemaVersion:1,updatedAt:new Date().toISOString(),trips:Array.from(merged.values())};
 const put=await fetch(api,{method:"PUT",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({message:"PIMIENTOS · synchronisation des voyages",content:encode(JSON.stringify(payload,null,2)),branch,...(sha?{sha}:{})})});
 const result=await put.json();if(!put.ok)return json({error:result.message||"GitHub a refusé la synchronisation."},put.status,origin);
 return json({success:true,commit:result.commit&&result.commit.sha,html_url:result.commit&&result.commit.html_url,path},200,origin);
}
export default {async fetch(request,env){
 const origin=request.headers.get("Origin")||"",allowed=env.PIMIENTOS_ALLOWED_ORIGIN||"https://sopp24.github.io",local=origin.startsWith("http://localhost:")||origin.startsWith("http://127.0.0.1:");
 if(origin!==allowed&&!local)return new Response("Origin not allowed",{status:403});
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(request.method!=="POST")return json({error:"Méthode non autorisée."},405,origin);
 const path=new URL(request.url).pathname;
 try{if(path.endsWith("/api/assistant"))return await assistant(request,env,origin);if(path.endsWith("/api/github-sync"))return await githubSync(request,env,origin);return json({error:"Route introuvable."},404,origin)}
 catch(e){return json({error:e.message||"Erreur interne du Worker."},500,origin)}
}};