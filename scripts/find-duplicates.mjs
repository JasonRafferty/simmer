import {resolve} from 'node:path';
import {openCatalogue} from '../lib/catalogue.js';
import {duplicateGroups} from '../lib/duplicates.js';

// Report only: lists catalogue recipes that look like duplicates so you can remove them in the app.
// Usage: node scripts/find-duplicates.mjs data [--all] [--json]
const args=process.argv.slice(2),directory=resolve(args.find(a=>!a.startsWith('--'))??'data'),db=openCatalogue(directory);
try{
 const groups=duplicateGroups(db.prepare('SELECT id,data FROM catalogue').all().map(r=>({...JSON.parse(r.data),providerId:r.id}))).filter(g=>args.includes('--all')||g.likely);
 if(args.includes('--json'))console.log(JSON.stringify(groups,null,1));
 else{
  for(const g of groups){console.log(`${g.likely?'LIKELY DUPLICATE':'same name, different recipe'} · ingredients ${Math.round(g.similarity*100)}% alike`);for(const r of g.recipes)console.log(`  ${r.providerId}  ${r.provider??''}  ${r.name}`);console.log('');}
  console.log(`${groups.length} group(s), ${groups.reduce((s,g)=>s+g.recipes.length-1,0)} possible extra copies.${args.includes('--all')?'':' Add --all to include same-name recipes with different ingredients.'}`);
 }
}finally{db.close();}
