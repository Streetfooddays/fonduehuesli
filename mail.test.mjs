import {readFileSync} from 'node:fs';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseMail,htmlText,verifySignature,reservationCandidate} from './server/resend-mail/mail-core.mjs';
const valid='Nachname: Muster\nVorname: Lisa\nDatum: 01.12.2026\nUhrzeit: 18:30\nAnzahl Personen: 6\nE-Mail: lisa@example.ch';
test('structured reservation parses without inventing missing details',()=>{const r=parseMail(valid);assert.equal(r.complete,true);assert.equal(r.draft.date,'2026-12-01');assert.equal(r.draft.people,6);assert.equal(r.draft.data.email,'lisa@example.ch');assert.equal(parseMail(valid.replace('2026','2025')).draft.date,'2025-12-01');const free=parseMail('Wir kommen nächsten Freitag zu sechst.');assert.equal(free.complete,false);assert.equal(free.draft.date,'');assert.equal(free.draft.people,6);});
test('invalid dates, duplicate fields, attachments and changes require review',()=>{for(const s of [valid.replace('01.12.2026','31.02.2026'),valid+'\nDatum: 02.12.2026',valid+'\nBitte stornieren',valid+'\nFonduegondel: Ja'])assert.equal(parseMail(s).complete,false);assert.equal(parseMail(htmlText('<table><tr><td>Datum</td><td>01.12.2026</td></tr><tr><td>Personen</td><td>6</td></tr></table>')).draft.people,6);});
test('signatures reject forged payloads and expired requests',async()=>{const secretBytes=new TextEncoder().encode('only-a-synthetic-test-secret-1234'),secret='whsec_'+btoa(String.fromCharCode(...secretBytes)),ts=String(Math.floor(Date.now()/1000)),id='msg_test',payload='{"type":"email.received"}';const key=await crypto.subtle.importKey('raw',secretBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(id+'.'+ts+'.'+payload));const h=new Headers({'svix-id':id,'svix-timestamp':ts,'svix-signature':'v1,'+btoa(String.fromCharCode(...new Uint8Array(signature)))});assert.equal(await verifySignature(payload,h,secret),true);assert.equal(await verifySignature(payload+' ',h,secret),false);assert.equal(await verifySignature(payload,h,secret,Number(ts)+301),false);assert.equal(await verifySignature(payload,new Headers(),secret),false);});

test('Weebly forwarded form: blank lines, abbreviated fields, compact time and mailto address',()=>{const text='Von: form@example.invalid\nGesendet: Sonntag, 25. Oktober 2026 11:30\n\nÜbermittelte Informationen:\n\nName/Vorname\nAlex Muster\n\nStrasse/Nr\nBeispielstrasse 20\n\nE-Mail\ngast@example.ch <mailto:gast@example.ch>\n\nAnzahl Pers. \n2\n\nDatum \n19.11.2026\n\nUhrzeit\n1900\n\nKommentar\nTest';const r=parseMail(text,{knownFirstNames:['Alex']});assert.equal(r.complete,true);assert.deepEqual([r.draft.date,r.draft.time,r.draft.people],['2026-11-19','19:00',2]);assert.equal(r.draft.data.last,'Muster');assert.equal(r.draft.data.first,'Alex');assert.equal(r.draft.data.street,'Beispielstrasse 20');assert.equal(r.draft.data.email,'gast@example.ch');assert.equal(r.draft.data.comment,'Test');});
test('separate labels accept colon times without taking the next label as a value',()=>{const r=parseMail('Name/Vorname\nTest Person\nDatum\n19.11.2026\nUhrzeit\n19:00\nAnzahl Pers.\n2',{knownFirstNames:['Test']});assert.equal(r.complete,true);assert.equal(r.draft.time,'19:00');assert.equal(parseMail('Datum\nUhrzeit\n19:00').draft.date,'');assert.equal(parseMail('Uhrzeit: 2460').draft.time,'');});

test('provisional reservations are captured despite attachment review or missing time',()=>{const p=parseMail(valid);p.issues.push('Anhänge im Originalpostfach prüfen.');p.complete=false;assert.equal(reservationCandidate(p),true);assert.equal(reservationCandidate(parseMail(valid.replace('Uhrzeit: 18:30',''))),true);assert.equal(reservationCandidate(parseMail('Test')),false);assert.equal(reservationCandidate(parseMail(valid+'\nDatum: 02.12.2026')),false);assert.equal(reservationCandidate(parseMail(valid+'\nBitte stornieren')),false);});

test('free text recognizes dates, times, guest count and signature or booking name across lines',()=>{
 const options={receivedAt:'2026-11-15T10:00:00Z',sender:'Anna Muster <anna@example.invalid>'};
 for(const [text,day,time,people,first,last] of [
 ['Wir möchten am 12. Dezember um 19 Uhr für 6 Personen reservieren.\nGruss\nAnna Muster','2026-12-12','19:00',6,'Anna','Muster'],
 ['Guten Tag\nAm 12.12.2026\n18:30 Uhr\nfür 4 Personen\nFreundliche Grüsse\nOliver Oetjen','2026-12-12','18:30',4,'Oliver','Oetjen'],
 ['Kann ich für 8 Personen am 11. Dez. um 18.30 Uhr reservieren? Auf den Namen Anna Muster.','2026-12-11','18:30',8,'Anna','Muster'],
 ['Wir sind zu viert und würden am 9. Januar 2027 gegen 19:15 kommen.\nGruss Anna Muster','2027-01-09','19:15',4,'Anna','Muster'],
 ['Name: Anna Muster\nIch würde gerne am 12.12.2026 um 19 Uhr für 3 Personen reservieren.','2026-12-12','19:00',3,'Anna','Muster']]){
  const p=parseMail(text,options);assert.deepEqual([p.draft.date,p.draft.time,p.draft.people,p.draft.data.first,p.draft.data.last],[day,time,people,first,last]);assert.equal(p.complete,false);assert(p.issues.some(i=>i.includes('Freie E-Mail')));
 }
});
test('free text leaves conflicts and invalid hours unresolved and flags quoted history for review',()=>{
 const options={receivedAt:'2026-11-15T10:00Z',sender:'Anna Muster <anna@example.invalid>'};
 assert.equal(parseMail('Reservieren am 12. oder 13. Dezember für 4 Personen um 19 Uhr.',options).draft.date,'');
 assert.equal(parseMail('Reservieren am 12.12.2026 für 4 Personen um 18 oder um 19 Uhr.',options).draft.time,'');
 assert.equal(parseMail('Reservieren am 12.12.2026 für 4 Personen um 25 Uhr.',options).draft.time,'');
 const p=parseMail('Vielen Dank!\n\nAm 01.11.2026 schrieb Fonduehüsli:\nReservation am 12.12.2026 um 19 Uhr für 6 Personen.\nGruss Anna Muster',options);assert.equal(p.draft.date,'2026-12-12');assert.equal(p.draft.people,6);assert(p.issues.some(i=>i.includes('Mailverlauf')));
});

test('free text can use the subject and leaves partial adult/child counts for manual review',()=>{
 const p=parseMail('Guten Tag\nGruss Anna Muster',{receivedAt:'2026-11-15',subject:'Reservation 12.12.2026, 4 Personen, 19:00 Uhr'});assert.deepEqual([p.draft.date,p.draft.time,p.draft.people],['2026-12-12','19:00',4]);
 assert.equal(parseMail('Am 12.12.2026 kommen 6 Erwachsene und 2 Kinder um 19 Uhr. Gruss Anna Muster').draft.people,null);
});

test('browser and webhook use the same recognition implementation',()=>{for(const name of ['mail-core.mjs','reservation-fields.mjs','free-text.mjs'])assert.equal(readFileSync(new URL('./public/'+name,import.meta.url),'utf8'),readFileSync(new URL('./server/resend-mail/'+name,import.meta.url),'utf8'));});

test('a standalone clock and a plain signature line are recognized without inventing names from polite closing text',()=>{
 const p=parseMail('Gerne möchten wir am 12.12.2026 für 4 Personen reservieren.\n18:30\nVielen Dank\nAnna Muster');assert.deepEqual([p.draft.date,p.draft.time,p.draft.people,p.draft.data.first,p.draft.data.last],['2026-12-12','18:30',4,'Anna','Muster']);
 assert.equal(parseMail('Wir reservieren am 12.12.2026 für 4 Personen um 19 Uhr.\nVielen Dank').draft.data.first,'');
});

test('whole-thread recognition finds an older form behind a short reply and applies clear newer changes',()=>{
 const original='Von: Anna Muster <anna@example.invalid>\nGesendet: Montag, 2. November 2026\nBetreff: Reservation\n\nNachname: Muster\nVorname: Anna\nDatum: 12.12.2026\nUhrzeit: 18:30\nAnzahl Personen: 6\nE-Mail: anna@example.invalid';
 const p=parseMail('Vielen Dank, passt!\n\n-----Original Message-----\n'+original,{receivedAt:'2026-11-15',sender:'Team <team@example.invalid>'});assert.deepEqual([p.draft.date,p.draft.time,p.draft.people,p.draft.data.first,p.draft.data.last,p.draft.data.email],['2026-12-12','18:30',6,'Anna','Muster','anna@example.invalid']);assert.equal(p.complete,false);
 const changed=parseMail('Wir kommen nun mit 8 Personen und um 19 Uhr.\n\nAm 02.11.2026 schrieb Anna:\n'+original.split('\n').map(s=>'> '+s).join('\n'),{receivedAt:'2026-11-15'});assert.deepEqual([changed.draft.date,changed.draft.time,changed.draft.people,changed.draft.data.first],['2026-12-12','19:00',8,'Anna']);assert(changed.issues.some(i=>i.includes('Änderung im Mailverlauf')));assert.equal(reservationCandidate(changed),false);
});
