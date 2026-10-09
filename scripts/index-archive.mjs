import {createReadStream} from 'node:fs';
import {readFile,writeFile,unlink,readdir} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {resolve,join} from 'node:path';
import {openCatalogue,publishRecipe,recipeTags,catalogueStatus,localImageExists,deduplicateTitles} from '../lib/catalogue.js';

const directory=resolve(process.argv[2]||'');if(!process.argv[2])throw Error('Pass the staging directory from import-archive.py.');
const db=openCatalogue(directory);let imported=0,duplicates=0;const imageFiles=new Set();
try{
  if(!process.argv.includes('--finalize-only'))for await(const line of createInterface({input:createReadStream(join(directory,'recipes.jsonl')),crlfDelay:Infinity})){
    if(!line.trim())continue;const recipe=JSON.parse(line);
    if(db.prepare('SELECT 1 FROM catalogue WHERE id=?').get(recipe.providerId))continue;
    if(!localImageExists(directory,recipe.image))throw Error('Missing staged photo: '+recipe.name);
    try{publishRecipe(db,{...recipe,...recipeTags(recipe)});imageFiles.add(recipe.image.split('/').pop());imported++;}
    catch(e){if(e.message.includes('UNIQUE constraint failed'))duplicates++;else throw e;}
    if(imported&&imported%1000===0)console.log(JSON.stringify({imported,duplicates}));
  }
  const titleDuplicates=deduplicateTitles(db);imageFiles.clear();for(const row of db.prepare('SELECT data FROM catalogue').all())imageFiles.add(JSON.parse(row.data).image.split('/').pop());
  for(const file of await readdir(join(directory,'catalogue-images')))if(!imageFiles.has(file))await unlink(join(directory,'catalogue-images',file));
  const previous=JSON.parse(await readFile(join(directory,'import-report.json'),'utf8'));
  const report={...previous,imported:catalogueStatus(db).ready,duplicates:(previous.duplicates??0)+duplicates+titleDuplicates};
  db.prepare("INSERT OR REPLACE INTO catalogue_meta VALUES('import-report',?)").run(JSON.stringify(report));
  await writeFile(join(directory,'import-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,status:catalogueStatus(db)}));
}finally{db.close();}
