import {readFile,copyFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {openCatalogue,publishRecipe,normaliseRecipeText,recipeTags,localImageExists} from '../lib/catalogue.js';

const [inputArg,dataArg]=process.argv.slice(2);
if(!inputArg||!dataArg)throw Error('Usage: node scripts/merge-tasty.mjs STAGING DATA_DIR');
const input=resolve(inputArg),data=resolve(dataArg),db=openCatalogue(data);
try{
 const backup=join(data,'catalogue-before-tasty-'+Date.now()+'.db');
 db.prepare('VACUUM INTO ?').run(backup);
 const names=new Set(db.prepare('SELECT data FROM catalogue').all().map(x=>normaliseRecipeText(JSON.parse(x.data).name)));
 const sourceReport=JSON.parse(await readFile(join(input,'import-report.json'),'utf8'));
 const rows=(await readFile(join(input,'recipes.jsonl'),'utf8')).trim().split('\n').filter(Boolean);
 await mkdir(join(data,'catalogue-images'),{recursive:true});let added=0,duplicates=0;
 for(const line of rows){
   const recipe=JSON.parse(line),name=normaliseRecipeText(recipe.name);
   if(recipe.provider!=='Tasty'||!/^tasty-[a-f0-9]{24}$/.test(recipe.providerId)||!localImageExists(input,recipe.image))throw Error('Invalid staged Tasty recipe');
   if(names.has(name)){duplicates++;continue;}
   await copyFile(join(input,recipe.image.slice(1)),join(data,recipe.image.slice(1)));
   try{publishRecipe(db,{...recipe,...recipeTags(recipe)});added++;names.add(name);}catch(e){if(String(e.code).includes('CONSTRAINT')||/UNIQUE constraint failed/.test(e.message))duplicates++;else throw e;}
 }
 const report={...sourceReport,added,duplicates,backup};
 db.prepare('INSERT INTO catalogue_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('tasty-import-report',JSON.stringify(report));
 console.log(JSON.stringify({...report,total:db.prepare('SELECT count(*) n FROM catalogue').get().n}));
}finally{db.close();}
