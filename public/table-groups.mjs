export const TABLE_GROUPS=[5,6,7,8].map(n=>[String(n),String(n).repeat(2),String(n).repeat(3)]);
export function tableGroupAssignment(value,people){
 const raw=String(value||'').trim(),count=Number(people);if(!Number.isInteger(count)||count<1||!raw)return raw;
 const text=raw.toUpperCase().replace(/^TISCHE?\s*/,'').replace(/\s+UND\s+/g,',');if(!/^[\d\s,;/+&]+$/.test(text))return raw;
 const selected=[...new Set(text.split(/[\s,;/+&]+/).filter(Boolean))];
 const group=TABLE_GROUPS.find(g=>selected.includes(g[0])&&selected.every(n=>g.includes(n)));if(!group)return raw;
 if(count>6)throw Error(`Tischgruppe ${group.join(' / ')}: maximal 6 Personen. Bitte weitere Tische zuweisen.`);
 return group.slice(0,Math.ceil(count/2)).join(', ');
}
export function tableGroupHint(value,people){
 try{const assigned=tableGroupAssignment(value,people);return assigned!==String(value||'').trim()?`Zuordnung nach Personenzahl: ${assigned}.` :'';}catch(err){return err.message;}
}
