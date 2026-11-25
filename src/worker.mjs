import {REGIONS,MODELS,validPacket,eligibleEvents,rowsFor,validateSubscription} from './protocol.mjs';
const json=(x,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
export default {fetch(request,env){return env.HUB.get(env.HUB.idFromName('europe-singleton')).fetch(request);}};
export class StockHub {
  constructor(state,env){
    this.state=state;this.env=env;this.packets=new Map();this.sockets=new Map();this.retry=new Map();this.queue=Promise.resolve();
    this.state.blockConcurrencyWhile(async()=>{this.data=await state.storage.get('data')||{history:[],seen:{},subscribers:[],outbox:[],quota:{}};});
  }
  serial(fn){ const p=this.queue.then(fn);this.queue=p.catch(()=>{});return p; }
  save(){return this.state.storage.put('data',this.data);}
  emailReady(){return !!(this.env.RESEND_API_KEY&&this.env.EMAIL_FROM&&this.env.ALLOWED_EMAILS);}
  async connect(region){
    const locale=region.locale, now=Date.now();
    if(this.sockets.has(locale)||(this.retry.get(locale)?.at||0)>now)return;
    this.sockets.set(locale,{pending:true});
    try {
      const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),12000);
      let res;
      try { res=await fetch(`https://live.jlplen.io/v1/ws?locale=${locale}&models=5090,5080,5070&monitorHealth=1`,{headers:{Upgrade:'websocket',Origin:'https://notify-fe.plen.io'},signal:abort.signal}); }
      finally { clearTimeout(timeout); }
      const ws=res.webSocket;if(!ws)throw Error('WebSocket refusé');
      ws.accept();ws.openedAt=Date.now();this.sockets.set(locale,ws);this.retry.delete(locale);
      ws.addEventListener('message',e=>{
        if(typeof e.data!=='string'||e.data.length>100000)return;
        this.state.waitUntil(this.serial(async()=>{
          let p;try{p=JSON.parse(e.data);}catch{return;}
          if(!validPacket(p,locale))return;
          this.packets.set(locale,{...p,receivedAt:Date.now()});
          let changed=false;
          if(p.type==='snapshot'&&p.publicationId){
            for(const m of MODELS)this.data.seen[`${p.publicationId}:${locale}:${m}`]=Date.now();
            changed=true;
          }
          for(const event of eligibleEvents(p,locale)){
            if(this.data.seen[event.id])continue;
            this.data.seen[event.id]=Date.now();this.data.history.unshift(event);changed=true;
            for(const s of this.data.subscribers.filter(s=>s.confirmed&&s.models.includes(event.model)&&s.locales.includes(locale)))
              this.data.outbox.push({id:await digest(`${event.id}:${s.email}`),email:s.email,event,created:Date.now(),attempts:0});
          }
          if(changed){this.prune();await this.save();await this.sendQueue();}
        }));
      });
      const closed=()=>{if(this.sockets.get(locale)===ws)this.sockets.delete(locale);this.backoff(locale);};
      ws.addEventListener('close',closed);ws.addEventListener('error',()=>{try{ws.close();}catch{}closed();});
    }catch{this.sockets.delete(locale);this.backoff(locale);}
  }
  backoff(locale){const n=Math.min(6,(this.retry.get(locale)?.n||0)+1);this.retry.set(locale,{n,at:Date.now()+Math.min(300000,5000*2**n)});}
  prune(){
    const cutoff=Date.now()-86400000;
    this.data.seen=Object.fromEntries(Object.entries(this.data.seen).filter(([,t])=>t>cutoff));
    this.data.history=this.data.history.filter(e=>e.at>Date.now()-30*86400000).slice(0,500);
    this.data.subscribers=this.data.subscribers.filter(s=>s.confirmed||s.expires>Date.now());
    this.data.outbox=this.data.outbox.filter(e=>e.created>Date.now()-600000&&!e.sent&&e.attempts<5);
  }
  async upkeep(){
    await this.state.storage.setAlarm(Date.now()+30000);
    // One singleton, twelve shared upstream sockets; never one monitor per visitor.
    for(const r of REGIONS){
      const p=this.packets.get(r.locale),ws=this.sockets.get(r.locale);
      if(ws&&!ws.pending&&Date.now()-(p?.receivedAt||ws.openedAt)>90000){try{ws.close();}catch{}this.sockets.delete(r.locale);}
    }
    for(let i=0;i<REGIONS.length;i+=4)await Promise.all(REGIONS.slice(i,i+4).map(r=>this.connect(r)));
  }
  async alarm(){await this.upkeep();await this.serial(async()=>{this.prune();await this.sendQueue();await this.save();});}
  async sendMail(to,subject,text,key){
    if(!this.emailReady())throw Error('E-mails non configurés.');
    const day=new Date().toISOString().slice(0,10),month=day.slice(0,7),q=this.data.quota;
    if(q.day!==day){q.day=day;q.daily=0;}if(q.month!==month){q.month=month;q.monthly=0;}
    if(q.daily>=90||q.monthly>=2800)throw Error('Quota gratuit protégé : envoi suspendu.');
    q.daily++;q.monthly++;await this.save();
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${this.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:this.env.EMAIL_FROM,to:[to],subject,text}),signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw Error(`Envoi refusé (${r.status}).`);
  }
  async sendQueue(){
    if(!this.emailReady())return;
    for(const item of this.data.outbox.filter(i=>!i.sent&&i.attempts<5&&Date.now()-i.created<600000)){
      const s=this.data.subscribers.find(s=>s.email===item.email&&s.confirmed);
      if(!s){item.sent=true;continue;}
      item.attempts++;await this.save();
      try {
        const e=item.event;
        await this.sendMail(s.email,`FE DROP EUROPE · RTX ${e.model} · ${e.locale}`,
          `Stock signalé le ${new Date(e.at).toISOString()} (Notify-FE). Il peut déjà être épuisé.\n${e.url}\n\nSe désinscrire : ${this.env.PUBLIC_ORIGIN}/?unsubscribe=${s.unsubscribe}`,
          `drop-${item.id}`);
        item.sent=true;
      }catch{this.lastEmailError='Un envoi a échoué ou le quota est atteint.';}
      await this.save();
    }
  }
  async fetch(request){
    const url=new URL(request.url),path=url.pathname;
    if(!await this.state.storage.getAlarm())this.state.waitUntil(this.upkeep());
    if(path==='/api/status'&&request.method==='GET'){
      const rows=REGIONS.flatMap(r=>rowsFor(this.packets.get(r.locale),r));
      return json({rows,history:this.data.history,serverTime:Date.now(),pollSeconds:10,
        connected:this.sockets.size,regions:REGIONS,emailEnabled:this.emailReady(),emailError:this.lastEmailError||null,
        source:'Notify-FE',sourceHealth:REGIONS.map(r=>({locale:r.locale,status:this.packets.get(r.locale)?.status||'connecting',receivedAt:this.packets.get(r.locale)?.receivedAt||null})),
        priceNote:'Prix non fourni par le flux. Vérifiez le tarif dans la boutique NVIDIA.'});
    }
    if(request.method!=='POST')return json({error:'Route introuvable.'},404);
    if(request.headers.get('Origin')!==this.env.PUBLIC_ORIGIN)return json({error:'Origine refusée.'},403);
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON requis.'},415);
    const body=await request.text();if(body.length>4096)return json({error:'Requête trop longue.'},413);
    let input;try{input=JSON.parse(body);}catch{return json({error:'JSON invalide.'},400);}
    return this.serial(async()=>{
      try {
        if(path==='/api/subscribe'){
          if(!this.emailReady())return json({error:'Les e-mails ne sont pas encore activés. Aucune adresse enregistrée.'},503);
          const allowed=this.env.ALLOWED_EMAILS.split(',').map(s=>s.trim().toLowerCase());
          const sub=validateSubscription(input,allowed),existing=this.data.subscribers.find(s=>s.email===sub.email);
          if(existing&&Date.now()-existing.requested<600000)return json({error:'Patientez dix minutes avant une nouvelle demande.'},429);
          if(this.data.subscribers.length>=10&&!existing)return json({error:'Nombre maximal d’inscrits atteint.'},429);
          const token=crypto.randomUUID()+crypto.randomUUID(),hash=await digest(token);
          // An existing confirmed subscription stays active until the new preferences are confirmed.
          const entry=existing||{...sub,confirmed:false,unsubscribe:crypto.randomUUID()+crypto.randomUUID()};
          entry.pending={...sub,hash};entry.expires=Date.now()+86400000;entry.requested=Date.now();
          if(!existing)this.data.subscribers.push(entry);await this.save();
          await this.sendMail(sub.email,'Confirmez vos alertes FE DROP EUROPE',`Confirmez votre demande (valable 24 h) :\n${this.env.PUBLIC_ORIGIN}/?confirm=${token}\n\nSans confirmation, aucune nouvelle alerte n’est activée. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.`, `confirm-${hash}`);
          return json({message:'E-mail de confirmation envoyé. Ouvrez le lien puis confirmez votre inscription.'});
        }
        if(path==='/api/confirm'){
          const hash=await digest(String(input.token||'')),s=this.data.subscribers.find(s=>s.pending?.hash===hash&&s.expires>Date.now());
          if(!s)return json({error:'Lien expiré ou déjà utilisé.'},400);
          Object.assign(s,{email:s.pending.email,models:s.pending.models,locales:s.pending.locales,confirmed:true});delete s.pending;await this.save();
          return json({message:'Votre adresse est confirmée. Les prochains drops correspondant à vos choix déclencheront une alerte.'});
        }
        if(path==='/api/unsubscribe'){
          const s=this.data.subscribers.find(s=>s.unsubscribe===input.token);if(s){this.data.subscribers=this.data.subscribers.filter(x=>x!==s);this.data.outbox=this.data.outbox.filter(x=>x.email!==s.email);await this.save();}
          return json({message:'Désinscription effectuée. Les données de cette inscription ont été supprimées.'});
        }
        return json({error:'Route introuvable.'},404);
      }catch(e){return json({error:e.message},400);}
    });
  }
}