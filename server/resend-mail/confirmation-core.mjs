export const DEFAULT_BODY='Vielen Dank für deine Reservation, welche wir dir gerne bestätigen.\n\nWir freuen uns euch bald im Fonduehüsli auf dem Lindenhof zu begrüssen.';
export const DEFAULT_SIGNATURE='Liebe Grüsse\n\nSabrina\n\nFonduehüsli ein Projekt von\nSOO! Event & Catering GmbH\nTrottenstrasse 20\n8180 Bülach\n079/484 46 84';
export const FROM='Fonduehüsli Bülach <reservation@fonduehuesli.ch>';
export const BANNER='https://fonduehuesli-reservationen.onrender.com/mail-banner.png';
const female=new Set('sybille sibylle sabrina sandra susanne susanna nicole monika monique claudia karin corinne corina brigitte barbara andrea anna anne maria marie ursula ruth elisabeth christine christina stephanie stefanie daniela manuela petra renate sonja tanja katrin beatrice regina verena heidi irene silvia sylvia carmen simone eveline evelyn sarah sara laura lisa lea leonie julia sophia sofia emma nina nora lena mia eva ines nadine melanie jessica michelle francesca giulia valentina'.split(' '));
const male=new Set('oliver hans peter thomas daniel markus marcus marco marc michael stefan stephan andreas martin patrick pascal christian christoph urs reto beat roger roland bruno walter werner kurt paul robert philipp lukas lucas luca jan jonas noah leon david simon samuel fabian florian benjamin dominik matthias mathias alexander sebastian raphael rafael manuel marcel josef johann heinz erich alfred adrian'.split(' '));
export function suggestSalutation(first=''){const name=first.trim().toLocaleLowerCase('de-CH').split(/[ -]/)[0];return female.has(name)?'Liebe':male.has(name)?'Lieber':'';}
export function validEmail(email){return typeof email==='string'&&email.length<=254&&/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(email);}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function confirmationMessage({reservation:r,body=DEFAULT_BODY,signature=DEFAULT_SIGNATURE,subject}){
 const d=typeof r.data==='string'?JSON.parse(r.data):r.data||{};
 const first=String(d.first||'').trim(),salutation=d.salutation;
 if(!first||first.length>100||/[\r\n]/.test(first)||!['Liebe','Lieber'].includes(salutation))throw Error('Vorname und Anrede bitte prüfen und ergänzen.');
 if(!validEmail(d.email))throw Error('Bitte eine gültige E-Mail-Adresse des Gastes angeben.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)||!Number.isInteger(r.people)||r.people<1)throw Error('Datum, Uhrzeit und Personenzahl bitte ergänzen.');
 if(!body.trim()||body.length>12000||signature.length>4000)throw Error('Antworttext und Signatur prüfen.');
 const day=new Intl.DateTimeFormat('de-CH',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Zurich'}).format(new Date(r.date+'T12:00:00Z'));
 const rendered=body.replaceAll('{{datum}}',day).replaceAll('{{zeit}}',r.time).replaceAll('{{personen}}',String(r.people));
 const text=`${salutation} ${first}\n\n${rendered.trim()}\n\nDeine Reservation: ${day}, ${r.time} Uhr, ${r.people} ${r.people===1?'Person':'Personen'}.${r.gondola?'\nDeine Reservation ist in einer Fonduegondel (maximal 4 Personen).':''}\n\n${signature.trim()}`;
 const title=String(subject||'Deine Reservationsbestätigung · Fonduehüsli Bülach').trim();
 if(!title||title.length>200||/[\r\n]/.test(title))throw Error('Betreff prüfen.');
 return {recipient:d.email.trim().toLowerCase(),subject:title,text,html:`<!doctype html><html lang="de"><body style="margin:0;padding:24px;font:15px Arial,sans-serif;color:#171717"><div style="max-width:650px">${text.split('\n\n').map(p=>'<p style="margin:0 0 22px">'+esc(p).replaceAll('\n','<br>')+'</p>').join('')}<img src="${BANNER}" width="630" alt="Fonduehüsli Lindenhof · Bülach · 11. November 2026 bis 6. Februar 2027" style="display:block;max-width:100%;height:auto"></div></body></html>`};
}
