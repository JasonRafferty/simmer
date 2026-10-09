import {mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {openCatalogue,publishRecipe,catalogueStatus,recipeTags,matchingTitle,usablePhotoURL} from '../lib/catalogue.js';
import {fetchRecipePage,extractRecipe} from '../lib/import.js';
import {fetchPhoto} from '../lib/photo.js';

const args=process.argv.slice(2),value=(flag,fallback)=>args.includes(flag)?args[args.indexOf(flag)+1]:fallback;
const directory=resolve(value('--data-dir',process.env.DATA_DIR||'data')),limit=Number(value('--limit','1000')),wait=Number(value('--delay-ms','1500'));
if(!Number.isInteger(limit)||limit<1||limit>10000||!Number.isFinite(wait)||wait<1000)throw Error('Use a limit of 1–10000 and delay of at least 1000ms.');
await mkdir(join(directory,'catalogue-images'),{recursive:true});const db=openCatalogue(directory);
// A second worker must not fetch the same queue concurrently. A stale lock expires after a crash.
db.exec('BEGIN IMMEDIATE');try{const lock=db.prepare("SELECT value FROM catalogue_meta WHERE key='worker-lock'").get();if(lock&&Number(lock.value)>Date.now()-60000)throw Error('A catalogue worker is already running.');db.prepare("INSERT OR REPLACE INTO catalogue_meta VALUES('worker-lock',?)").run(String(Date.now()));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');db.close();throw e;}
let stopping=false;for(const s of ['SIGTERM','SIGINT'])process.on(s,()=>{stopping=true;});
const heartbeat=setInterval(()=>db.prepare("UPDATE catalogue_meta SET value=? WHERE key='worker-lock'").run(String(Date.now())),10000);
let attempted=0,added=0;
try{
  // Only the explicitly selected source is enabled. Do not bypass publisher restrictions or blocks.
  while(attempted<limit){
    const candidate=db.prepare("SELECT * FROM candidates WHERE status='pending' ORDER BY priority DESC,rowid LIMIT 1").get();if(!candidate)break;
    if(stopping)break;
    try{
      const url=new URL(candidate.url);if(!['www.food.com','food.com'].includes(url.hostname)||!url.pathname.startsWith('/recipe/'))throw Error('Source is not enabled for batch import.');
      const recipe=extractRecipe(await fetchRecipePage(url),candidate.url);
      if(!matchingTitle(candidate.title,recipe.name))throw Error('Source recipe title no longer matches.');
      if(!usablePhotoURL(recipe.image)||recipe.ingredients.length<2||recipe.ingredients.length>100||recipe.instructions.trim().length<40||recipe.servings>100)throw Error('Missing genuine recipe photo, usable ingredients, portions or instructions.');
      const photo=await fetchPhoto(recipe.image),hash=createHash('sha256').update(photo.bytes).digest('hex'),filename=hash+'.'+photo.extension;
      const temporary=join(directory,'catalogue-images',filename+'.tmp');await writeFile(temporary,photo.bytes);await rename(temporary,join(directory,'catalogue-images',filename));
      publishRecipe(db,{...recipe,...recipeTags(recipe),providerId:candidate.id,provider:'RecipeNLG',providerURL:'https://recipenlg.cs.put.poznan.pl/',sourceImage:recipe.image,image:'/catalogue-images/'+filename,checkedAt:new Date().toISOString()});added++;
    }catch(e){db.prepare("UPDATE candidates SET status='skipped',reason=?,attempts=attempts+1 WHERE id=?").run(String(e.message).slice(0,300),candidate.id);}
    attempted++;
    if(attempted%10===0)console.log(JSON.stringify({attempted,added,...catalogueStatus(db)}));
    await delay(wait);
  }
}finally{clearInterval(heartbeat);db.prepare("DELETE FROM catalogue_meta WHERE key='worker-lock'").run();console.log(JSON.stringify({attempted,added,...catalogueStatus(db)}));db.close();}
