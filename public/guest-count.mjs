import {escapeHTML as e,guest} from './core.mjs';

export function guestCountField(r,locked=false){
 const d=guest(r),name=[d.last,d.first].filter(Boolean).join(' ')||d.company||'Reservation';
 return `<label class="guest-count no-print"><input type="number" min="0" max="1000" step="1" inputmode="numeric" value="${r.people}" data-guest-count="${e(r.id)}" aria-label="Personenzahl für ${e(name)} am ${e(r.date)}" ${locked?'disabled':''}><span>Personen</span></label><small class="guest-count-feedback no-print" role="status">${locked?'Versand zuerst abschliessen':''}</small><span class="guest-count-print">${r.people} Personen</span>`;
}

export function bindGuestCounts(root,{find,save,saved,hidePreview=()=>{}}){
 root.querySelectorAll('[data-guest-count]').forEach(input=>{
  let previous=input.value,busy=false;
  const feedback=input.closest('td').querySelector('.guest-count-feedback');
  input.onfocus=input.onmouseenter=hidePreview;
  input.oninput=()=>{input.removeAttribute('aria-invalid');feedback.textContent=input.value===previous?'':'Noch nicht gespeichert';};
  input.onkeydown=ev=>{
   if(ev.key==='Enter'){ev.preventDefault();input.blur();}
   else if(ev.key==='Escape'){ev.preventDefault();input.value=previous;input.removeAttribute('aria-invalid');feedback.textContent='';input.blur();}
  };
  input.onblur=async()=>{
   if(busy||input.value===previous)return;
   const raw=input.value.trim(),value=Number(raw);
   if(!/^\d+$/.test(raw)||!Number.isSafeInteger(value)||value>1000){input.setAttribute('aria-invalid','true');feedback.textContent='Bitte 0 bis 1000 Personen eintragen.';return;}
   const booking=find(input.dataset.guestCount);if(!booking)return;
   busy=true;input.readOnly=true;input.setAttribute('aria-busy','true');feedback.textContent='Wird gespeichert …';
   try{
    const result=await save({id:booking.id,revision:booking.revision,people:value});
    Object.assign(booking,result);previous=String(result.people);input.value=previous;
    input.removeAttribute('aria-invalid');feedback.textContent='Gespeichert';
    input.closest('td').querySelector('.guest-count-print').textContent=`${result.people} Personen`;
    saved(booking);
   }catch(err){input.setAttribute('aria-invalid','true');feedback.textContent=err.message;}
   finally{busy=false;input.readOnly=false;input.removeAttribute('aria-busy');}
  };
 });
}
