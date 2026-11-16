export const TABLE_GROUPS=[5,6,7,8].map(n=>[String(n),String(n).repeat(2),String(n).repeat(3)]);
export const LARGE_TABLE_GROUPS=[['20','120','220'],['21','121','221','130'],['22','122','222','131'],['23','123','223','132']];
export const TABLE_CAPACITY_OVERRIDES=Object.freeze({'20':4});
const rules=[...TABLE_GROUPS.map(tables=>({tables,limits:[2,4,6]})),...LARGE_TABLE_GROUPS.map((tables,i)=>({tables,limits:i===0?[4,8,11]:[4,6,8,11]}))];
function matchingRule(value){
 const text=String(value||'').trim().toUpperCase().replace(/^TISCHE?\s*/,'').replace(/\s+UND\s+/g,',');if(!/^[\d\s,;/+&]+$/.test(text))return null;
 const selected=[...new Set(text.split(/[\s,;/+&]+/).filter(Boolean))];return rules.find(g=>selected.includes(g.tables[0])&&selected.every(n=>g.tables.includes(n)))||(selected.length===1&&TABLE_CAPACITY_OVERRIDES[selected[0]]?{tables:selected,limits:[TABLE_CAPACITY_OVERRIDES[selected[0]]]}:null);
}
export function tableGroupAssignment(value,people){
 const raw=String(value||'').trim(),count=Number(people);if(!Number.isInteger(count)||count<1||!raw)return raw;
 const rule=matchingRule(raw);if(!rule)return raw;
 const size=rule.limits.findIndex(limit=>count<=limit);
 return rule.tables.slice(0,size<0?rule.tables.length:size+1).join(', ');
}
export function tableGroupWarning(value,people){const rule=matchingRule(value),count=Number(people);return rule&&Number.isInteger(count)&&count>rule.limits.at(-1)?`${count} Personen bei ${rule.limits.at(-1)} vorgesehenen Plätzen – manuelle Zuteilung möglich.`:'';}
export function tableGroupHint(value,people){
 const assigned=tableGroupAssignment(value,people),warning=tableGroupWarning(value,people),expanded=assigned!==String(value||'').trim()?`Zuordnung nach Personenzahl: ${assigned}.`:'';
 return [warning,expanded].filter(Boolean).join(' ');
}
