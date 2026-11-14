import {test} from 'node:test';import assert from 'node:assert/strict';import {parseReservationDate,splitReservationName} from './server/resend-mail/reservation-fields.mjs';import {parseMail,reservationCandidate} from './server/resend-mail/mail-core.mjs';
const options={receivedAt:'2026-11-14T12:00:00Z',knownFirstNames:['Alex','Astrid','Anna','Jean Pierre']};
test('German written months, abbreviations, numeric, ISO and two-digit years agree',()=>{
 for(const value of ['11. Dezember 2026','11. Dez. 2026','11 Dez 26','11.DEZEMBER2026','11.12.2026','11.12.26','11/12/2026','11-12-2026','2026-12-11','Freitag, den 11. Dezember 2026'])assert.equal(parseReservationDate(value,options).date,'2026-12-11',value);
 const monthNames=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];monthNames.forEach((m,i)=>assert.equal(parseReservationDate('11. '+m+' 2027',options).date,`2027-${String(i+1).padStart(2,'0')}-11`));
 for(const month of ['März','Maerz','Mrz.'])assert.equal(parseReservationDate('11. '+month+' 2027',options).date,'2027-03-11');
});
test('missing years follow winter season and remain explicitly marked for review',()=>{
 for(const value of ['11. Dezember','11. Dez.','11.12.']){const r=parseReservationDate(value,options);assert.equal(r.date,'2026-12-11');assert.equal(r.inferredYear,true);assert.match(r.issues[0],/Jahr nicht angegeben/);}
 assert.equal(parseReservationDate('11. Jan.',options).date,'2027-01-11');assert.equal(parseReservationDate('11. Dezember',{receivedAt:'2027-01-02'}).date,'2026-12-11');
});
test('invalid dates, alternatives and ranges cannot silently choose one date',()=>{
 for(const value of ['31. Februar 2026','31.04.2026','2026-13-11','11. oder 12. Dezember','11.–12. Dezember','11-12 Dezember','11. Dez. oder 18. Dez.','11.12.2026 / 18.12.2026'])assert.equal(parseReservationDate(value,options).date,'',value);
 assert.equal(parseReservationDate('2028-02-29',options).date,'2028-02-29');assert.equal(parseReservationDate('2027-02-29',options).date,'');
 assert.match(parseReservationDate('Montag, 11. Dezember 2026',options).issues[0],/Wochentag/);
});
test('form field wins over forwarded headers, equivalent duplicates agree, conflicting dates need review',()=>{
 const base='Name/Vorname: Alex Muster\nUhrzeit: 18:30\nPersonen: 2\n';
 const r=parseMail('Gesendet: 14. November 2026\n'+base+'Datum: 11. Dezember 2026\nDatum: 11.12.2026',options);assert.equal(r.draft.date,'2026-12-11');assert.equal(r.complete,true);assert.deepEqual([r.draft.data.first,r.draft.data.last],['Alex','Muster']);
 const conflict=parseMail(base+'Datum: 11.12.2026\nDatum: 18. Dezember 2026',options);assert.equal(conflict.draft.date,'');assert.equal(reservationCandidate(conflict),false);
 assert.equal(parseMail('Gesendet: 14.11.2026\nName: Alex Muster',options).draft.date,'');
 assert.equal(parseMail(base+'Wir möchten am 11. Dezember 2026 reservieren.',options).draft.date,'2026-12-11');
});
test('separate fields, comma order, explicit label order, known first names and surname particles are supported',()=>{
 const cases=[['Alex Muster','Name/Vorname','Alex','Muster'],['Wild Astrid','Name/Vorname','Astrid','Wild'],['Muster, Alex','Name/Vorname','Alex','Muster'],['Alex van der Meer','Name/Vorname','Alex','van der Meer'],['Muster Jean Pierre','Name/Vorname','Jean Pierre','Muster'],['Muster Alex','Nachname/Vorname','Alex','Muster']];
 for(const [combined,label,first,last] of cases){const n=splitReservationName({combined,label,knownFirstNames:options.knownFirstNames});assert.equal(n.first,first,combined);assert.equal(n.last,last,combined);assert.equal(n.issues.length,0,combined);}
 const r=parseMail('Nachname: van der Meer\nVorname: Alex\nDatum: 11.12.2026\nUhrzeit: 18:30\nPersonen: 2',options);assert.equal(r.draft.data.last,'van der Meer');assert.equal(r.draft.data.first,'Alex');
});
test('unknown name order is provisional, group names are not invented as a single person',()=>{
 const r=splitReservationName({combined:'Unbekannt Beispiel',label:'Name/Vorname'});assert.equal(r.first,'Unbekannt');assert.equal(r.last,'Beispiel');assert.match(r.issues[0],/Nameaufteilung/);
 for(const combined of ['Sabrina und Oliver','Muster & Partner','Test GmbH']){const n=splitReservationName({combined});assert.equal(n.first,'');assert.equal(n.last,combined);assert(n.issues.length);}
});

test('walk-in placeholder remains intact, and common given names resolve reversed order',()=>{assert.deepEqual(splitReservationName({combined:'walk in'}),{last:'walk in',first:'',issues:[]});for(const [combined,first,last] of [['Höck Herbert','Herbert','Höck'],['Meier Nadine','Nadine','Meier'],['Justyna Wójcik','Justyna','Wójcik']]){const r=splitReservationName({combined});assert.equal(r.first,first);assert.equal(r.last,last);}});

test('combined name plus a separate first name never duplicates that first name into the surname',()=>{for(const combined of ['Alex Muster','Muster Alex','Muster, Alex','Muster'])assert.deepEqual(splitReservationName({combined,first:'Alex'}),{first:'Alex',last:'Muster',issues:[]});});
