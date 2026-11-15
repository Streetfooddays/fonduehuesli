const MONTHS={januar:1,jan:1,january:1,jänner:1,jaenner:1,februar:2,feb:2,febr:2,february:2,märz:3,maerz:3,mrz:3,mär:3,mar:3,march:3,april:4,apr:4,mai:5,may:5,juni:6,jun:6,june:6,juli:7,jul:7,july:7,august:8,aug:8,september:9,sept:9,sep:9,oktober:10,okt:10,october:10,oct:10,november:11,nov:11,dezember:12,dez:12,december:12,dec:12};
const months=Object.keys(MONTHS).sort((a,b)=>b.length-a.length).join('|');
const iso=new RegExp('(?<![\\d])([12]\\d{3})-(\\d{1,2})-(\\d{1,2})(?![\\d])','g');
const numeric=/(?<![\d])(\d{1,2})\s*([./-])\s*(\d{1,2})(?:\s*\2\s*(\d{4}|\d{2})(?![\d:]))?\.?/g;
const written=new RegExp('(?<![\\p{L}\\d])(\\d{1,2})\\.?\\s*('+months+')(?![\\p{L}])\\.?(?:\\s*(\\d{4}|\\d{2})(?![\\d:.,]|\\s*Uhr))?','giu');
function isoDate(year,month,day){const s=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?s:'';}
export function parseReservationDate(value,{receivedAt=new Date()}={}){
 const raw=String(value||'').replace(/[\u00a0\u202f]/g,' ').trim(),issues=[];
 if(!raw)return {date:'',issues,inferredYear:false};
 const ref=new Date(receivedAt);const reference=Number.isFinite(ref.getTime())?ref:new Date();
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit'}).formatToParts(reference).map(p=>[p.type,p.value]));
 const currentYear=Number(parts.year),refMonth=Number(parts.month),seasonStart=currentYear-(refMonth<7?1:0);
 const matches=[];let inferredYear=false;
 const add=(m,year,month,day)=>{
  if(matches.some(x=>m.index<x.end&&m.index+m[0].length>x.start))return;
  let y=year?Number(year):month>=10?seasonStart:month<=2?seasonStart+1:currentYear;
  if(year&&String(year).length===2)y+=2000;if(!year)inferredYear=true;
  matches.push({start:m.index,end:m.index+m[0].length,date:isoDate(y,Number(month),Number(day))});
 };
 for(const m of raw.matchAll(iso))add(m,m[1],m[2],m[3]);
 for(const m of raw.matchAll(numeric)){if(/^\s*(?:Uhr|h)\b/i.test(raw.slice(m.index+m[0].length))||/\bum\s*$/i.test(raw.slice(0,m.index)))continue;add(m,m[4],m[3],m[1]);}
 for(const m of raw.matchAll(written))add(m,m[3],MONTHS[m[2].toLocaleLowerCase('de-CH')],m[1]);
 const dates=[...new Set(matches.map(m=>m.date).filter(Boolean))];
 const range=[...raw.matchAll(/\b\d{1,2}\.?(?:\s*[-–]\s*|\s+(?:oder|und|bis)\s+)\d{1,2}/gi)].some(r=>!matches.some(m=>r.index>=m.start&&r.index<m.end))||new RegExp('\\b\\d{1,2}\\.?\\s*[-–]\\s*\\d{1,2}\\.?\\s*(?:'+months+')(?![\\p{L}])','iu').test(raw);
 if(dates.length>1||range){issues.push('Mehrere Datumsangaben oder Datumsbereich: bitte manuell prüfen.');return {date:'',issues,inferredYear};}
 if(matches.some(m=>!m.date)){issues.push('Ungültige Datumsangabe: bitte manuell prüfen.');return {date:'',issues,inferredYear};}
 const date=dates[0]||'';
 if(date&&inferredYear)issues.push('Jahr nicht angegeben; '+date.slice(0,4)+' anhand des Maileingangs / der Wintersaison ergänzt. Bitte prüfen.');
 const weekday=raw.match(/^(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|mo|di|mi|do|fr|sa|so)\.?\s*[, ]/i);
 if(date&&weekday){const expected={so:0,mo:1,di:2,mi:3,do:4,fr:5,sa:6}[weekday[1].slice(0,2).toLowerCase()];if(new Date(date+'T12:00:00Z').getUTCDay()!==expected)issues.push('Wochentag und Datum passen nicht zusammen. Bitte prüfen.');}
 return {date,issues,inferredYear};
}
const COMMON_FIRST_NAMES='anna annina alex alexander andrea andreas angela anita antonio ariana astrid barbara bruno carola cecil christian christina claudia daniel daniela david emanuele erwin fabienne franz gabriela hans harry heinz helene herbert hubert jan jasmin jean jennifer jessica joel jonathan justyna karin katia katharina klaus laura leandra lisa lukas madeleine manuela marc marcel marco margit maria mario markus martina martin matthias michael michele mirjam nadine nico nicole nina noah oliver patrick paul peter philip philipp philippe prisca rahel renata reni reto roger roman ruth sabina sabine sabrina sandra sandro sarah sebastian silvia simon sonja stefan susanne sven tanja tatjana therese thomas tim urs ursula valentina walter yves'.split(' ');
const norm=s=>String(s||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}]/gu,'');
export function splitReservationName({last='',first='',combined='',label='',knownFirstNames=[]}={}){
 last=last.trim();first=first.trim();combined=combined.replace(/\s+/g,' ').trim();const issues=[];
 if(last||first){
  if(combined&&first&&!last&&!/[&+/]|\bund\b/i.test(combined)){
   const fields=combined.split(',').map(s=>s.trim()),tokens=combined.split(' '),n=first.split(/\s+/).length;
   if(fields.length===2&&norm(fields[1])===norm(first))last=fields[0];
   else if(norm(tokens.slice(0,n).join(' '))===norm(first))last=tokens.slice(n).join(' ');
   else if(norm(tokens.slice(-n).join(' '))===norm(first))last=tokens.slice(0,-n).join(' ');
   else last=combined;
  }
  if(combined&&last&&first&&![norm(last+first),norm(first+last)].includes(norm(combined))&&norm(combined)!==norm(last))issues.push('Mehrere Angaben: unterschiedliche Namen. Bitte prüfen.');
  return {last,first,issues};
 }
 if(!combined)return {last:'',first:'',issues};
 if(/^walk[ -]?in$/i.test(combined))return {last:combined,first:'',issues};
 const clean=combined.replace(/^(?:herr(?:n)?|frau|dr\.?|prof\.?)\s+/gi,'').trim();
 if(/\s(?:und|&)\s|[+/;]|\bund\b/i.test(clean)){issues.push('Mehrere Personen im Namensfeld: bitte Vor- und Nachnamen manuell zuordnen.');return {last:combined,first:'',issues};}
 if(clean.includes(',')){
  const fields=clean.split(',').map(s=>s.trim());if(fields.length===2&&fields.every(Boolean))return {last:fields[0],first:fields[1],issues};
  issues.push('Nameaufteilung bitte prüfen.');return {last:combined,first:'',issues};
 }
 if(/\b(?:AG|GmbH|Firma|Verein|Schule)\b/i.test(clean)){issues.push('Namensangabe enthält möglicherweise eine Firma oder Gruppe. Bitte prüfen.');return {last:combined,first:'',issues};}
 const words=clean.split(' ');if(words.length<2)return {last:clean,first:'',issues};
 if(/^nachname\s*\/\s*vorname$|^name und vorname$|^(?:nachname|name),\s*vorname$/i.test(label))return {last:words[0],first:words.slice(1).join(' '),issues};
 if(/^vorname\s*\/\s*nachname$|^vorname und nachname$/i.test(label))return {first:words[0],last:words.slice(1).join(' '),issues};
 const known=new Set([...COMMON_FIRST_NAMES,...knownFirstNames].filter(n=>n&&!/[,;&+/]|\bund\b/i.test(n)).map(norm));const candidates=[];
 for(let i=1;i<words.length;i++){
  const a=words.slice(0,i).join(' '),b=words.slice(i).join(' ');
  if(known.has(norm(a)))candidates.push({first:a,last:b});if(known.has(norm(b)))candidates.push({first:b,last:a});
 }
 const unique=[...new Map(candidates.map(c=>[norm(c.first)+'|'+norm(c.last),c])).values()];
 if(unique.length===1)return {...unique[0],issues};
 issues.push('Nameaufteilung bitte prüfen: Reihenfolge im gemeinsamen Namensfeld nicht eindeutig.');
 return {first:words[0],last:words.slice(1).join(' '),issues};
}
