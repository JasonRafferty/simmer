import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parse,combine,key} from './ingredients.js';

export function openCatalogue(directory){
  const db=new DatabaseSync(join(directory,'catalogue.db'));
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY,url TEXT UNIQUE NOT NULL,title TEXT NOT NULL,data TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',reason TEXT NOT NULL DEFAULT '',attempts INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS catalogue(id TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE VIRTUAL TABLE IF NOT EXISTS catalogue_search USING fts5(id UNINDEXED,title,ingredients,tokenize='unicode61 remove_diacritics 2');
    CREATE TABLE IF NOT EXISTS catalogue_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE VIRTUAL TABLE IF NOT EXISTS candidate_search USING fts5(id UNINDEXED,title,ingredients,tokenize='unicode61 remove_diacritics 2');`);
  const columns=db.prepare('PRAGMA table_info(candidates)').all();if(!columns.some(c=>c.name==='priority'))db.exec('ALTER TABLE candidates ADD COLUMN priority INTEGER NOT NULL DEFAULT 0');
  const published=db.prepare('PRAGMA table_info(catalogue)').all();for(const name of ['content_key','photo_key','copy_key'])if(!published.some(c=>c.name===name))db.exec(`ALTER TABLE catalogue ADD COLUMN ${name} TEXT`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS catalogue_content_key ON catalogue(content_key);CREATE UNIQUE INDEX IF NOT EXISTS catalogue_photo_key ON catalogue(photo_key);CREATE UNIQUE INDEX IF NOT EXISTS catalogue_copy_key ON catalogue(copy_key);CREATE INDEX IF NOT EXISTS candidates_queue ON candidates(status,priority DESC)');
  return db;
}
export function publishRecipe(db,recipe){
  if(!recipe.providerId?.startsWith('nlg-')||!recipe.name||!recipe.ingredients?.length||!recipe.instructions?.trim()||!recipe.image?.startsWith('/catalogue-images/'))throw Error('Incomplete catalogue recipe.');
  db.exec('BEGIN IMMEDIATE');try{
    const copyKey=createHash('sha256').update(JSON.stringify([recipe.ingredients.map(normaliseRecipeText).sort(),normaliseRecipeText(recipe.instructions)])).digest('hex');
    db.prepare('INSERT INTO catalogue(id,data,content_key,photo_key,copy_key) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,content_key=excluded.content_key,photo_key=excluded.photo_key,copy_key=excluded.copy_key').run(recipe.providerId,JSON.stringify(recipe),recipeFingerprint(recipe),recipe.image,copyKey);
    db.prepare('DELETE FROM catalogue_search WHERE id=?').run(recipe.providerId);
    db.prepare('INSERT INTO catalogue_search(id,title,ingredients) VALUES(?,?,?)').run(recipe.providerId,recipe.name,recipe.ingredients.join(' '));
    db.prepare("UPDATE candidates SET status='ready',reason='' WHERE id=?").run(recipe.providerId);
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}
export function searchCatalogue(db,query,{category='',cuisine='',style=''}={}){
  const words=String(query??'').normalize('NFKD').match(/[\p{L}\p{N}]+/gu)?.slice(0,12)??[];
  const filterSQL="(?='' OR EXISTS(SELECT 1 FROM json_each(c.data,'$.categories') WHERE value=?)) AND (?='' OR EXISTS(SELECT 1 FROM json_each(c.data,'$.cuisines') WHERE value=?)) AND (?='' OR EXISTS(SELECT 1 FROM json_each(c.data,'$.styles') WHERE value=?))";
  const parameters=[category,category,cuisine,cuisine,style,style];
  const rows=words.length?db.prepare('SELECT c.data FROM catalogue_search s JOIN catalogue c ON c.id=s.id WHERE catalogue_search MATCH ? AND '+filterSQL+' ORDER BY bm25(catalogue_search,0,8,1) LIMIT 80').all(words.map(w=>'"'+w+'"*').join(' AND '),...parameters):db.prepare('SELECT c.data FROM catalogue c WHERE '+filterSQL+' ORDER BY c.rowid DESC LIMIT 80').all(...parameters);
  return rows.map(r=>JSON.parse(r.data)).filter(r=>(!category||r.categories?.includes(category))&&(!cuisine||r.cuisines?.includes(cuisine))&&(!style||r.styles?.includes(style))).slice(0,80).map(r=>({providerId:r.providerId,provider:r.provider,name:r.name,image:r.image,category:r.categories?.join(' · ')??'',cuisine:r.cuisines?.join(' · ')??'',style:r.styles?.join(' · ')??''}));
}
export function catalogueFilters(db){
  const categories=new Set(),cuisines=new Set(),styles=new Set();for(const row of db.prepare('SELECT data FROM catalogue').all()){const r=JSON.parse(row.data);r.categories?.forEach(x=>categories.add(x));r.cuisines?.forEach(x=>cuisines.add(x));r.styles?.forEach(x=>styles.add(x));}return {categories:[...categories].sort(),cuisines:[...cuisines].sort(),styles:[...styles].sort()};
}
export function catalogueStatus(db){return {ready:db.prepare('SELECT count(*) AS n FROM catalogue').get().n,candidates:db.prepare('SELECT count(*) AS n FROM candidates').get().n,statuses:db.prepare('SELECT status,count(*) AS count FROM candidates GROUP BY status').all()};}
export function getCatalogueRecipe(db,id){const row=db.prepare('SELECT data FROM catalogue WHERE id=?').get(id);if(!row)throw Error('This catalogue recipe is not available.');return JSON.parse(row.data);}
export const normaliseRecipeText=s=>String(s??'').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function recipeFingerprint(recipe){const ingredients=combine(recipe.ingredients.map(parse)).map(i=>[key(i.name),i.amount===null?null:Math.round(i.amount*10000)/10000,i.unit,i.quantityText??'']).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return createHash('sha256').update(JSON.stringify([normaliseRecipeText(recipe.name),ingredients])).digest('hex');}
export function matchingTitle(expected,actual){const words=s=>new Set(normaliseRecipeText(s).split(' ').filter(x=>!['the','a','and','with','recipe'].includes(x))),a=words(expected),b=words(actual);return a.size>0&&[...a].filter(x=>b.has(x)).length/Math.max(a.size,b.size)>=.5;}
export function usablePhotoURL(input){try{const u=new URL(input);return ['http:','https:'].includes(u.protocol)&&!/(sharegraphic|placeholder|default[-_]|logo|spacer|no[-_]?image|blank)/i.test(u.pathname);}catch{return false;}}
export function enqueueCandidates(db,query){
  const words=String(query??'').normalize('NFKD').match(/[\p{L}\p{N}]+/gu)?.slice(0,12)??[];if(!words.length)return 0;
  const rows=db.prepare("SELECT c.id FROM candidate_search s JOIN candidates c ON c.id=s.id WHERE candidate_search MATCH ? AND c.status IN ('unprocessed','pending') ORDER BY bm25(candidate_search,0,8,1) LIMIT 4").all(words.map(w=>'"'+w+'"*').join(' AND '));
  for(const row of rows)db.prepare("UPDATE candidates SET status='pending',priority=2 WHERE id=?").run(row.id);return rows.length;
}
export function localImageExists(directory,url){return /^\/catalogue-images\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(url??'')&&existsSync(join(directory,url.slice(1)));}

export function recipeTags(recipe){
  const text=recipe.ingredients.join(' ').toLowerCase(),categories=new Set();
  for(const [name,pattern] of [['Chicken',/\bchicken\b/],['Beef',/\bbeef\b/],['Pork',/\bpork|bacon|ham\b/],['Seafood',/\bsalmon|tuna|prawns?|shrimp|cod|haddock|fish\b/],['Pasta',/\bpasta|spaghetti|macaroni|penne|linguine|lasagn[ae]|fettuccine\b/]])if(pattern.test(text))categories.add(name);
  const diets=[].concat(recipe.diets??[]).join(' ');if(/VegetarianDiet/i.test(diets))categories.add('Vegetarian');if(/VeganDiet/i.test(diets))categories.add('Vegan');if(/dessert/i.test([].concat(recipe.recipeCategory??[]).join(' ')))categories.add('Dessert');
  const known=['British','Italian','Indian','Chinese','Mexican','Thai','Japanese','Greek','French','Spanish','American','Korean','Vietnamese','Lebanese','Turkish','Moroccan','Ethiopian','Jamaican','Brazilian','Portuguese','Indonesian','Malaysian','Filipino','Pakistani','Persian','Egyptian','Polish','German','Irish','Cajun','Caribbean','African','Asian','Middle Eastern'];
  const raw=[].concat(recipe.recipeCuisine??[],recipe.keywords??[],recipe.recipeCategory??[]).join(' ');const cuisines=known.filter(x=>new RegExp('\\b'+x+'\\b','i').test(raw));
  const styles=new Set(),styleText=[recipe.name,raw].join(' ');for(const [name,pattern] of [['Curries',/\bcurry|curries|korma|vindaloo\b/i],['Stir-fries',/stir[- ]?fr/i],['Salads',/\bsalad\b/i],['Soups',/\bsoup|broth|chowder\b/i],['Stews',/\bstew|casserole|tagine\b/i],['Grilled & BBQ',/\bgrill|barbecue|bbq|kebab\b/i],['Noodles',/\bnoodles?|ramen|pho\b/i],['Rice dishes',/\brisotto|biryani|paella|rice\b/i],['Traybakes',/\btraybake|sheet pan\b/i],['Wraps & tacos',/\btacos?|wraps?|burritos?\b/i],['Pies & pastry',/\bpie|tart|pastry\b/i],['Pizza',/\bpizza\b/i],['Sandwiches & burgers',/\bsandwich|burger\b/i]])if(pattern.test(styleText))styles.add(name);
  return {categories:[...categories],cuisines,styles:[...styles]};
}
