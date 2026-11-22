import {apiFetch} from './offer-api';
import type {InquiryAttachment} from './model';
let workerPromise:Promise<any>|null=null;
let progressSink:(text:string)=>void=()=>{};
async function ocr(image:HTMLCanvasElement|File,onProgress:(text:string)=>void){
 progressSink=onProgress;
 if(!workerPromise)workerPromise=import('tesseract.js').then(t=>t.createWorker('deu',1,{workerPath:'/ocr/worker.min.js',corePath:'/ocr/core',langPath:'/ocr/lang',workerBlobURL:false,logger:(m:any)=>{if(m.status==='recognizing text')progressSink('Text wird erkannt: '+Math.round(m.progress*100)+' %');}})).catch(e=>{workerPromise=null;throw e;});
 const worker=await workerPromise;await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});return (await worker.recognize(image)).data.text as string;
}
export async function readInquiryFile(file:File,progress:(text:string)=>void):Promise<string>{
 if(!file.size||file.size>12*1024*1024)throw Error('Bitte eine Datei mit höchstens 12 MB wählen.');
 if(/\.txt$/i.test(file.name))return file.text();
 if(/\.pdf$/i.test(file.name)){
  const pdf=await import('pdfjs-dist'),worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');pdf.GlobalWorkerOptions.workerSrc=worker.default;
  const task=pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true});try{const doc=await task.promise;if(doc.numPages>10)throw Error('Bitte PDFs mit höchstens 10 Seiten verwenden.');const pages=[];for(let i=1;i<=doc.numPages;i++){progress(`Seite ${i} von ${doc.numPages} wird gelesen …`);const page=await doc.getPage(i),content=await page.getTextContent();let lastY:number|undefined,text='';for(const item of content.items){if(!('str' in item))continue;const y=item.transform[5];if(lastY!==undefined&&Math.abs(y-lastY)>3)text+='\n';text+=item.str+' ';lastY=y;}if(text.replace(/\s/g,'').length<40){const viewport=page.getViewport({scale:1.7}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvas,canvasContext:canvas.getContext('2d')!,viewport}).promise;text=await ocr(canvas,progress);canvas.width=canvas.height=0;}pages.push(text);page.cleanup();}return pages.join('\n\n');}finally{await task.destroy();}
 }
 if(!/\.(png|jpe?g|webp)$/i.test(file.name))throw Error('Bitte PDF, PNG, JPG, WebP oder TXT wählen.');
 progress('Texterkennung wird vorbereitet …');const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas'),scale=Math.min(2,2800/bitmap.width,4000/bitmap.height);canvas.width=bitmap.width*scale;canvas.height=bitmap.height*scale;canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();try{return await ocr(canvas,progress);}finally{canvas.width=canvas.height=0;}
}
export async function uploadInquiryOriginal(file:File):Promise<InquiryAttachment>{const f=new FormData();f.set('file',file);const r=await apiFetch('/api/inquiry-files',{method:'POST',body:f}),b:any=await r.json();if(!r.ok)throw Error(b.error||'Upload fehlgeschlagen.');return b;}
