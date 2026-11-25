const $=s=>document.querySelector(s), labels={available:'Disponible',out:'Rupture',unknown:'Inconnu',error:'Erreur'};
let data=null,busy=false,seen=new Set(),initialized=false,ctx=null,lastSuccess=0;
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const fmt=t=>Number.isFinite(t)?new Date(t).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'medium'}):'Aucun relevé';
const time=t=>Number.isFinite(t)?new Date(t).toLocaleTimeString('fr-FR'):'En attente';
function sound(){ctx??=new AudioContext();ctx.resume();const osc=ctx.createOscillator(),gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=740;gain.gain.setValueAtTime(.1,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.5);osc.start();osc.stop(ctx.currentTime+.5);}
$('#test-sound').onclick=()=>{try{sound();}catch{$('#notice').textContent='Le navigateur ne permet pas la lecture du son.';}};
$('#sound').onchange=()=>{if($('#sound').checked){try{sound();}catch{}}};
function render(){
 if(!data)return;
 const stale=Date.now()-lastSuccess>25000;
 const rows=data.rows.map(r=>({...r,status:stale?'error':(!r.observedAt||Date.now()-r.observedAt>60000)&&r.status!=='error'?'unknown':r.status}));
 $('#available').textContent=stale?'—':rows.filter(r=>r.status==='available').length;
 const filtered=rows.filter(r=>($('#country').value==='all'||r.locale===$('#country').value)&&($('#model').value==='all'||r.model===$('#model').value)&&($('#status').value==='all'||r.status===$('#status').value));
 const root=$('#stock-rows');root.replaceChildren();
 for(const r of filtered){const tr=el('tr'),country=el('td');country.append(el('strong',r.country),el('small',r.currency));tr.append(country,el('td',`RTX ${r.model} FE`));const s=el('td');s.append(el('span',labels[r.status]||'Inconnu',`badge ${r.status}`));tr.append(s);
 const price=el('td',Number.isFinite(r.price)?new Intl.NumberFormat('fr-FR',{style:'currency',currency:r.currency}).format(r.price):'Non fourni');tr.append(price);const observed=el('td',time(r.observedAt));observed.title=fmt(r.observedAt);observed.append(el('small',r.observedAt?fmt(r.observedAt).split(' ')[0]:'Source non reçue'));tr.append(observed);
 const link=el('a',r.direct?'Lien marchand':'Catalogue NVIDIA','shop');try{if(new URL(r.url).protocol==='https:')link.href=r.url;}catch{}link.target='_blank';link.rel='noreferrer';const shop=el('td');shop.append(link);tr.append(shop);root.append(tr);}
 if(!filtered.length){const tr=el('tr'),td=el('td','Aucun résultat pour ces filtres.');td.colSpan=6;tr.append(td);root.append(tr);}
}
function fillRegions(regions){if($('#country').options.length>1)return;for(const r of regions){for(const id of ['#country','#alert-country']){const o=el('option',r.name);o.value=r.locale;$(id).append(o);}}}
function history(events){const root=$('#events');root.replaceChildren();if(!events.length){root.append(el('p','Aucun drop enregistré. Les anciens stocks ne sont pas reconstruits.','empty'));return;}
 for(const e of events.slice(0,50)){const item=el('div',undefined,'event');item.append(el('time',fmt(e.at)),el('strong',`RTX ${e.model} FE · ${data.regions.find(r=>r.locale===e.locale)?.name||e.locale}`));item.append(el('div','Disponibilité signalée par Notify-FE — vérifiez la boutique.'));root.append(item);}}
async function refresh(){if(busy)return;busy=true;$('#refresh').disabled=true;try{const r=await fetch('/api/status',{cache:'no-store',signal:AbortSignal.timeout(12000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Service indisponible.');if(!Array.isArray(d.rows))throw Error('Réponse du service invalide.');data=d;lastSuccess=Date.now();fillRegions(d.regions);$('#updated').textContent=time(d.serverTime);
 const known=d.rows.filter(r=>['available','out'].includes(r.status)).length,health=d.sourceHealth.filter(s=>s.status==='healthy').length;
 $('#notice').className=`notice ${known<36||health<12?'warning':''}`;$('#notice').textContent=`${known}/36 stocks exploitables · ${health}/12 flux pleinement sains. Source : Notify-FE. Les données absentes ou périmées restent inconnues.`;
 $('#email-state').textContent=d.emailEnabled?'Alertes e-mail activées pour les adresses invitées, même lorsque cette page est fermée.':'E-mails non activés : le service d’envoi et les adresses invitées doivent être configurés. Aucune inscription n’est collectée.';$('#subscribe-button').disabled=!d.emailEnabled;
 for(const e of d.history){if(initialized&&!seen.has(e.id)&&Date.now()-e.at<30000&&$('#sound').checked){try{sound();}catch{}}seen.add(e.id);}initialized=true;history(d.history);render();
 }catch(e){$('#notice').className='notice warning';$('#notice').textContent=`Surveillance indisponible : ${e.message} Aucun stock ne peut être confirmé.`;$('#subscribe-button').disabled=true;$('#email-state').textContent='Service e-mail non vérifiable actuellement.';if(data){lastSuccess=0;render();}}
 finally{busy=false;$('#refresh').disabled=false;}}
$('#refresh').onclick=refresh;for(const id of ['#country','#model','#status'])$(id).onchange=render;
async function post(path,payload){const r=await fetch(`/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok)throw Error(d.error||'La demande a échoué.');return d.message;}
$('#subscribe').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),button=$('#subscribe-button');button.disabled=true;try{$('#form-result').textContent=await post('subscribe',{email:f.get('email'),models:f.getAll('models'),locales:f.get('locale')==='all'?data.regions.map(r=>r.locale):[f.get('locale')],consent:f.has('consent')});}catch(e){$('#form-result').textContent=e.message;}finally{button.disabled=!data?.emailEnabled;}};
const params=new URLSearchParams(location.search),action=params.has('confirm')?'confirm':params.has('unsubscribe')?'unsubscribe':null;
if(action){const token=params.get(action);window.history.replaceState(null,'',location.pathname);$('#token-title').textContent=action==='confirm'?'Confirmer votre inscription':'Arrêter les alertes';$('#token-message').textContent=action==='confirm'?'Validez pour activer vos préférences d’alerte.':'Validez pour supprimer votre inscription et vos préférences.';$('#token-dialog').showModal();$('#token-submit').onclick=async()=>{$('#token-submit').disabled=true;try{$('#token-message').textContent=await post(action,{token});}catch(e){$('#token-message').textContent=e.message;$('#token-submit').disabled=false;}};$('#token-close').onclick=()=>$('#token-dialog').close();}
refresh();setInterval(()=>{render();if(!document.hidden)refresh();},10000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){initialized=false;refresh();}});
