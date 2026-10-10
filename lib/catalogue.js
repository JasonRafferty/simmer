import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {createHash,randomInt} from 'node:crypto';
import {parse,combine,key} from './ingredients.js';
import {mainIngredients,adventureIdeas,effortMatches,filterValues,tagMatches} from './recipe-filters.js';

export function openCatalogue(directory){
  const db=new DatabaseSync(join(directory,'catalogue.db'));
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS catalogue(id TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE VIRTUAL TABLE IF NOT EXISTS catalogue_search USING fts5(id UNINDEXED,title,ingredients,tokenize='unicode61 remove_diacritics 2');
    CREATE TABLE IF NOT EXISTS catalogue_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS removed_recipes(id TEXT PRIMARY KEY,data TEXT NOT NULL);`);
  const published=db.prepare('PRAGMA table_info(catalogue)').all();for(const name of ['content_key','photo_key','copy_key'])if(!published.some(c=>c.name===name))db.exec(`ALTER TABLE catalogue ADD COLUMN ${name} TEXT`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS catalogue_content_key ON catalogue(content_key);CREATE UNIQUE INDEX IF NOT EXISTS catalogue_photo_key ON catalogue(photo_key);CREATE UNIQUE INDEX IF NOT EXISTS catalogue_copy_key ON catalogue(copy_key)');
  return db;
}
export function publishRecipe(db,recipe){
  if(db.prepare('SELECT 1 FROM removed_recipes WHERE id=?').get(recipe.providerId))return false;
  if(!/^(?:epic|nlg|tasty)-[a-f0-9]{24}$/.test(recipe.providerId??'')||!recipe.name||!recipe.ingredients?.length||!recipe.instructions?.trim()||!recipe.image?.startsWith('/catalogue-images/'))throw Error('Incomplete catalogue recipe.');
  db.exec('BEGIN IMMEDIATE');try{
    const existed=db.prepare('SELECT 1 FROM catalogue WHERE id=?').get(recipe.providerId);
    const copyKey=createHash('sha256').update(JSON.stringify([recipe.ingredients.map(normaliseRecipeText).sort(),normaliseRecipeText(recipe.instructions)])).digest('hex');
    db.prepare('INSERT INTO catalogue(id,data,content_key,photo_key,copy_key) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,content_key=excluded.content_key,photo_key=excluded.photo_key,copy_key=excluded.copy_key').run(recipe.providerId,JSON.stringify(recipe),recipeFingerprint(recipe),recipe.image,copyKey);
    if(existed)db.prepare('DELETE FROM catalogue_search WHERE id=?').run(recipe.providerId);
    db.prepare('INSERT INTO catalogue_search(id,title,ingredients) VALUES(?,?,?)').run(recipe.providerId,recipe.name,recipe.ingredients.join(' '));
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}
export function searchCatalogue(db,query,{category='',cuisine='',style='',effort=''}={}){
  const words=String(query??'').normalize('NFKD').match(/[\p{L}\p{N}]+/gu)?.slice(0,12)??[];
  const filterSQL=['categories','cuisines','styles'].map(field=>`(json_array_length(?)=0 OR EXISTS(SELECT 1 FROM json_each(c.data,'$.${field}') tag JOIN json_each(?) selected ON tag.value=selected.value))`).join(' AND ')+" AND (json_array_length(?)=0 OR EXISTS(SELECT 1 FROM json_each(?) e WHERE (e.value='5' AND json_extract(c.data,'$.ingredientCount')<=5) OR (e.value='6-10' AND json_extract(c.data,'$.ingredientCount') BETWEEN 6 AND 10) OR (e.value='11+' AND json_extract(c.data,'$.ingredientCount')>=11)))";
  const parameters=[category,cuisine,style,effort].flatMap(value=>{const json=JSON.stringify(filterValues(value));return [json,json];});
  const rows=words.length?db.prepare('SELECT c.data FROM catalogue_search s JOIN catalogue c ON c.id=s.id WHERE catalogue_search MATCH ? AND '+filterSQL+' ORDER BY bm25(catalogue_search,0,8,1) LIMIT 80').all(words.map(w=>'"'+w+'"*').join(' AND '),...parameters):db.prepare('SELECT c.data FROM catalogue c WHERE '+filterSQL+' ORDER BY substr(c.id,6,8) LIMIT 80').all(...parameters);
  return rows.map(r=>JSON.parse(r.data)).slice(0,80).map(r=>({providerId:r.providerId,provider:r.provider,name:r.name,image:r.image,category:r.categories?.join(' · ')??'',cuisine:r.cuisines?.join(' · ')??'',style:r.styles?.join(' · ')??''}));
}
export function catalogueFilters(db,filters={},query=''){
  const words=String(query).normalize('NFKD').match(/[\p{L}\p{N}]+/gu)?.slice(0,12)??[];
  const rows=words.length?db.prepare('SELECT c.data FROM catalogue_search s JOIN catalogue c ON c.id=s.id WHERE catalogue_search MATCH ?').all(words.map(w=>'"'+w+'"*').join(' AND ')):db.prepare('SELECT data FROM catalogue').all();
  const counts={categories:{},cuisines:{},styles:{}},efforts={'5':0,'6-10':0,'11+':0};
  for(const row of rows){const r=JSON.parse(row.data);for(const [field,param]of [['categories','category'],['cuisines','cuisine'],['styles','style']])if(effortMatches(r,filters.effort)&&[['categories','category'],['cuisines','cuisine'],['styles','style']].every(([f,p])=>p===param||tagMatches(r[f],filters[p])))for(const value of r[field]??[])counts[field][value]=(counts[field][value]??0)+1;
    if([['categories','category'],['cuisines','cuisine'],['styles','style']].every(([f,p])=>tagMatches(r[f],filters[p])))for(const range of Object.keys(efforts))if(effortMatches(r,range))efforts[range]++;
  }
  return {categories:Object.keys(counts.categories).sort(),cuisines:Object.keys(counts.cuisines).sort(),styles:Object.keys(counts.styles).sort(),counts,effortCount:efforts['5'],efforts};
}
export function catalogueIdeas(db){return adventureIdeas.filter(idea=>searchCatalogue(db,idea).length>0);}
export function surpriseRecipe(db,{category=[],cuisine=[],style=[]}={}){
 const matches=db.prepare('SELECT data FROM catalogue').all().map(row=>JSON.parse(row.data)).filter(r=>tagMatches(r.categories,category)&&tagMatches(r.cuisines,cuisine)&&tagMatches(r.styles,style));
 return matches.length?matches[randomInt(matches.length)]:null;
}
export function removedRecipeIds(db){return new Set(db.prepare('SELECT id FROM removed_recipes').all().map(r=>r.id));}
export function removeCatalogueRecipe(db,id){
 if(!/^(?:\d{1,12}|(?:epic|nlg|tasty)-[a-f0-9]{24})$/.test(id))throw Error('Invalid recipe.');
 db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT OR IGNORE INTO removed_recipes VALUES(?,?)').run(id,JSON.stringify({removedAt:Date.now()}));db.prepare('DELETE FROM catalogue_search WHERE id=?').run(id);db.prepare('DELETE FROM catalogue WHERE id=?').run(id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
export function catalogueStatus(db){const report=db.prepare("SELECT value FROM catalogue_meta WHERE key='import-report'").get();return {ready:db.prepare('SELECT count(*) AS n FROM catalogue').get().n,statuses:[],version:'epicurious-archive-v1',report:report?JSON.parse(report.value):null};}
export function getCatalogueRecipe(db,id){const row=db.prepare('SELECT data FROM catalogue WHERE id=?').get(id);if(!row)throw Error('This catalogue recipe is not available.');return JSON.parse(row.data);}
export function deduplicateTitles(db){const seen=new Set();let removed=0;db.exec('BEGIN IMMEDIATE');try{for(const row of db.prepare('SELECT id,data FROM catalogue ORDER BY rowid').all()){const name=normaliseRecipeText(JSON.parse(row.data).name);if(seen.has(name)){db.prepare('DELETE FROM catalogue_search WHERE id=?').run(row.id);db.prepare('DELETE FROM catalogue WHERE id=?').run(row.id);removed++;}else seen.add(name);}db.exec('COMMIT');return removed;}catch(e){db.exec('ROLLBACK');throw e;}}
export const normaliseRecipeText=s=>String(s??'').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function recipeFingerprint(recipe){const ingredients=combine(recipe.ingredients.map(parse)).map(i=>[key(i.name),i.amount===null?null:Math.round(i.amount*10000)/10000,i.unit,i.quantityText??'']).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return createHash('sha256').update(JSON.stringify([normaliseRecipeText(recipe.name),ingredients])).digest('hex');}
export function localImageExists(directory,url){return /^\/catalogue-images\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(url??'')&&existsSync(join(directory,url.slice(1)));}

export function recipeTags(recipe){
  const categories=new Set(mainIngredients(recipe));
  const known=['British','Italian','Indian','Chinese','Mexican','Thai','Japanese','Greek','French','Spanish','American','Korean','Vietnamese','Lebanese','Turkish','Moroccan','Ethiopian','Jamaican','Brazilian','Portuguese','Indonesian','Malaysian','Filipino','Pakistani','Persian','Egyptian','Polish','German','Irish','Cajun','Caribbean','African','Asian','Middle Eastern'];
  const raw=[].concat(recipe.recipeCuisine??[],recipe.keywords??[],recipe.recipeCategory??[]).join(' '),tagText=raw+' '+(recipe.tagsInferred?recipe.name:'');const cuisines=known.filter(x=>new RegExp('\\b'+x+'\\b','i').test(tagText));
  if(recipe.provider==='Tasty'&&Array.isArray(recipe.recipeCuisine))for(const cuisine of recipe.recipeCuisine)if(typeof cuisine==='string'&&/^[A-Za-z -]{2,50}$/.test(cuisine)&&!cuisines.includes(cuisine))cuisines.push(cuisine);
  if(recipe.tagsInferred){for(const [cuisine,pattern]of [['Italian',/\brisotto|gnocchi|lasagn[ae]|carbonara|minestrone|panzanella|cacio e pepe\b/i],['Japanese',/\bramen|soba|udon|teriyaki|yakitori|okonomiyaki|miso soup\b/i],['Korean',/\bkimchi|bulgogi|bibimbap|gochujang\b/i],['Chinese',/kung pao|mapo|sichuan|szechuan|chow mein|char siu/i],['Thai',/pad thai|tom yum|tom kha/i],['Mexican',/\btacos?|enchiladas?|pozole|chilaquiles|quesadillas?|tamales?\b/i],['Greek',/spanakopita|tzatziki|moussaka/i],['Middle Eastern',/falafel|shawarma|hummus|tabbouleh/i],['Vietnamese',/banh mi|\bpho\b|nuoc cham/i],['French',/ratatouille|bouillabaisse|coq au vin|bourguignon|cassoulet/i],['Spanish',/paella|gazpacho|patatas bravas/i],['Moroccan',/tagine/i],['South Asian',/biryani|tandoori|\bdal\b|palak|chana|korma|tikka/i],['Ethiopian',/injera|berbere|doro wat/i],['Persian',/tahdig|ghormeh|sabzi/i],['Turkish',/lahmacun|menemen/i]])if(pattern.test(recipe.name)&&!cuisines.includes(cuisine))cuisines.push(cuisine);}
  const styles=new Set(),styleText=[recipe.name,raw].join(' ');for(const [name,pattern] of [['Pasta dishes',/\b(pasta|spaghetti|penne|linguine|lasagn[ae]|fettuccine|macaroni|gnocchi|ravioli|carbonara)\b/i],['Desserts & baking',/\b(desserts?|cakes?|cookies?|brownies?|pudding|sorbet|ice cream|muffins?|pancakes?|waffles?)\b/i],['Curries',/\bcurry|curries|korma|vindaloo\b/i],['Stir-fries',/stir[- ]?fr/i],['Salads',/\bsalad\b/i],['Soups',/\bsoup|broth|chowder\b/i],['Stews',/\bstew|casserole|tagine\b/i],['Grilled & BBQ',/\bgrill|barbecue|bbq|kebab\b/i],['Noodles',/\bnoodles?|ramen|pho\b/i],['Rice dishes',/\brisotto|biryani|paella|rice\b/i],['Traybakes',/\btraybake|sheet pan\b/i],['Wraps & tacos',/\btacos?|wraps?|burritos?\b/i],['Pies & pastry',/\bpie|tart|pastry\b/i],['Pizza',/\bpizza\b/i],['Sandwiches & burgers',/\bsandwich|burger\b/i]])if(pattern.test(styleText))styles.add(name);
  return {categories:[...categories],cuisines:cuisines.length?cuisines:['Not specified'],styles:styles.size?[...styles]:['Other dishes'],ingredientCount:recipe.ingredients.length};
}
