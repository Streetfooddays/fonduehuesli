import {parseInquiry,type Inquiry} from './model.ts';
export function parseUploadedInquiry(raw:string):Inquiry{
 const text=raw.replace(/\r/g,'').replace(/[\t\u00a0]+/g,' '),q=parseInquiry(text);
 const field=(labels:string)=>{const m=text.match(new RegExp('(?:^|\\n)[ \t]*(?:'+labels+')[ \t]*[:=]?[ \t]+([^\\n]+)','i'));return m?.[1]?.trim()||'';};
 const signature=text.match(/(?:freundlichen\s+Gr[uü]ssen|freundlichen\s+Gr[uü]ßen|Gruss|Grüße)\s*\n+\s*([^\n]+)/i)?.[1]?.trim();
 const first=field('Vorname'),last=field('Nachname|Familienname');if(signature&&signature.split(/\s+/).length>=2)q.name=signature;else if(first&&last)q.name=first+' '+last;else if(first&&!q.name)q.name=first;
 const company=field('Firma|Unternehmen');if(company&&company!=='Firma'&&!q.name.toLowerCase().includes(company.toLowerCase()))q.company=company;else q.company='';
 q.phone=field('Telefon|Mobile|Tel\\.?')||q.phone;
 const street=field('Strasse und Nr|Strasse & Nr\\.?|Straße und Nr|Strasse|Straße'),zip=field('PLZ'),town=field('Ort');if(street)q.address=[street,[zip,town].filter(Boolean).join(' ')].filter(Boolean).join('\n');
 q.venue=field('Veranstaltungsort|Anlassort|Location')||'';
 const dt=field('Datum|Anlassdatum');const d=dt.match(/(\d{1,2})\.(\d{1,2})\.(20\d{2})/);if(d)q.date=`${d[3]}-${d[2].padStart(2,'0')}-${d[1].padStart(2,'0')}`;
 const people=field('Anzahl Personen|Anzahl Gäste|Personen|Gästezahl');if(people)q.guests=Number(people.match(/\d+/)?.[0]||0);
 const offer=field('ich interessiere mich für folgende Angebote|Angebot|Menü');if(offer)q.menu=/raclette/i.test(offer)&&!/fondue/i.test(offer)?'Raclette':'Fondue';else if(/fondue/i.test(text))q.menu='Fondue';
 const notes=text.match(/(?:^|\n)\s*(?:Bemerkungen|Nachricht|Wünsche)\s*[:=]?\s*([\s\S]*)/i);if(notes)q.notes=notes[1].replace(/\n\s*Bemerkungen\s*$/i,'').trim();
 const services=field('Wir benötigen folgende Dienstleistungen|Dienstleistungen'),service=field('Service|Durchführung');q.notes=[service&&'Gewünschter Service: '+service,services&&'Gewünschte Dienstleistungen: '+services,q.notes].filter(Boolean).join('\n\n');
 q.service=/selbstabholung/i.test(text)?'Selbstabholung':/nur lieferung|lieferung ohne (?:zubereitung|betreuung|service)/i.test(text)?'Nur Lieferung':'Mit Betreuung';
 q.staff=0;q.hours=0;if(!/moiti[eé]|bergk[aä]se|tr[uü]ffel|chili|fondue ohne alkohol/i.test(text))q.varieties=[];
 q.source='Dateiimport';return q;
}
