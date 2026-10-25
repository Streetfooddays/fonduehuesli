const names={date:['datum','reservationsdatum','reservationswunsch','wunschdatum'],time:['zeit','uhrzeit','ankunftszeit'],people:['personen','anzahl personen','personenzahl','anzahl gäste','anzahl gaeste','anzahl pers.','anzahl pers','anzahl personen.'],last:['nachname','name','name/vorname','name / vorname','vorname/nachname','vorname / nachname'],first:['vorname'],email:['e-mail','email','e-mail-adresse','mailadresse'],phone:['telefon','telefonnummer','mobile'],street:['strasse','straße','strasse/nr','strasse/nr.','strasse / nr','straße/nr'],zip:['plz','postleitzahl'],city:['ort','wohnort'],company:['firma','unternehmen'],comment:['kommentar','bemerkungen','nachricht','mitteilung','wünsche','wuensche'],gondola:['fonduegondel','gondel']};
export function htmlText(html=''){
 if(html.startsWith('data:text/html;base64,'))try{html=new TextDecoder().decode(Uint8Array.from(atob(html.slice(22)),c=>c.charCodeAt(0)));}catch{return '';}
 return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<\/(?:td|th)>\s*<(?:td|th)\b[^>]*>/gi,': ').replace(/<(?:br|\/p|\/div|\/tr|\/li)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';}).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,k)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[k]));
}
export function parseMail(text){
 const found={},issues=[];const lines=String(text||'').replace(/\r/g,'').split('\n').map(s=>s.replace(/^\s*>\s?/,'').trim()).filter(Boolean);
 for(let i=0;i<lines.length;i++){
  const line=lines[i],match=line.match(/^([^:]{2,40}):\s*(.*)$/);let label=match?match[1].trim().toLowerCase():line.toLowerCase(),value=match?match[2].trim():'';
  const key=Object.keys(names).find(k=>names[k].includes(label));if(!key)continue;
  if(!value&&lines[i+1]){const nextLabel=lines[i+1].replace(/:$/,'').trim().toLowerCase();if(!Object.values(names).some(list=>list.includes(nextLabel)))value=lines[++i];}
  if(!value)continue;if(found[key]&&found[key]!==value)issues.push('Mehrere Angaben: '+label);else found[key]=value.slice(0,4000);
 }
 let date='',time='',people=null;
 const m=(found.date||'').match(/^(?:(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\.(\d{1,2})\.(\d{4}))$/);
 if(m){date=m[1]?`${m[1]}-${m[2]}-${m[3]}`:`${m[6]}-${m[5].padStart(2,'0')}-${m[4].padStart(2,'0')}`;const dt=new Date(date+'T12:00:00Z');if(!Number.isFinite(dt.getTime())||dt.toISOString().slice(0,10)!==date)date='';}
 const clock=(found.time||'').replace(/^(\d{1,2})(\d{2})$/,'$1:$2');
 const t=clock.match(/^([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*Uhr)?$/i);if(t)time=t[1].padStart(2,'0')+':'+t[2];
 const n=(found.people||'').match(/^(\d{1,4})(?:\s*(?:Personen|Person|Gäste|Gaeste))?$/i);if(n&&Number(n[1])>=1&&Number(n[1])<=1000)people=Number(n[1]);
 if(!date)issues.push('Datum fehlt oder ist nicht eindeutig.');if(!time)issues.push('Uhrzeit fehlt oder ist nicht eindeutig.');if(!people)issues.push('Personenzahl fehlt oder ist nicht eindeutig.');if(!found.last&&!found.first)issues.push('Name fehlt.');
 const data={};for(const k of ['last','first','email','phone','street','zip','city','company','comment'])data[k]=found[k]||'';
 const mailto=data.email.match(/^([^\s<>]+@[^\s<>]+)\s*<mailto:([^<>]+)>$/i);if(mailto&&mailto[1].toLowerCase()===mailto[2].toLowerCase())data.email=mailto[1];
 if(data.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)){data.email='';issues.push('E-Mail-Adresse prüfen.');}
 if(found.gondola&&!/^(nein|no|false|0)$/i.test(found.gondola))issues.push('Gondelwunsch bitte manuell zuordnen.');
 if(/\b(stornier\w*|absage|änderung|aenderung|verschieb\w*|annullier\w*)\b/i.test(text))issues.push('Mögliche Änderung oder Stornierung: manuell prüfen.');
 return {draft:{date,time,people,data},issues,complete:issues.length===0};
}
export async function verifySignature(payload,headers,secret,now=Date.now()/1000){
 const id=headers.get('svix-id'),ts=headers.get('svix-timestamp'),sig=headers.get('svix-signature');
 if(!id||!ts||!sig||!/^\d+$/.test(ts)||Math.abs(now-Number(ts))>300||!secret?.startsWith('whsec_'))return false;
 try{const bytes=Uint8Array.from(atob(secret.slice(6)),c=>c.charCodeAt(0));const key=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['verify']);const data=new TextEncoder().encode(`${id}.${ts}.${payload}`);
  for(const part of sig.split(' ')){if(!part.startsWith('v1,'))continue;try{const signature=Uint8Array.from(atob(part.slice(3)),c=>c.charCodeAt(0));if(await crypto.subtle.verify('HMAC',key,signature,data))return true;}catch{}}
 }catch{}return false;
}

export function reservationCandidate(parsed){
 const d=parsed.draft;return !!(d.date&&d.people&&(d.data.last||d.data.first)&&!parsed.issues.some(s=>/Mehrere Angaben|Änderung|Stornierung|gekürzt/.test(s)));
}
