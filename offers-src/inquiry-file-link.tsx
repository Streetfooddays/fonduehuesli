'use client';
import {useState} from 'react';
import {apiFetch} from './offer-api';
import type {InquiryAttachment} from './model';
export default function InquiryFileLink({file}:{file:InquiryAttachment}){const [error,setError]=useState('');return <><button className="text-button" onClick={async()=>{setError('');try{const r=await apiFetch('/api/inquiry-files?id='+encodeURIComponent(file.id));if(!r.ok)throw Error('Datei konnte nicht geladen werden.');const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){setError(e instanceof Error?e.message:'Datei nicht verfügbar.');}}}>{file.name}</button>{error&&<span role="alert">{error}</span>}</>;}
