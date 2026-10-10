import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mealRecipe} from '../lib/discovery.js';
import {openCatalogue,publishRecipe,normaliseRecipeText,recipeTags} from '../lib/catalogue.js';

const letters='abcdefghijklmnopqrstuvwxyz0123456789';
const pause=ms=>new Promise(done=>setTimeout(done,ms));

async function get(url,fetchImpl){
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetchImpl(url,{signal:AbortSignal.timeout(20000)});
   if(response.ok)return response;
   if(response.status!==429&&response.status<500)throw Error(`MealDB returned ${response.status}`);
  }catch(error){if(attempt===2)throw error;}
  await pause(500*(attempt+1));
 }
 throw Error('MealDB request failed');
}

export async function listMealDb({fetchImpl=fetch,key=process.env.MEALDB_API_KEY||'1',initials=letters}={}){
 const meals=new Map();
 for(const letter of initials){
  if(!/^[a-z0-9]$/.test(letter))throw Error('Invalid initial');
  const url=`https://www.themealdb.com/api/json/v1/${encodeURIComponent(key)}/search.php?f=${letter}`;
  const data=await (await get(url,fetchImpl)).json();
  if(data.meals!==null&&!Array.isArray(data.meals))throw Error(`Invalid MealDB response for ${letter}`);
  for(const meal of data.meals??[])if(/^\d{1,12}$/.test(String(meal.idMeal??'')))meals.set(String(meal.idMeal),meal);
 }
 return [...meals.values()];
}

export function localMeal(meal,image){
 const recipe=mealRecipe(meal),area=String(meal.strArea||meal.strCountry||'').trim(),tags=recipeTags({...recipe,recipeCuisine:area?[area]:[],recipeCategory:meal.strCategory||''});
 const styles=new Set(tags.styles),title=recipe.name;
 if(/\b(sauce|dip|dressing|salsa|chutney|pesto|marinade|relish)\b/i.test(title))styles.add('Sauces & dips');
 if(/^dessert$/i.test(String(meal.strCategory||'')))styles.add('Desserts & baking');
 return {...recipe,image,recipeCuisine:area?[area]:[],categories:tags.categories,cuisines:area?[area]:tags.cuisines,styles:[...styles],ingredientCount:recipe.ingredients.length};
}

async function savePhoto(meal,directory,fetchImpl){
 const url=new URL(String(meal.strMealThumb||''));
 if(url.protocol!=='https:'||!['www.themealdb.com','themealdb.com'].includes(url.hostname)||!url.pathname.startsWith('/images/media/meals/'))throw Error('Invalid MealDB photo URL');
 const response=await get(url,fetchImpl),length=Number(response.headers.get('content-length')||0);
 if(length>8000000)throw Error('MealDB photo is too large');
 const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>8000000)throw Error('MealDB photo is too large');
 const extension=bytes[0]===0xff&&bytes[1]===0xd8?'jpg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'webp':null;
 if(!extension)throw Error('MealDB photo is not a supported image');
 const name=createHash('sha256').update(bytes).digest('hex')+'.'+extension;
 try{await writeFile(join(directory,'catalogue-images',name),bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
 return '/catalogue-images/'+name;
}

export async function importMealDb(directory,{fetchImpl=fetch,key=process.env.MEALDB_API_KEY||'1',initials=letters}={}){
 const data=resolve(directory);await mkdir(join(data,'catalogue-images'),{recursive:true});
 const meals=await listMealDb({fetchImpl,key,initials});
 const db=openCatalogue(data);
 try{
  const names=new Set(db.prepare('SELECT data FROM catalogue').all().map(row=>normaliseRecipeText(JSON.parse(row.data).name)));
  const existing=new Set(db.prepare('SELECT id FROM catalogue').all().map(row=>row.id));
  const removed=new Set(db.prepare('SELECT id FROM removed_recipes').all().map(row=>row.id));
  const pending=[],report={source:'TheMealDB',listed:meals.length,added:0,duplicates:0,removed:0,invalid:0,photosFailed:0,importedAt:new Date().toISOString()};
  for(const meal of meals){
   const id=String(meal.idMeal),name=normaliseRecipeText(meal.strMeal);
   if(removed.has(id)){report.removed++;continue;}
   if(existing.has(id)||names.has(name)){report.duplicates++;continue;}
   if(!name||!meal.strMealThumb||!meal.strInstructions?.trim()||!mealRecipe(meal).ingredients.length){report.invalid++;continue;}
   pending.push(meal);names.add(name);
  }
  if(pending.length){
   const backup=join(data,'catalogue-before-mealdb-'+Date.now()+'.db');db.prepare('VACUUM INTO ?').run(backup);report.backup=backup;
   for(const [index,meal] of pending.entries()){
    let image;try{image=await savePhoto(meal,data,fetchImpl);}catch{report.photosFailed++;continue;}
    try{if(publishRecipe(db,localMeal(meal,image))===false)report.removed++;else report.added++;}
    catch(error){if(error.code?.startsWith('SQLITE_CONSTRAINT')||/UNIQUE constraint failed/.test(error.message))report.duplicates++;else throw error;}
    if((index+1)%100===0)console.log(JSON.stringify({processed:index+1,of:pending.length,added:report.added,photosFailed:report.photosFailed}));
   }
  }
  db.prepare('INSERT INTO catalogue_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('mealdb-import-report',JSON.stringify(report));
  return {...report,total:db.prepare('SELECT count(*) n FROM catalogue').get().n};
 }finally{db.close();}
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const directory=process.argv[2];if(!directory)throw Error('Usage: node scripts/import-mealdb.mjs DATA_DIR');
 console.log(JSON.stringify(await importMealDb(directory)));
}
