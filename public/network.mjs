export async function fetchJSON(url,options={},timeoutMs=20000,fetcher=fetch){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetcher(url,{...options,signal:controller.signal});
  const text=await response.text();let data;
  try{data=text?JSON.parse(text):{};}catch{throw Error('Der Server hat keine lesbare Antwort geliefert. Bitte die Liste aktualisieren und den Eintrag prüfen.');}
  if(!response.ok){const error=Error(data.error_description||data.msg||data.message||data.error||`Verbindung fehlgeschlagen (${response.status}).`);error.status=response.status;throw error;}
  return data;
 }catch(err){if(controller.signal.aborted)throw Error('Die Verbindung hat zu lange gedauert. Bitte aktualisieren und prüfen, ob die Änderung gespeichert wurde, bevor du erneut speicherst.');throw err;}
 finally{clearTimeout(timer);}
}
