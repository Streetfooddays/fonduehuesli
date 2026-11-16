import {parseReservationDate,splitReservationName} from './reservation-fields.mjs';
// Only the latest message is used; quoted confirmations and transport headers are not new requests.
export function latestMessage(text=''){
 const lines=String(text).replace(/\r/g,'').split('\n');let started=false;const out=[];
 for(const line of lines){
  if(/^\s*(?:>+|[-_]{3,}\s*(?:Original|Ursprüngliche|Weitergeleitete)|Am .{5,}schrieb.{0,80}:|On .{5,}wrote:)/i.test(line))break;
  if(/^\s*(?:Von|From|Gesendet|Sent|An|To|Betreff|Subject):/i.test(line)){if(started&&out.some(s=>/reserv|buchen|personen|gäste|gaeste/i.test(s)))break;continue;}
  out.push(line);if(line.trim())started=true;
 }
 return out.join('\n').trim();
}
export function freeTextReservation(text,options={}){
 const body=latestMessage(text),issues=[],draft={date:'',time:'',people:null,data:{}};
 const reply=/^(?:(?:re|aw|antw)\s*:\s*)+/i.test(options.subject||'');
 const context=reply?freeTextReservation('',{...options,subject:String(options.subject).replace(/^(?:(?:re|aw|antw)\s*:\s*)+/i,'')}):null;
 const content=[reply?'':options.subject,body].filter(Boolean).join('\n');
 const parseDate=parseReservationDate(content.replace(/\b(?:um|gegen|ab|ca\.?)\s+\d{1,2}[.:]\d{2}(?:\s*(?:Uhr|h))?/gi,''),options);
 draft.date=parseDate.date;issues.push(...parseDate.issues);
 const unique=(values,label)=>{const set=[...new Set(values)];if(set.length>1){issues.push('Mehrere Angaben: '+label+'. Bitte prüfen.');return null;}return set[0]??null;};
 const times=[];for(const m of content.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g))times.push(m[1].padStart(2,'0')+':'+m[2]);
 for(const m of content.matchAll(/\b(?:um|gegen|ab|ca\.?)\s+([01]?\d|2[0-3])(?:\s*[:.h]\s*([0-5]\d))?(?![\d:.,])\s*(?:Uhr\b|h\b)?|\b([01]?\d|2[0-3])(?:[:.]([0-5]\d)\s*(?:Uhr|h\b)|\s*Uhr\b)/gi)){
  const h=m[1]??m[3],min=m[2]??m[4]??'00';const following=content.slice(m.index+m[0].length);
  if(/^[./]\d/.test(following)||/^\s*(?:Person|Pers|Pax|Gäst|Gaest|Erwachsene)/i.test(following))continue;
  times.push(h.padStart(2,'0')+':'+min);
 }
 draft.time=unique(times,'unterschiedliche Ankunftszeiten')||'';
 const counts=[];
 for(const m of content.matchAll(/\b(\d{1,4})\s*(?:Person(?:en)?|Pers\.?|Pax|Gäste|Gaeste|Erwachsene(?:n)?)\b/gi))counts.push(Number(m[1]));
 const grouped={zweit:2,dritt:3,viert:4,fünft:5,fuenft:5,sechst:6,siebt:7,acht:8,neunt:9,zehnt:10};for(const m of content.matchAll(/\bzu\s+(zweit|dritt|viert|fünft|fuenft|sechst|siebt|acht|neunt|zehnt)\b/gi))counts.push(grouped[m[1].toLowerCase()]);
 const words={eine:1,einen:1,einer:1,zwei:2,drei:3,vier:4,fünf:5,fuenf:5,sechs:6,sieben:7,acht:8,neun:9,zehn:10,elf:11,zwölf:12,zwoelf:12};
 for(const m of content.matchAll(/\b(eine[nr]?|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn|elf|zwölf|zwoelf)\s+(?:Personen|Pers\.?|Gäste|Gaeste)\b/gi))counts.push(words[m[1].toLowerCase()]);
 if(/\b(?:Erwachsene|Kinder)\b/i.test(body)&&(/\b\d+\s*Kinder\b/i.test(body)||counts.length>1)){issues.push('Personenzahl mit Erwachsenen und Kindern bitte prüfen.');}
 const count=unique(counts,'unterschiedliche Personenzahlen');if(count>=1&&count<=1000&&!(/\b\d+\s*Kinder\b/i.test(content)&&!/\b\d+\s*(?:Person(?:en)?|Pers\.?|Pax|Gäste|Gaeste)\b/i.test(content)))draft.people=count;
 const nameCandidates=[];
 for(const m of content.matchAll(/(?:auf den Namen|unter dem Namen|mein Name ist|ich heisse|ich heiße)\s+([\p{Lu}][\p{L}'’.-]+(?:\s+[\p{Lu}][\p{L}'’.-]+){1,3})(?=[,.!\n]|$)/gu))nameCandidates.push(m[1]);
 const sign=body.match(/(?:freundliche[nr]?\s+Gr[üu]ss(?:e|en)?|freundliche[nr]?\s+Gr[üu]ß(?:e|en)?|liebe\s+Gr[üu]ss(?:e|en)?|liebe\s+Gr[üu]ß(?:e|en)?|beste\s+Grüsse|viele\s+Grüsse|Gruss|Gruß|Grüsse|Grüße|MfG)\s*[,!.]?\s*(?:\n\s*)?([\p{Lu}][\p{L}'’.-]+(?:[ \t]+(?:[\p{Lu}][\p{L}'’.-]+|von|van|de|der)){1,4})/iu);
 if(sign&&sign[1].trim().split(/\s+/).every(w=>/^[\p{Lu}]/u.test(w)||/^(?:von|van|de|der)$/.test(w)))nameCandidates.push(sign[1].trim());
 if(!nameCandidates.length&&/reserv|tisch|kommen/i.test(body)){const lastLine=body.split('\n').map(s=>s.trim()).filter(Boolean).at(-1)||'';if(/^[\p{Lu}][\p{L}'’.-]+(?:[ \t]+[\p{Lu}][\p{L}'’.-]+){1,3}$/u.test(lastLine)){const n=splitReservationName({combined:lastLine,knownFirstNames:options.knownFirstNames||[]});if(!n.issues.length&&n.first&&n.last)nameCandidates.push(lastLine);}}
 if(!nameCandidates.length){const sender=String(options.sender||'').match(/^\s*"?([^"<>@]+?)"?\s*<[^<>]+>/);if(sender&&sender[1].trim().split(/\s+/).length>=2)nameCandidates.push(sender[1].trim());}
 const name=unique(nameCandidates,'unterschiedliche Namen');
 if(name){const n=splitReservationName({combined:name,knownFirstNames:options.knownFirstNames||[]});draft.data.first=n.first;draft.data.last=n.last;issues.push(...n.issues);}
 // Addresses are taken only from the current sender, never from quoted correspondence.
 const senderEmail=String(options.sender||'').match(/(?:<|^)([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>?$/);
 if(senderEmail)draft.data.email=senderEmail[1];
 const notes=body.split('\n').map(line=>line.trim()).filter(line=>!/^(?:Von|From|An|To|Gesendet|Sent|Date|Datum|Betreff|Subject):/i.test(line)&&/allerg|gluten|laktos|vegetar|vegan|kinderstuhl|kinderwagen|rollstuhl|geburtstag|am fenster|mitbring|mitnehm|stornier|absag|annull|verschieb|änder|aender|benötig|benoetig|brauchen/i.test(line));
 if(notes.length)draft.data.comment=[...new Set(notes)].join('\n').slice(0,4000);
 if(context){
  if(!draft.date&&parseDate.issues.every(i=>/Datum fehlt/.test(i))&&context.draft.date){draft.date=context.draft.date;for(let i=issues.length-1;i>=0;i--)if(/Datum fehlt/.test(issues[i]))issues.splice(i,1);issues.push(...context.issues.filter(i=>/Jahr nicht angegeben/.test(i)));}
  if(!draft.time&&!issues.some(i=>/unterschiedliche Ankunftszeiten/.test(i)))draft.time=context.draft.time;
  if(!draft.people&&!issues.some(i=>/unterschiedliche Personenzahlen|Erwachsenen und Kindern/.test(i)))draft.people=context.draft.people;
 }
 if(draft.date||draft.time||draft.people||name)issues.push('Freie E-Mail: erkannte Angaben vor der Bestätigung prüfen.');
 return {draft,issues};
}

export function mailThreadMessages(text,options={}){
 const parts=[];let lines=[],sender=options.sender||'',subject=options.subject||'',recipients='',headers=false,depth=0;
 const flush=()=>{const body=lines.join('\n').trim();if(body)parts.push({body,sender,subject,recipients});lines=[];};
 for(const raw of String(text||'').replace(/\r/g,'').split('\n')){
  const level=(raw.match(/^\s*(?:>\s*)+/)?.[0].match(/>/g)||[]).length,line=raw.replace(/^\s*(?:>\s*)+/,'');
  if(/^(?:\s*[-_—]{2,}\s*(?:Original|Ursprüngliche|Weitergeleitete|Forwarded)|\s*Am .{5,}schrieb.{0,100}:|\s*On .{5,}wrote:)/i.test(line)){flush();sender='';subject='';recipients='';headers=true;depth=level;continue;}
  if(level!==depth&&lines.some(s=>s.trim())){flush();sender='';subject='';recipients='';}depth=level;
  const from=line.match(/^\s*(?:Von|From):\s*(.+)$/i);if(from){flush();sender=from[1].trim();subject='';recipients='';headers=true;continue;}
  if(headers&&/^\s*(?:An|To|Cc|Bcc|Gesendet|Sent|Date|Datum|Betreff|Subject):/i.test(line)){const m=line.match(/^\s*(?:Betreff|Subject):\s*(.+)$/i);if(m)subject=m[1].trim();const to=line.match(/^\s*(?:An|To):\s*(.+)$/i);if(to)recipients=to[1].trim();continue;}
  if(!line.trim())headers=false;lines.push(line);
 }
 flush();return parts.length?parts:[{body:String(text||''),sender:options.sender||'',subject:options.subject||''}];
}
