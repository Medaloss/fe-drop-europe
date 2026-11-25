// Deploy as Web app, execute as the owner, access Anyone.
// Only the fixed FE DROP EUROPE server can authorize a live message.
function doGet() { return reply({service:'FE DROP EUROPE mail relay',ready:true}); }
function reply(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var input = JSON.parse(e.postData.contents);
    if (!/^[a-f0-9-]{72}$/.test(input.job || '')) return reply({ok:false,error:'Invalid job'});
    var response = UrlFetchApp.fetch('https://fe-drop-europe.pages.dev/api/mail-job/' + input.job, {muteHttpExceptions:true});
    if (response.getResponseCode() !== 200) return reply({ok:false,error:'Expired job'});
    var job = JSON.parse(response.getContentText());
    if (!job.id || !job.to || !job.subject || !job.text || job.expires < Date.now()) return reply({ok:false,error:'Invalid payload'});
    if (!job.subject.startsWith('FE DROP EUROPE') && !job.subject.startsWith('Confirmez vos alertes FE DROP EUROPE')) return reply({ok:false,error:'Invalid subject'});
    lock.waitLock(10000);
    var props = PropertiesService.getScriptProperties();
    var id = 'receipt_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, job.id));
    var existing = props.getProperty(id);
    if (existing) { var receipt=JSON.parse(existing); return reply(receipt.state === 'sent' ? {ok:true,duplicate:true} : {ok:false,error:'Delivery uncertain'}); }
    if (MailApp.getRemainingDailyQuota() < 1) return reply({ok:false,error:'Google daily quota reached'});
    props.setProperty(id, JSON.stringify({state:'pending',at:Date.now()}));
    MailApp.sendEmail({to:job.to,subject:job.subject,body:job.text,name:'FE DROP EUROPE'});
    props.setProperty(id, JSON.stringify({state:'sent',at:Date.now()}));
    var all=props.getProperties();
    Object.keys(all).forEach(function(k){ if(k.indexOf('receipt_')===0){try{if(JSON.parse(all[k]).at < Date.now()-3*86400000)props.deleteProperty(k);}catch(ignore){}} });
    return reply({ok:true});
  } catch(error) { return reply({ok:false,error:'Mail relay failed'}); }
  finally { if(lock.hasLock())lock.releaseLock(); }
}
