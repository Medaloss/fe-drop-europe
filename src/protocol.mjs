// Original implementation of the public Notify-FE wire protocol; no upstream source copied.
export const MODELS = ['5090','5080','5070'];
export const REGIONS = [
  ['fr-fr','France','EUR'],['de-de','Allemagne','EUR'],['de-at','Autriche','EUR'],
  ['es-es','Espagne','EUR'],['it-it','Italie','EUR'],['nl-nl','Pays-Bas','EUR'],
  ['en-gb','Royaume-Uni','GBP'],['da-dk','Danemark','DKK'],['fi-fi','Finlande','EUR'],
  ['sv-se','Suède','SEK'],['nb-no','Norvège','NOK'],['pl-pl','Pologne','PLN']
].map(([locale,name,currency])=>({locale,name,currency}));
export const validLocale = l => REGIONS.some(r=>r.locale===l);
export function shopLink(value,locale,model) {
  try { const u=new URL(value); if(u.protocol==='https:'&&!u.username&&!u.password&&value.length<=2048) return value; } catch {}
  return `https://marketplace.nvidia.com/${locale}/consumer/graphics-cards/?manufacturer=NVIDIA&gpu=RTX%20${model}`;
}
export function validPacket(p,locale,now=Date.now()) {
  return p && p.version===1 && p.locale===locale && validLocale(locale) &&
    ['snapshot','update','health'].includes(p.type) && p.synthetic===false &&
    Number.isFinite(p.serverTime) && Math.abs(now-p.serverTime)<=75000 && Array.isArray(p.cards);
}
export function cardState(p,c,now=Date.now()) {
  if(!p || !c || p.synthetic!==false) return 'unknown';
  if(p.status==='offline' || ['error','failed','offline'].includes(c.status)) return 'error';
  const age=now-c.observedAt;
  if(c.status!=='healthy'||!Number.isFinite(c.observedAt)||age< -5000||age>60000||typeof c.available!=='boolean') return 'unknown';
  return c.available?'available':'out';
}
export function eligibleEvents(p,locale,now=Date.now()) {
  if(!validPacket(p,locale,now)||p.type==='snapshot'||p.status==='offline'||
    typeof p.publicationId!=='string'||!p.publicationId||!Array.isArray(p.alerts)) return [];
  return MODELS.filter(m=>p.alerts.includes(m)).flatMap(model=>{
    const c=p.cards.find(c=>c.model===model), age=p.serverTime-c?.observedAt;
    if(!c||cardState(p,c,now)!=='available'||age<0||age>15000) return [];
    return [{id:`${p.publicationId}:${locale}:${model}`,locale,model,at:c.observedAt,url:shopLink(c.productUrl,locale,model)}];
  });
}
export function rowsFor(p,region,now=Date.now()) {
  return MODELS.map(model=>{
    const c=p?.cards?.find(c=>c.model===model);
    return {locale:region.locale,country:region.name,currency:region.currency,model,
      status:cardState(p,c,now),observedAt:c?.observedAt??null,lastAvailableAt:c?.lastAvailableAt??null,
      price:null,priceAt:null,url:shopLink(c?.productUrl,region.locale,model),direct:!!c?.productUrl};
  });
}
export function validateSubscription(input,allowed) {
  const email=String(input.email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254) throw Error('Adresse e-mail invalide.');
  if(!allowed.includes(email)) throw Error('Inscription réservée aux adresses invitées par le propriétaire.');
  const models=[...new Set(input.models||[])].filter(m=>MODELS.includes(m));
  const locales=[...new Set(input.locales||[])].filter(validLocale);
  if(!models.length||!locales.length||input.consent!==true) throw Error('Choisissez une carte, un pays et acceptez les alertes.');
  return {email,models,locales};
}
