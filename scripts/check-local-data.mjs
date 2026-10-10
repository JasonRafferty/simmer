import {DatabaseSync} from 'node:sqlite';
import {existsSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const directory=resolve(process.argv[2]||process.env.DATA_DIR||join(root,'data'));
const baseline=JSON.parse(readFileSync(join(root,'data-requirements.json'),'utf8'));
const database=join(directory,'catalogue.db'),issues=[],details={data:directory,expected:baseline.minimumSources};

if(!existsSync(database))issues.push('catalogue.db is missing. The recipe catalogue is not stored in Git.');
else{
 let db;
 try{
  db=new DatabaseSync(database,{readOnly:true});
  const source=id=>/^epic-/.test(id)?'epic':/^tasty-/.test(id)?'tasty':/^\d{1,12}$/.test(id)?'mealdb':null;
  const counts={epic:0,tasty:0,mealdb:0},removed={epic:0,tasty:0,mealdb:0};
  const rows=db.prepare('SELECT id,data FROM catalogue').all();
  for(const row of rows){const kind=source(row.id);if(kind)counts[kind]++;}
  try{for(const row of db.prepare('SELECT id FROM removed_recipes').all()){const kind=source(row.id);if(kind)removed[kind]++;}}catch{issues.push('removed_recipes table is missing.');}
  details.catalogueRows=rows.length;details.sources=counts;details.removed=removed;
  for(const [kind,minimum] of Object.entries(baseline.minimumSources))if(counts[kind]+removed[kind]<minimum)issues.push(`${kind}: ${counts[kind]} recipes plus ${removed[kind]} removed, below the Mac baseline of ${minimum}.`);
  let missingPhotos=0;const examples=[];
  for(const row of rows){
   let image;try{image=JSON.parse(row.data).image;}catch{issues.push(`Recipe ${row.id} has invalid JSON.`);continue;}
   if(!/^\/catalogue-images\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(image??'')||!existsSync(join(directory,image.slice(1)))){missingPhotos++;if(examples.length<5)examples.push(row.id);}
  }
  details.missingPhotos=missingPhotos;
  if(missingPhotos)issues.push(`${missingPhotos} catalogue photos are missing or invalid (examples: ${examples.join(', ')}). Copy data/catalogue-images/ with the database.`);
  if(!db.prepare("SELECT 1 FROM catalogue_meta WHERE key='mealdb-import-report'").get())issues.push('The MealDB import record is missing.');
 }catch(error){issues.push(`Cannot read catalogue.db: ${error.message}`);}
 finally{db?.close();}
}
if(!existsSync(join(directory,'simmer.db')))issues.push('simmer.db is missing; saved recipes and meal plans from the other computer are not here.');
details.ok=issues.length===0;details.issues=issues;
console.log(JSON.stringify(details,null,2));
if(issues.length)process.exitCode=1;
