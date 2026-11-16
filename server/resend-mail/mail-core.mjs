import {freeTextReservation,mailThreadMessages} from './free-text.mjs';
import {parseReservationDate,splitReservationName} from './reservation-fields.mjs';
const names={date:['datum','reservationsdatum','reservationswunsch','wunschdatum','reservierungsdatum','gewünschtes datum','gewuenschtes datum','reservation am','reservierung am','reservation für','reservierung für'],time:['zeit','uhrzeit','ankunftszeit'],people:['personen','anzahl personen','personenzahl','anzahl gäste','anzahl gaeste','anzahl pers.','anzahl pers','anzahl personen.'],last:['nachname','name','name/vorname','name / vorname','vorname/nachname','vorname / nachname','nachname/vorname','nachname / vorname','vorname und nachname','name und vorname','vollständiger name','vollstaendiger name','familienname','nachname, vorname','name, vorname','voller name'],first:['vorname','vorname(n)','first name'],email:['e-mail','email','e-mail-adresse','mailadresse'],phone:['telefon','telefonnummer','mobile'],street:['strasse','straße','strasse/nr','strasse/nr.','strasse / nr','straße/nr'],zip:['plz','postleitzahl'],city:['ort','wohnort'],company:['firma','unternehmen'],comment:['kommentar','bemerkungen','nachricht','mitteilung','wünsche','wuensche'],gondola:['fonduegondel','gondel']};
export function htmlText(html=''){
 if(html.startsWith('data:text/html;base64,'))try{html=new TextDecoder().decode(Uint8Array.from(atob(html.slice(22)),c=>c.charCodeAt(0)));}catch{return '';}
 return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<\/(?:td|th)>\s*<(?:td|th)\b[^>]*>/gi,': ').replace(/<(?:br|\/p|\/div|\/tr|\/li)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';}).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,k)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[k]));
}
function parseSingleMail(text,options={}){
 const found={},issues=[],dateValues=[],combinedNames=[];const lines=String(text||'').replace(/\r/g,'').split('\n').map(s=>s.replace(/^\s*>\s?/,'').trim()).filter(Boolean);
 for(let i=0;i<lines.length;i++){
  const line=lines[i],match=line.match(/^([^:]{2,40}):\s*(.*)$/);let label=match?match[1].trim().toLowerCase():line.toLowerCase(),value=match?match[2].trim():'';
  label=label.replace(/\s*\*+$/,'').replace(/\s+/g,' ').trim();
  const key=Object.keys(names).find(k=>names[k].includes(label));if(!key)continue;
  if(!value&&lines[i+1]){const nextLabel=lines[i+1].replace(/:$/,'').trim().toLowerCase().replace(/\s*\*+$/,'').replace(/\s+/g,' ').trim();if(!Object.values(names).some(list=>list.includes(nextLabel)))value=lines[++i];}
  if(!value)continue;value=value.slice(0,4000);if(key==='date'){dateValues.push(value);continue;}if(key==='last'&&!['nachname','familienname'].includes(label)){combinedNames.push({value,label});continue;}if(found[key]&&found[key]!==value)issues.push('Mehrere Angaben: '+label);else found[key]=value;
 }
 const hasFormFields=!!(dateValues.length&&found.time&&found.people&&(found.last||found.first||combinedNames.length));
 const free=hasFormFields?null:freeTextReservation(text,options);
 let date='',time='',people=null;
 const inputs=dateValues.length?dateValues:free?[]:lines.filter(line=>/reservier|reservati/i.test(line)&&! /^(?:von|gesendet|sent|from):/i.test(line));
 const parsedDates=inputs.map(value=>parseReservationDate(value,options));
 const uniqueDates=[...new Set(parsedDates.map(p=>p.date).filter(Boolean))];
 issues.push(...new Set(parsedDates.flatMap(p=>p.issues)));
 if(uniqueDates.length===1&&!parsedDates.some(p=>p.issues.some(i=>/Mehrere Datumsangaben|Ungültige Datumsangabe/.test(i))))date=uniqueDates[0];
 else if(uniqueDates.length>1)issues.push('Mehrere Angaben: unterschiedliche Reservationsdaten.');
 const combined=combinedNames[0]||{value:'',label:''};
 if(new Set(combinedNames.map(n=>n.value.toLowerCase())).size>1)issues.push('Mehrere Angaben: unterschiedliche Namen.');
 const parsedName=splitReservationName({last:found.last||'',first:found.first||'',combined:combined.value,label:combined.label,knownFirstNames:options.knownFirstNames||[]});
 found.last=parsedName.last;found.first=parsedName.first;issues.push(...parsedName.issues);
 const clock=(found.time||'').replace(/^(\d{1,2})(\d{2})$/,'$1:$2');
 const t=clock.match(/^([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*Uhr)?$/i);if(t)time=t[1].padStart(2,'0')+':'+t[2];
 const n=(found.people||'').match(/^(\d{1,4})(?:\s*(?:Personen|Person|Gäste|Gaeste))?$/i);if(n&&Number(n[1])>=1&&Number(n[1])<=1000)people=Number(n[1]);
 if(free){if(!dateValues.length)date=free.draft.date;if(!found.time)time=free.draft.time;if(!found.people)people=free.draft.people;for(const [k,v] of Object.entries(free.draft.data))if(!found[k])found[k]=v;issues.push(...free.issues);}
 if(!date)issues.push('Datum fehlt oder ist nicht eindeutig.');if(!time)issues.push('Uhrzeit fehlt oder ist nicht eindeutig.');if(!people)issues.push('Personenzahl fehlt oder ist nicht eindeutig.');if(!found.last&&!found.first)issues.push('Name fehlt.');
 const data={};for(const k of ['last','first','email','phone','street','zip','city','company','comment'])data[k]=found[k]||'';
 const mailto=data.email.match(/^([^\s<>]+@[^\s<>]+)\s*<mailto:([^<>]+)>$/i);if(mailto&&mailto[1].toLowerCase()===mailto[2].toLowerCase())data.email=mailto[1];
 if(data.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)){data.email='';issues.push('E-Mail-Adresse prüfen.');}
 if(found.gondola&&!/^(nein|no|false|0)$/i.test(found.gondola)){data.gondola='Ja';issues.push('Gondelwunsch bitte manuell zuordnen.');}
 if(/\b(stornier\w*|absage|änderung|aenderung|verschieb\w*|annullier\w*)\b/i.test(text))issues.push('Mögliche Änderung oder Stornierung: manuell prüfen.');
 return {draft:{date,time,people,data},issues,complete:issues.length===0};
}
export function parseMail(text,options={}){
 const messages=mailThreadMessages(text,options);if(messages.length===1){const parsed=parseSingleMail(messages[0].body,{...options,sender:messages[0].sender||options.sender,subject:messages[0].subject});if(/^(?:re|aw|antw)\s*:/i.test(options.subject||'')){parsed.draft.is_reply=true;parsed.complete=false;parsed.issues.push('Antwort auf eine bestehende Anfrage: passende Reservation vor der Übernahme prüfen.');}return parsed;}
 const parsed=messages.map(m=>parseSingleMail(m.body,{...options,sender:m.sender||options.sender,subject:m.subject}));
 const ready=p=>p.draft.date&&p.draft.people&&(p.draft.data.first||p.draft.data.last);
 let index=parsed.findIndex(ready);
 if(index<0){const score=p=>Number(!!p.draft.date)*3+Number(!!p.draft.people)*3+Number(!!p.draft.time)+Number(!!(p.draft.data.first||p.draft.data.last))*2;index=parsed.reduce((best,p,i)=>score(p)>score(parsed[best])?i:best,0);}
 const source=parsed[index],draft={...source.draft,data:{...source.draft.data}},issues=[...source.issues,'Mailverlauf: erkannte Reservationsangaben vor der Bestätigung prüfen.'];
 for(let i=index-1;i>=0;i--){
  if(!/reserv|personen|pers\b|gäste|gaeste|kommen|ankunft|statt|verschieb|\bum\s+\d|\bam\s+\d/i.test(messages[i].body))continue;
  const p=parsed[i];if(p.issues.some(s=>/Mehrere Angaben|Mehrere Datumsangaben|Ungültige Datumsangabe/.test(s))){issues.push(...p.issues.filter(s=>!/fehlt|Name fehlt/.test(s)));continue;}
  for(const key of ['date','time','people'])if(p.draft[key]){if(draft[key]&&draft[key]!==p.draft[key])issues.push('Änderung im Mailverlauf: neuere Angabe für '+({date:'Datum',time:'Uhrzeit',people:'Personenzahl'}[key])+'. Bitte prüfen.');draft[key]=p.draft[key];}
  if(/Nachname|Vorname|(?:auf|unter) den? Namen|mein Name|ich heisse|ich heiße/i.test(messages[i].body))for(const key of ['first','last'])if(p.draft.data[key])draft.data[key]=p.draft.data[key];
 }
 if(new Set(parsed.filter(ready).map(p=>JSON.stringify([p.draft.date,p.draft.time,p.draft.people]))).size>1)issues.push('Mehrere Angaben im Mailverlauf: unterschiedliche Reservationen oder Änderungen. Bitte prüfen.');
 const externalEmail=value=>{const addresses=String(value||'').match(/[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[];return addresses.find(address=>!/@(?:fonduehuesli\.ch|artoffondue\.ch|streetfooddays\.ch|[^@]*resend\.app)$/i.test(address))||'';};
 const customerEmail=externalEmail(options.sender)||externalEmail(source.draft.data.email)||messages.map(m=>externalEmail(m.recipients)).find(Boolean)||'';
 draft.is_reply=true;
 draft.thread_references=parsed.slice(1,21).map((p,i)=>({date:p.draft.date,time:p.draft.time,people:p.draft.people,data:{first:p.draft.data.first||'',last:p.draft.data.last||'',email:externalEmail(p.draft.data.email)||externalEmail(messages[i+1].recipients)||customerEmail}})).filter(p=>p.date);
 if(!externalEmail(draft.data.email)&&customerEmail)draft.data.email=customerEmail;
 const internalSender=value=>/@(?:fonduehuesli\.ch|artoffondue\.ch|streetfooddays\.ch|[^@]*resend\.app)/i.test(value||'');
 const customerCommentField=body=>/(?:^|\n)\s*(?:Bemerkungen|Kommentar|Wünsche|Wuensche|Nachricht|Mitteilung)\s*:/i.test(body||'');
 if(internalSender(messages[index].sender)&&!customerCommentField(messages[index].body))draft.data.comment='';
 if(parsed[0].draft.data.comment&&(!internalSender(messages[0].sender)||customerCommentField(messages[0].body)))draft.data.comment=[...new Set([draft.data.comment,parsed[0].draft.data.comment].filter(Boolean))].join('\n');
 issues.push('Antwort im Mailverlauf: bestehende Reservation zuordnen; Änderungen manuell prüfen.');
 const all=[...new Set(issues)].filter(s=>!(/Datum fehlt/.test(s)&&draft.date||/Uhrzeit fehlt/.test(s)&&draft.time||/Personenzahl fehlt/.test(s)&&draft.people||/Name fehlt/.test(s)&&(draft.data.first||draft.data.last)));
 if(/\b(stornier\w*|absage|änderung|aenderung|verschieb\w*|annullier\w*)\b/i.test(messages[0].body))all.push('Mögliche Änderung oder Stornierung: manuell prüfen.');
 return {draft,issues:[...new Set(all)],complete:false};
}
export async function verifySignature(payload,headers,secret,now=Date.now()/1000){
 const id=headers.get('svix-id'),ts=headers.get('svix-timestamp'),sig=headers.get('svix-signature');
 if(!id||!ts||!sig||!/^\d+$/.test(ts)||Math.abs(now-Number(ts))>300||!secret?.startsWith('whsec_'))return false;
 try{const bytes=Uint8Array.from(atob(secret.slice(6)),c=>c.charCodeAt(0));const key=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['verify']);const data=new TextEncoder().encode(`${id}.${ts}.${payload}`);
  for(const part of sig.split(' ')){if(!part.startsWith('v1,'))continue;try{const signature=Uint8Array.from(atob(part.slice(3)),c=>c.charCodeAt(0));if(await crypto.subtle.verify('HMAC',key,signature,data))return true;}catch{}}
 }catch{}return false;
}

export function reservationCandidate(parsed){
 const d=parsed.draft;return !d.is_reply&&!!(d.date&&d.people&&(d.data.last||d.data.first)&&!parsed.issues.some(s=>/Mehrere Angaben|Änderung|Stornierung|gekürzt/.test(s)));
}
