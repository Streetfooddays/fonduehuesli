export function renderOffersWorkspace(container,{request,notice}){
 const iframe=document.createElement('iframe');iframe.src='/offerten/index.html';iframe.title='Offerten · Fonduehüsli und SOO! Event & Catering';iframe.className='offers-workspace-frame';container.append(iframe);let dirty=false;
 const handler=async e=>{if(e.origin!==location.origin||e.source!==iframe.contentWindow)return;const d=e.data;if(d?.type==='fh-offers-dirty'){dirty=!!d.dirty;return;}if(d?.type!=='fh-offer-request'||typeof d.id!=='string')return;
 if(!/^\/api\/(data|transport|inquiry-files)(\?.*)?$/.test(d.url||'')){iframe.contentWindow.postMessage({type:'fh-offer-response',id:d.id,error:'Aktion nicht verfügbar.'},location.origin);return;}
 try{const value=await request('/functions/v1/catering-api',{method:'POST',body:{url:d.url,method:d.method,body:d.body,file:d.file},timeoutMs:60000});iframe.contentWindow?.postMessage({type:'fh-offer-response',id:d.id,value},location.origin);}catch(err){iframe.contentWindow?.postMessage({type:'fh-offer-response',id:d.id,error:err.message},location.origin);}
 };window.addEventListener('message',handler);
 return {canLeave:()=>!dirty||window.confirm('Ungespeicherte Änderungen an der Offerte verwerfen?'),dispose(){window.removeEventListener('message',handler);iframe.remove();}};
}
