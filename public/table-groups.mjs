export const TABLE_GROUPS=[5,6,7,8].map(n=>[String(n),String(n).repeat(2),String(n).repeat(3)]);
export const LARGE_TABLE_GROUPS=[['20','120','220','131'],['21','121','221','131'],['22','122','222','132'],['23','123','223','133']];
const rules=[...TABLE_GROUPS.map(tables=>({tables,limits:[2,4,6]})),...LARGE_TABLE_GROUPS.map(tables=>({tables,limits:[4,6,8,11]}))];
export function tableGroupAssignment(value,people){
 const raw=String(value||'').trim(),count=Number(people);if(!Number.isInteger(count)||count<1||!raw)return raw;
 const text=raw.toUpperCase().replace(/^TISCHE?\s*/,'').replace(/\s+UND\s+/g,',');if(!/^[\d\s,;/+&]+$/.test(text))return raw;
 const selected=[...new Set(text.split(/[\s,;/+&]+/).filter(Boolean))];
 const rule=rules.find(g=>selected.includes(g.tables[0])&&selected.every(n=>g.tables.includes(n)));if(!rule)return raw;
 if(count>rule.limits.at(-1))throw Error(`Tischgruppe ${rule.tables.join(' / ')}: maximal ${rule.limits.at(-1)} Personen. Bitte weitere Tische zuweisen.`);
 return rule.tables.slice(0,rule.limits.findIndex(limit=>count<=limit)+1).join(', ');
}
export function tableGroupHint(value,people){
 try{const assigned=tableGroupAssignment(value,people);return assigned!==String(value||'').trim()?`Zuordnung nach Personenzahl: ${assigned}.` :'';}catch(err){return err.message;}
}
