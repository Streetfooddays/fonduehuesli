import {newsletterHTML,EXTRA_NEWSLETTER_FIELDS} from './newsletter.mjs';
export function validateDraft(d){
 if(!d||typeof d!=='object'||Array.isArray(d))throw Error('Entwurf fehlt.');
 for(const [key,max] of Object.entries({subject:200,preheader:2000,title:500,body:30000,signature:4000,button:200,url:2000,image:2000,color:7,unsubscribe:2000}))if(typeof d[key]!=='string'||d[key].length>max)throw Error('Newsletterfeld prüfen: '+key);
 if(!d.subject.trim()||/[\r\n]/.test(d.subject)||!d.title.trim()||!d.body.trim()||!d.signature.trim())throw Error('Betreff, Überschrift, Nachricht und Absender ausfüllen.');
 for(const k of ['url','image'])if(d[k]&&!/^https:\/\//i.test(d[k]))throw Error('Bitte vollständige HTTPS-Adressen verwenden.');
 for(const [key,max] of Object.entries(EXTRA_NEWSLETTER_FIELDS))if(d[key]!==undefined&&(typeof d[key]!=='string'||d[key].length>max))throw Error('Newsletterfeld prüfen: '+key);
 for(const key of ['menuImage','nominationUrl','shopUrl','shopLogo','shopImage1','shopImage2'])if(d[key]&&!/^https:\/\//i.test(d[key]))throw Error('Bitte vollständige HTTPS-Adressen verwenden.');
 return d;
}
export function messages(batch,endpoint){
 const d=validateDraft(batch.draft);
 return batch.recipients.map(r=>{
  if(!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(r.email)||! /^[0-9a-f-]{36}$/i.test(r.token))throw Error('Empfänger prüfen.');
  const unsubscribe=endpoint+'/unsubscribe?token='+r.token;
  return {from:'Fonduehüsli Bülach <reservation@fonduehuesli.ch>',to:[r.email],reply_to:'reservation@fonduehuesli.ch',subject:d.subject,html:newsletterHTML({...d,unsubscribe}),text:[d.title,d.body,d.url,d.nominationTitle,d.nominationText,d.nominationUrl,d.shopTitle,d.shopText,d.shopUrl,d.closing,d.signature,'Newsletter abbestellen: '+unsubscribe].filter(Boolean).join('\n\n'),headers:{'List-Unsubscribe':'<'+unsubscribe+'>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}};
 });
}
