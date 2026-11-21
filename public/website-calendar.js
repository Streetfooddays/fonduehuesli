// Embedded on fonduehuesli.ch; this endpoint exposes availability only, never guests.
(function(){'use strict';
function init(){
 const input=document.getElementById('input-618423413317317508');
 if(!input||input.dataset.fhCalendar)return;
 const form=input.closest('form');if(!form)return;input.dataset.fhCalendar='live-20261121';
 const endpoint='https://lfngszulhqncyqkxlcbs.supabase.co/rest/v1/rpc/reservation_calendar';
 const key='sb_publishable_u_9eWGABqMzXDZ6bvjRSBQ_8YH176Fw';
 const pad=n=>String(n).padStart(2,'0');
 function swissNow(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return {date:p.year+'-'+p.month+'-'+p.day,hour:Number(p.hour)};}
 function permitted(iso){const n=swissNow();return !!availability[iso]?.bookable&&(iso>n.date||iso===n.date&&n.hour<12);}
 let availability={},loading=null,error='',selected='',month=0,approvedUntil=0;
 const minMonth=2026*12+10,maxMonth=2027*12+1;
 const dialog=document.createElement('dialog');dialog.id='fh-date-dialog';dialog.setAttribute('aria-labelledby','fh-date-title');
 dialog.innerHTML='<h2 id="fh-date-title">Reservationsdatum wählen</h2><div class="fh-month-nav"><button type="button" id="fh-prev" aria-label="Vorheriger Monat">‹</button><span id="fh-month-title" aria-live="polite"></span><button type="button" id="fh-next" aria-label="Nächster Monat">›</button></div><div id="fh-calendar-grid" class="fh-days"></div><p id="fh-calendar-status" role="status" aria-live="polite"></p><button type="button" id="fh-calendar-retry" hidden>Verfügbarkeit erneut laden</button><p id="fh-calendar-hint">🟢 genügend Platz · 🟠 wenig Platz · 🔴 ausgebucht</p><button type="button" class="fh-close">Schliessen</button>';
 document.body.appendChild(dialog);
 const style=document.createElement('style');style.textContent='#fh-date-dialog .fh-day.fh-orange{background:#ffe0a3;color:#674100;border-color:#d6a04c}#fh-date-dialog .fh-day.fh-red:disabled{background:#f5c8c5;color:#811d17;border-color:#ca8c86;opacity:1}#fh-date-dialog .fh-day.fh-orange:hover:enabled{background:#ffd382}#fh-date-dialog .fh-day[aria-pressed=true]{outline:3px solid #634c2d;outline-offset:-3px}#fh-calendar-status{font:14px/1.4 Arial,sans-serif}#fh-calendar-retry{width:100%;border:1px solid #c4ad8b;background:#f4eee5;color:#30271f}';document.head.appendChild(style);
 const trigger=document.createElement('button');trigger.type='button';trigger.className='fh-date-trigger';trigger.textContent='Datum im Kalender wählen';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls',dialog.id);input.after(trigger);
 const help=document.createElement('small');help.id='fh-date-help';help.textContent='🟢 genügend Platz · 🟠 wenig Platz · 🔴 ausgebucht';trigger.after(help);
 input.readOnly=true;input.placeholder='TT.MM.JJJJ';input.setAttribute('aria-haspopup','dialog');input.setAttribute('aria-controls',dialog.id);input.setAttribute('aria-describedby',help.id);input.autocomplete='off';
 // Update the old same-day notice without altering the original Weebly form fields.
 const walker=document.createTreeWalker(form,4);let node;while((node=walker.nextNode())){if(node.textContent.includes('Für den gleichen Tag bitte anrufen'))node.textContent=node.textContent.replace(/Für den gleichen Tag bitte anrufen ab 13\.00 Uhr auf 079 484 46 84/,'Für heute online bis 12.00 Uhr reservieren. Danach bitte ab 13.00 Uhr anrufen: 079 484 46 84');}
 function close(){dialog.close();input.focus();}
 function render(){
  const y=Math.floor(month/12),m=month%12,grid=dialog.querySelector('#fh-calendar-grid');grid.replaceChildren();
  dialog.querySelector('#fh-month-title').textContent=new Intl.DateTimeFormat('de-CH',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m,1)));
  dialog.querySelector('#fh-prev').disabled=month<=minMonth;dialog.querySelector('#fh-next').disabled=month>=maxMonth;
  for(const s of ['Mo','Di','Mi','Do','Fr','Sa','So']){const h=document.createElement('span');h.className='fh-weekday';h.textContent=s;grid.appendChild(h);}
  for(let i=0;i<(new Date(Date.UTC(y,m,1)).getUTCDay()+6)%7;i++){const h=document.createElement('span');h.setAttribute('aria-hidden','true');grid.appendChild(h);}
  for(let d=1;d<=new Date(Date.UTC(y,m+1,0)).getUTCDate();d++){
   const iso=y+'-'+pad(m+1)+'-'+pad(d),a=availability[iso],b=document.createElement('button');
   b.type='button';b.className='fh-day'+(a?.is_open?' fh-'+a.status:'');b.textContent=d;b.dataset.date=iso;b.disabled=!!loading||!permitted(iso);
   const label=a?.is_open?({green:'verfügbar',orange:'gut belegt',red:'ausgebucht'}[a.status]):'geschlossen';
   b.setAttribute('aria-pressed',String(selected===iso));b.setAttribute('aria-label',new Intl.DateTimeFormat('de-CH',{dateStyle:'full',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'))+' – '+(loading?'wird geprüft':label)+(b.disabled?' – nicht online buchbar':''));
   b.onclick=async()=>{if(!await refresh()||!permitted(iso)){render();return;}selected=iso;const a=iso.split('-');input.value=a[2]+'.'+a[1]+'.'+a[0];input.setCustomValidity('');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));close();};grid.appendChild(b);
  }
  dialog.querySelector('#fh-calendar-status').textContent=loading?'Verfügbarkeit wird geladen …':error||'Mit dem Reservationsbuch verbunden.';
  dialog.querySelector('#fh-calendar-retry').hidden=!error;
 }
 function refresh(){
  if(loading)return loading;
  loading=(async()=>{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
   try{const res=await fetch(endpoint,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_from:'2026-11-11',p_to:'2027-02-06'}),cache:'no-store',signal:controller.signal});if(!res.ok)throw Error('Verbindung fehlgeschlagen');const data=await res.json();if(!Array.isArray(data)||!data.length)throw Error('Keine Verfügbarkeit');availability=Object.fromEntries(data.map(a=>[a.date,a]));error='';return true;}
   catch{availability={};error='Die Verfügbarkeit konnte nicht geladen werden. Bitte erneut versuchen oder anrufen: 079 484 46 84.';return false;}
   finally{clearTimeout(timeout);loading=null;if(dialog.open)render();}
  })();if(dialog.open)render();return loading;
 }
 function open(){if(dialog.open)return;const a=(selected||swissNow().date).split('-');month=Math.min(maxMonth,Math.max(minMonth,Number(a[0])*12+Number(a[1])-1));render();dialog.showModal();refresh();dialog.querySelector('.fh-close').focus();}
 trigger.onclick=open;input.onclick=open;input.onkeydown=ev=>{if(['Enter',' ','ArrowDown'].includes(ev.key)){ev.preventDefault();open();}};
 dialog.querySelector('#fh-prev').onclick=()=>{if(month>minMonth){month--;render();}};dialog.querySelector('#fh-next').onclick=()=>{if(month<maxMonth){month++;render();}};
 dialog.querySelector('.fh-close').onclick=close;dialog.querySelector('#fh-calendar-retry').onclick=refresh;
 dialog.addEventListener('cancel',()=>setTimeout(()=>input.focus(),0));
 dialog.addEventListener('click',ev=>{if(ev.target===dialog){const r=dialog.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)close();}});
 window.addEventListener('focus',()=>{if(dialog.open)refresh();});
 setInterval(()=>{if(dialog.open)refresh();},30000);
 const oldTime=document.getElementById('input-367563345927268218');let timeSelect,allowedTimes=[];
 if(oldTime){
  timeSelect=document.createElement('select');timeSelect.id=oldTime.id;timeSelect.name=oldTime.name;timeSelect.className=oldTime.className+' wsite-form-select';timeSelect.required=true;timeSelect.setAttribute('aria-required','true');timeSelect.dataset.fhTimeSelect='1';timeSelect.style.cssText='box-sizing:border-box;min-height:44px;max-width:100%;padding:8px 10px;background:#fffdf9;color:#30271f;font-size:16px;';
  const empty=document.createElement('option');empty.value='';empty.textContent='Uhrzeit wählen';empty.disabled=true;empty.selected=true;timeSelect.appendChild(empty);
  for(let n=17*60;n<=21*60+30;n+=15){const v=pad(Math.floor(n/60))+':'+pad(n%60),opt=document.createElement('option');opt.value=v;opt.textContent=v.replace(':','.')+' Uhr';allowedTimes.push(v);timeSelect.appendChild(opt);}
  const value=oldTime.value.trim().replace('.',':');if(allowedTimes.includes(value))timeSelect.value=value;oldTime.replaceWith(timeSelect);timeSelect.onchange=()=>timeSelect.setCustomValidity('');
 }
 function chosenDate(){const a=input.value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);return a?a[3]+'-'+a[2]+'-'+a[1]:'';}
 async function guard(ev){
  const submit=ev.type==='submit'?ev.submitter:ev.target.closest('.wsite-button,button[type=submit],input[type=submit]');if(ev.type!=='submit'&&!submit)return;
  if(Date.now()<approvedUntil&&permitted(chosenDate()))return;
  ev.preventDefault();ev.stopImmediatePropagation();
  if(timeSelect&&!allowedTimes.includes(timeSelect.value)){timeSelect.setCustomValidity('Bitte eine Uhrzeit zwischen 17.00 und 21.30 Uhr wählen.');timeSelect.focus();timeSelect.reportValidity();return;}
  if(!await refresh()||!permitted(chosenDate())){input.setCustomValidity('Bitte einen verfügbaren Tag wählen. Heute ist online bis 12.00 Uhr buchbar.');open();return;}
  input.setCustomValidity('');approvedUntil=Date.now()+1000;
  if(submit)submit.click();else form.requestSubmit();
 }
 form.addEventListener('click',guard,true);form.addEventListener('submit',guard,true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
