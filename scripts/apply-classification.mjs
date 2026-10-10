import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openCatalogue} from '../lib/catalogue.js';
import {manualClassification,classificationChanges,applyClassificationChanges} from '../lib/manual-classification.js';

// Applies the reviewed mapping (lib/manual-classification.json by default). Only placeholder tags are replaced.
const [directoryArg,mappingArg]=process.argv.slice(2).filter(x=>!x.startsWith('--')),apply=process.argv.includes('--apply');
const directory=resolve(directoryArg??'data'),manual=mappingArg?manualClassification(pathToFileURL(resolve(mappingArg))):manualClassification(),db=openCatalogue(directory);
try{
 const changes=classificationChanges(db,manual),assigned={cuisines:{},styles:{}};
 for(const {before,after}of changes)for(const field of ['cuisines','styles'])if(JSON.stringify(before[field])!==JSON.stringify(after[field]))for(const tag of after[field])assigned[field][tag]=(assigned[field][tag]??0)+1;
 let backup;
 if(apply&&changes.length){backup=join(directory,'catalogue-before-manual-classification-'+Date.now()+'.db');db.prepare('VACUUM INTO ?').run(backup);applyClassificationChanges(db,changes);}
 const sort=counts=>Object.fromEntries(Object.entries(counts).sort((a,b)=>b[1]-a[1]));
 console.log(JSON.stringify({applied:apply,recipes:changes.length,cuisines:sort(assigned.cuisines),styles:sort(assigned.styles),backup},null,1));
}finally{db.close();}
