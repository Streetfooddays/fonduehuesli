'use client';
import type {Config,IssuerProfile} from './model';
export default function IssuerSettings({config,change}:{config:Config;change:(c:Config)=>void}){
 if(!config.issuerProfiles?.length)return null;
 const update=(id:string,k:keyof IssuerProfile,value:string)=>change({...config,issuerProfiles:config.issuerProfiles!.map(p=>p.id===id?{...p,[k]:value}:p)});
 return <section className="panel"><h2>Absender für Offerten</h2>{config.issuerProfiles.map(p=><div key={p.id}><h3>{p.label}</h3><div className="fields">{(['sender','email','phone','website'] as const).map(k=><label className="field" key={k}><span>{({sender:'Firmenname',email:'E-Mail',phone:'Telefon',website:'Website'})[k]}</span><input value={p[k]||''} onChange={e=>update(p.id,k,e.target.value)}/></label>)}<label className="field wide"><span>Absenderadresse</span><textarea value={p.address} rows={2} onChange={e=>update(p.id,'address',e.target.value)}/></label></div></div>)}</section>;
}
