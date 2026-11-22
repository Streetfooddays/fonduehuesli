import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './workspace';
import {configureOfferApi} from './offer-api';
let sequence=0;const pending=new Map<string,{resolve:(r:Response)=>void;reject:(e:Error)=>void;timer:any}>();
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='fh-offer-response')return;const p=pending.get(e.data.id);if(!p)return;clearTimeout(p.timer);pending.delete(e.data.id);if(e.data.error){p.resolve(Response.json({error:e.data.error},{status:400}));return;}const b=e.data.value;if(b?.binary){const bytes=Uint8Array.from(atob(b.binary),c=>c.charCodeAt(0));p.resolve(new Response(bytes,{headers:{'Content-Type':b.type}}));}else p.resolve(Response.json(b));});
configureOfferApi(async(url,options={})=>{
 if(parent===window)return Response.json({error:'Bitte Offerten über das Reservationsbuch öffnen.'},{status:401});
 let body=options.body,file;
 if(body instanceof FormData){const f=body.get('file') as File;if(!f||f.size>12582912)return Response.json({error:'Maximal 12 MB pro Datei.'},{status:400});const bytes=new Uint8Array(await f.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));file={name:f.name,type:f.type,base64:btoa(binary)};body=undefined;}
 const id=String(++sequence);return new Promise<Response>((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Zeitüberschreitung. Bitte neu laden.'));},70000);pending.set(id,{resolve,reject,timer});parent.postMessage({type:'fh-offer-request',id,url,method:options.method||'GET',body:typeof body==='string'?body:undefined,file},location.origin);});
});
createRoot(document.getElementById('offers-root')!).render(<App embedded/>);
