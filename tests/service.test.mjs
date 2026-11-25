import test from 'node:test';
import assert from 'node:assert/strict';
import {StockHub} from '../src/worker.mjs';
const origin='https://fe-drop-europe.pages.dev';
async function hub(env={}){
 const store=new Map(),pending=[];const state={storage:{get:async k=>store.get(k),put:async(k,v)=>store.set(k,structuredClone(v)),getAlarm:async()=>1,setAlarm:async()=>{}},blockConcurrencyWhile:f=>pending.push(f()),waitUntil:()=>{}};
 const h=new StockHub(state,{PUBLIC_ORIGIN:origin,...env});await Promise.all(pending);return h;
}
const post=(path,body,o=origin)=>new Request(origin+'/api/'+path,{method:'POST',headers:{Origin:o,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('successful WebSocket upgrade cancels handshake timeout',async()=>{
 const h=await hub(),originalFetch=globalThis.fetch,originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 let timeoutCallback,cleared=false,signal;
 globalThis.setTimeout=fn=>{timeoutCallback=fn;return 123;};
 globalThis.clearTimeout=id=>{assert.equal(id,123);cleared=true;};
 globalThis.fetch=async(url,opts)=>{signal=opts.signal;return {webSocket:{accept(){},addEventListener(){}}};};
 try{await h.connect({locale:'fr-fr'});assert.ok(timeoutCallback);assert.equal(cleared,true);assert.equal(signal.aborted,false);assert.equal(h.sockets.size,1);}
 finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});
test('unconfigured emails fail closed without collecting addresses',async()=>{const h=await hub();const r=await h.fetch(post('subscribe',{email:'test@example.com'}));assert.equal(r.status,503);assert.equal(h.data.subscribers.length,0);});
test('foreign origin is rejected',async()=>{const h=await hub();assert.equal((await h.fetch(post('subscribe',{},'https://other.example'))).status,403);});
test('mail callback requires an unguessable live job, expires and hides recipients',async()=>{
 const h=await hub();const token=crypto.randomUUID()+crypto.randomUUID();
 h.mailJobs.set(token,{to:'private@example.com',expires:Date.now()+10000});
 assert.equal((await h.fetch(new Request(origin+'/api/mail-job/nope'))).status,404);
 assert.equal((await h.fetch(new Request(origin+'/api/mail-job/'+token))).status,200);
 h.mailJobs.get(token).expires=Date.now()-1;
 assert.equal((await h.fetch(new Request(origin+'/api/mail-job/'+token))).status,404);
});
test('Gmail relay receives only a capability and job disappears after response',async()=>{
 const h=await hub({EMAIL_RELAY_URL:'https://script.google.com/macros/s/unit-only/exec',ALLOWED_EMAILS:'test@example.com'});
 const original=globalThis.fetch;let token;
 globalThis.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);assert.deepEqual(Object.keys(body),['job']);token=body.job;assert.equal(h.mailJobs.get(token).to,'test@example.com');return Response.json({ok:true});};
 try{await h.sendMail('test@example.com','FE DROP EUROPE TEST','Isolated unit test','test-key');assert.equal(h.mailJobs.has(token),false);await assert.rejects(h.sendMail('other@example.com','FE DROP EUROPE TEST','test','test-key'));}
 finally{globalThis.fetch=original;}
});
test('status has no email addresses or private subscriber records',async()=>{const h=await hub();h.data.subscribers.push({email:'private@example.com'});const r=await h.fetch(new Request(origin+'/api/status'));const text=await r.text();assert.ok(!text.includes('private@example.com'));assert.equal(JSON.parse(text).rows.length,36);});
test('confirmation is required, single use, and unsubscribe deletes data',async()=>{
 const h=await hub({RESEND_API_KEY:'unit-test',EMAIL_FROM:'test@example.com',ALLOWED_EMAILS:'test@example.com'});let mail;
 // Transport stub only, no message is sent.
 h.sendMail=async(...args)=>{mail=args;};
 const r=await h.fetch(post('subscribe',{email:'test@example.com',models:['5090'],locales:['fr-fr'],consent:true}));assert.equal(r.status,200);assert.equal(h.data.subscribers[0].confirmed,false);
 const token=mail[2].match(/confirm=([^\s]+)/)[1];assert.equal((await h.fetch(post('confirm',{token}))).status,200);assert.equal(h.data.subscribers[0].confirmed,true);assert.equal((await h.fetch(post('confirm',{token}))).status,400);
 const unsub=h.data.subscribers[0].unsubscribe;await h.fetch(post('unsubscribe',{token:unsub}));assert.equal(h.data.subscribers.length,0);
});
test('outbox sends once with stable idempotency key',async()=>{const h=await hub({RESEND_API_KEY:'unit-test',EMAIL_FROM:'test@example.com',ALLOWED_EMAILS:'test@example.com'});h.data.subscribers=[{email:'test@example.com',confirmed:true,unsubscribe:'test-only'}];h.data.outbox=[{id:'unit-only',email:'test@example.com',event:{model:'5090',locale:'fr-fr',at:Date.now(),url:'https://example.com'},created:Date.now(),attempts:0}];const keys=[];h.sendMail=async(...a)=>keys.push(a[3]);await h.sendQueue();await h.sendQueue();assert.deepEqual(keys,['drop-unit-only']);});
