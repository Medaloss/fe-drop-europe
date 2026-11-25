import test from 'node:test';
import assert from 'node:assert/strict';
import {REGIONS,MODELS,validPacket,cardState,eligibleEvents,rowsFor,shopLink,validateSubscription} from '../src/protocol.mjs';
// Isolated unit fixtures. These never enter the deployed site, live history or email transport.
const now=1795588361694;
const fixture=()=>({version:1,type:'update',locale:'fr-fr',synthetic:false,serverTime:now,status:'healthy',publicationId:'UNIT-TEST-ONLY',alerts:['5090'],cards:[{model:'5090',available:true,status:'healthy',observedAt:now-2000,productUrl:'https://marketplace.nvidia.com/fr-fr/'}]});
test('exactly 12 European regions and 36 model/region pairs',()=>{assert.equal(REGIONS.length,12);assert.equal(REGIONS.flatMap(r=>rowsFor(null,r,now)).length,36);assert.equal(MODELS.length,3);});
test('missing data is unknown, never out of stock',()=>assert.equal(cardState(null,null,now),'unknown'));
test('fresh explicit boolean distinguishes in-stock and out-of-stock',()=>{const p=fixture();assert.equal(cardState(p,p.cards[0],now),'available');p.cards[0].available=false;assert.equal(cardState(p,p.cards[0],now),'out');});
test('expired, future, malformed and stale readings never claim availability',()=>{for(const patch of [{observedAt:now-60001},{observedAt:now+6000},{observedAt:null},{available:'true'},{status:'stale'}]){const p=fixture();Object.assign(p.cards[0],patch);assert.equal(cardState(p,p.cards[0],now),'unknown');}});
test('offline and explicit error are errors',()=>{const p=fixture();p.status='offline';assert.equal(cardState(p,p.cards[0],now),'error');p.status='healthy';p.cards[0].status='error';assert.equal(cardState(p,p.cards[0],now),'error');});
test('test packets rejected at ingestion and notification',()=>{const p=fixture();p.synthetic=true;assert.equal(validPacket(p,'fr-fr',now),false);assert.deepEqual(eligibleEvents(p,'fr-fr',now),[]);});
test('snapshots are silent even when stock is available',()=>{const p=fixture();p.type='snapshot';assert.deepEqual(eligibleEvents(p,'fr-fr',now),[]);});
test('new healthy event gets stable deduplication identity',()=>{const p=fixture();assert.equal(eligibleEvents(p,'fr-fr',now)[0].id,'UNIT-TEST-ONLY:fr-fr:5090');assert.deepEqual(eligibleEvents(p,'fr-fr',now),eligibleEvents(p,'fr-fr',now));});
test('notifications require alert field, ID and observation <=15 seconds old',()=>{for(const patch of [{alerts:[]},{publicationId:null},{status:'offline'},{serverTime:now-100000},{locale:'de-de'}]){const p={...fixture(),...patch};assert.equal(eligibleEvents(p,'fr-fr',now).length,0);}const p=fixture();p.cards[0].observedAt=now-15001;assert.equal(eligibleEvents(p,'fr-fr',now).length,0);});
test('dangerous links are replaced with official catalogue links',()=>{for(const url of ['javascript:alert(1)','http://example.com','https://secret:token@example.com'])assert.match(shopLink(url,'fr-fr','5090'),/^https:\/\/marketplace.nvidia.com/);});
test('email requires invitation, consent and valid selections',()=>{const v={email:'TEST@example.com',models:['5090'],locales:['fr-fr'],consent:true};assert.equal(validateSubscription(v,['test@example.com']).email,'test@example.com');for(const bad of [{...v,consent:false},{...v,models:[]},{...v,locales:['en-us']},{...v,email:'nope'}])assert.throws(()=>validateSubscription(bad,['test@example.com']));assert.throws(()=>validateSubscription(v,[]));});
