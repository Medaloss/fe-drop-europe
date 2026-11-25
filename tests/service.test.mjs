import test from 'node:test';
import assert from 'node:assert/strict';
import {StockHub} from '../src/worker.mjs';
const origin='https://fe-drop-europe.pages.dev';
async function hub(env={}){
 const store=new Map(),pending=[];const state={storage:{get:async k=>store.get(k),put:async(k,v)=>store.set(k,structuredClone(v)),getAlarm:async()=>1,setAlarm:async()=>{}},blockConcurrencyWhile:f=>pending.push(f()),waitUntil:()=>{}};
 const h=new StockHub(state,{PUBLIC_ORIGIN:origin,...env});await Promise.all(pending);return h;
}
const post=(path,body,o=origin)=>new Request(origin+'/api/'+path,{method:'POST',headers:{Origin:o,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('unconfigured emails fail closed without collecting addresses',async()=>{const h=await hub();const r=await h.fetch(post('subscribe',{email:'test@example.com'}));assert.equal(r.status,503);assert.equal(h.data.subscribers.length,0);});
test('foreign origin is rejected',async()=>{const h=await hub();assert.equal((await h.fetch(post('subscribe',{},'https://other.example'))).status,403);});
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
