import {resolve,join} from 'node:path';
import {readFileSync} from 'node:fs';
import {openCatalogue} from '../lib/catalogue.js';

// Applies a reviewed {id: {cuisine?, style?}} mapping. Only the placeholder tags are replaced; existing classifications are kept.
const [directoryArg,mappingArg]=process.argv.slice(2).filter(x=>!x.startsWith('--')),apply=process.argv.includes('--apply');
const directory=resolve(directoryArg??'data'),mapping=JSON.parse(readFileSync(resolve(mappingArg??join(directory,'manual-classification.json')),'utf8')),db=openCatalogue(directory);
const replace=(tags,placeholder,value)=>value&&tags?.includes(placeholder)?[...new Set(tags.map(x=>x===placeholder?value:x))]:tags;
try{
 const changes=[],assigned={cuisines:{},styles:{}};
 for(const row of db.prepare('SELECT id,data FROM catalogue').all()){
  const target=mapping[row.id];if(!target)continue;
  const before=JSON.parse(row.data),after={...before,cuisines:replace(before.cuisines,'Everyday / international',target.cuisine),styles:replace(before.styles,'Other dishes',target.style)};
  if(JSON.stringify(before)===JSON.stringify(after))continue;
  for(const field of ['cuisines','styles'])if(JSON.stringify(before[field])!==JSON.stringify(after[field]))for(const tag of after[field])assigned[field][tag]=(assigned[field][tag]??0)+1;
  changes.push({id:row.id,before,after});
 }
 let backup;
 if(apply&&changes.length){
  backup=join(directory,'catalogue-before-manual-classification-'+Date.now()+'.db');db.prepare('VACUUM INTO ?').run(backup);
  db.exec('BEGIN IMMEDIATE');try{const update=db.prepare('UPDATE catalogue SET data=? WHERE id=? AND data=?');for(const row of changes){if(update.run(JSON.stringify(row.after),row.id,JSON.stringify(row.before)).changes!==1)throw Error('Catalogue changed during classification; retry.');}db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
 }
 const sort=counts=>Object.fromEntries(Object.entries(counts).sort((a,b)=>b[1]-a[1]));
 console.log(JSON.stringify({applied:apply,recipes:changes.length,cuisines:sort(assigned.cuisines),styles:sort(assigned.styles),backup},null,1));
}finally{db.close();}
