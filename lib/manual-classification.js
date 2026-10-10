import {readFileSync} from 'node:fs';

// Reviewed tags for recipes the automatic inference left as placeholders, plus non-food entries to hide.
export const manualClassification=(file=new URL('./manual-classification.json',import.meta.url))=>JSON.parse(readFileSync(file,'utf8'));
const replace=(tags,placeholder,value)=>value&&tags?.includes(placeholder)?[...new Set(tags.map(x=>x===placeholder?value:x))]:tags;

// Only placeholder tags are replaced, so this is safe to re-run after any retag or import.
export function classificationChanges(db,manual=manualClassification()){
 const changes=[];
 for(const row of db.prepare('SELECT id,data FROM catalogue').all()){
  const target=manual.classification?.[row.id];if(!target)continue;
  const before=JSON.parse(row.data),after={...before,cuisines:replace(before.cuisines,'Everyday / international',target.cuisine),styles:replace(before.styles,'Other dishes',target.style)};
  if(JSON.stringify(before)!==JSON.stringify(after))changes.push({id:row.id,before,after});
 }
 return changes;
}
export function applyClassificationChanges(db,changes){
 if(!changes.length)return 0;
 db.exec('BEGIN IMMEDIATE');try{const update=db.prepare('UPDATE catalogue SET data=? WHERE id=? AND data=?');for(const row of changes){if(update.run(JSON.stringify(row.after),row.id,JSON.stringify(row.before)).changes!==1)throw Error('Catalogue changed during classification; retry.');}db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
 return changes.length;
}
export const applyManualClassification=(db,manual)=>applyClassificationChanges(db,classificationChanges(db,manual));
