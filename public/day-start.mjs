export function todayInZurich(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
