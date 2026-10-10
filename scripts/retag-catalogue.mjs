import {resolve,join} from 'node:path';
import {openCatalogue,recipeTags} from '../lib/catalogue.js';
import {applyManualClassification} from '../lib/manual-classification.js';
const directory=resolve(process.argv[2]??'data'),db=openCatalogue(directory);
try{
 const backup=join(directory,'catalogue-before-filters-'+Date.now()+'.db');db.prepare('VACUUM INTO ?').run(backup);
 const rows=db.prepare('SELECT id,data FROM catalogue').all();db.exec('BEGIN IMMEDIATE');try{const update=db.prepare('UPDATE catalogue SET data=? WHERE id=?');for(const row of rows){const r=JSON.parse(row.data);update.run(JSON.stringify({...r,...recipeTags(r)}),row.id);}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 // Retagging restores placeholders, so re-apply the reviewed classification straight away.
 const reclassified=applyManualClassification(db);
 console.log(JSON.stringify({updated:rows.length,reclassified,backup}));
}finally{db.close();}
