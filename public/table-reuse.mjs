import {escapeHTML as e} from './core.mjs';
export function tableReuseCandidate(path,body){
 const name=path.split('?')[0].split('/').pop();
 if(['save_reservation','save_walk_in'].includes(name)&&body?.payload?.action==='save')return body.payload.reservation;
 if(name==='mail_review'&&body?.p?.action==='convert')return body.p.reservation;
 if(name==='set_reservation_table')return body?.p;
 if(name==='set_reservation_people')return body?.p;
 if(name==='set_reservation_arrival'&&body?.p?.arrived===true)return {...body.p,arriving:true};
 if(name==='confirmation-mail'&&body?.action==='send')return body.reservation;
 if(name==='confirmation_prepare')return body?.p?.reservation;
 return null;
}
export async function ensureTableReuse(candidate,{check,ask,release,onReleased=()=>{}}){
 const conflicts=await check(candidate);if(!conflicts.length)return;
 if(!await ask(conflicts)){const error=Error('Tischzuteilung nicht gespeichert: Der Tisch ist noch besetzt.');error.code='TABLE_REUSE_CANCELLED';throw error;}
 const changed=await release(conflicts);onReleased(changed);
}
export function askTableReuse(conflicts){return new Promise(resolve=>{
 const popup=document.createElement('dialog');popup.className='table-reuse-dialog';
 popup.setAttribute('aria-labelledby','table-reuse-title');
 const tables=[...new Set(conflicts.flatMap(c=>c.tables))];
 popup.innerHTML=`<h2 id="table-reuse-title">${tables.length===1?'Ist der Tisch wieder frei?':'Sind die Tische wieder frei?'}</h2><p>Hier wurden bereits Gäste als angekommen markiert:</p><ul>${conflicts.map(c=>`<li><strong>${e(c.tables.join(', '))}</strong> · ${e(c.name||'Reservation')}${c.time?' · '+e(c.time):''}</li>`).join('')}</ul><p>Die bisherige Reservation bleibt erhalten.</p><div class="actions"><button type="button" class="secondary" data-reuse-no>Nein, noch besetzt</button><button type="button" data-reuse-yes>Ja, wieder frei</button></div>`;
 const finish=value=>{popup.close();popup.remove();resolve(value);};
 popup.querySelector('[data-reuse-no]').onclick=()=>finish(false);popup.querySelector('[data-reuse-yes]').onclick=()=>finish(true);
 popup.oncancel=event=>{event.preventDefault();finish(false);};document.body.append(popup);popup.showModal();popup.querySelector('[data-reuse-no]').focus();
});}
