import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fetchRecipePage,extractRecipe} from './lib/import.js';
import {combine,key,quantity,mergeQuantity} from './lib/ingredients.js';
import {searchRecipes,getRecipe,discoveryFilters} from './lib/discovery.js';
const PORT=Number(process.env.PORT||4195), DATA=resolve(process.env.DATA_DIR||'data'),ROOT=resolve('public');
await mkdir(DATA,{recursive:true});const db=new DatabaseSync(join(DATA,'simmer.db'));db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS recipes(id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS meals(slot TEXT PRIMARY KEY, recipe TEXT NOT NULL, servings REAL NOT NULL); CREATE TABLE IF NOT EXISTS sends(id TEXT PRIMARY KEY, data TEXT NOT NULL);');
const state=()=>({recipes:db.prepare('SELECT data FROM recipes ORDER BY rowid DESC').all().map(r=>JSON.parse(r.data)),meals:db.prepare('SELECT slot,recipe,servings FROM meals').all()});
db.exec('CREATE TABLE IF NOT EXISTS undos(id TEXT PRIMARY KEY,data TEXT NOT NULL)');
const recordUndo=data=>{const id=randomUUID();db.prepare('INSERT INTO undos VALUES(?,?)').run(id,JSON.stringify({...data,expires:Date.now()+60000}));return id;};
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const text=(s,max=20000)=>String(s??'').trim().slice(0,max);
const validSlot=s=>/^\d{4}-\d{2}-\d{2}:(lunch|dinner)$/.test(s)&&!Number.isNaN(Date.parse(s.slice(0,10)));
const tallyURL=process.env.TALLY_URL||'http://127.0.0.1:4188';
async function tally(path,body){const r=await fetch(tallyURL+path,{method:body?'POST':'GET',headers:{'X-Who':'jason',...(body?{'Content-Type':'application/json'}:{}),...(process.env.TALLY_COOKIE?{Cookie:process.env.TALLY_COOKIE}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});if(!r.ok){const data=await r.json().catch(()=>({}));const e=Error(r.status===409?data.error:'Tally is unavailable or requires sign-in. Retry this send when it reconnects.');e.status=r.status===409?409:502;throw e;}return r.json();}
async function deliver(requestId,payload){const result=await tally('/api/integrations/simmer',payload);db.prepare('UPDATE sends SET data=? WHERE id=?').run(JSON.stringify(result),requestId);return result;}
function preview(body,lists){
  if(!Array.isArray(body.ingredients)||body.ingredients.length>200)throw Error('Select up to 200 ingredients.');
  const ingredients=combine(body.ingredients.map(i=>{if(!i||!text(i.name,180)||i.needsReview||!(i.amount===null||(Number.isFinite(i.amount)&&i.amount>0&&i.amount<=100000)))throw Error('Check ingredient quantities; resolve ranges before sending.');return {name:text(i.name,180),amount:i.amount,unit:text(i.unit,20),quantityText:text(i.quantityText,40)};}));
  const list=body.listId?lists.find(l=>l.id===body.listId&&l.kind==='shopping'&&l.shared):null;
  if(body.listId&&!list)throw Error('Choose a shared shopping list.');
  return ingredients.map(i=>{const incompatible=ingredients.filter(x=>key(x.name)===key(i.name)).length>1;const matches=list?.items.filter(x=>!x.done&&key(x.text)===key(i.name))??[];const existing=matches[0];const merged=existing&&matches.length===1?mergeQuantity(existing.qty??'',i):null;return {...i,qty:quantity(i),existing:existing?{id:existing.id,qty:existing.qty,text:existing.text}:null,merged,action:incompatible?'review':existing?(merged===null?'review':'merge'):'add'};});
}
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/ingredients.js'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-cache'});return res.end(await readFile('lib/ingredients.js'));}
  if(url.pathname==='/steps.js'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-cache'});return res.end(await readFile('lib/steps.js'));}
  if(url.pathname.startsWith('/api/')){
    if(req.method==='POST'&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)return send(res,403,{error:'Cross-origin writes are not allowed.'});
    let body={};if(req.method==='POST'){let raw='';for await(const part of req){raw+=part;if(raw.length>500000)return send(res,413,{error:'Request too large'});}body=JSON.parse(raw||'{}');}
    if(url.pathname==='/api/state'&&req.method==='GET')return send(res,200,state());
    if(url.pathname==='/api/discover'&&req.method==='GET')return send(res,200,{recipes:await searchRecipes(url.searchParams.get('q'),{category:url.searchParams.get('category'),cuisine:url.searchParams.get('cuisine')})});
    if(url.pathname==='/api/discover/filters'&&req.method==='GET')return send(res,200,await discoveryFilters());
    if(url.pathname==='/api/discover/recipe'&&req.method==='GET')return send(res,200,await getRecipe(url.searchParams.get('id')??''));
    if(url.pathname==='/api/recipe'&&req.method==='POST'){
      if(!text(body.name,180)||!Array.isArray(body.ingredients)||!body.ingredients.length||body.ingredients.length>100||!Number.isFinite(Number(body.servings))||Number(body.servings)<1||Number(body.servings)>100)throw Error('Add a name, valid portions and ingredients.');
      const safeURL=s=>{try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}};
      const providerId=/^\d{1,12}$/.test(body.providerId??'')?body.providerId:null;
      const existing=providerId?state().recipes.find(r=>r.providerId===providerId):null;
      const recipe={id:body.id&&/^[\w-]{1,64}$/.test(body.id)?body.id:existing?.id??randomUUID(),name:text(body.name,180),servings:Number(body.servings),ingredients:body.ingredients.map(s=>text(s,500)).filter(Boolean),instructions:text(body.instructions),prep:Math.max(0,Math.min(1440,Number(body.prep)||0)),cook:Math.max(0,Math.min(1440,Number(body.cook)||0)),source:safeURL(body.source),image:safeURL(body.image),...(providerId?{providerId,provider:'TheMealDB',providerURL:'https://www.themealdb.com',yieldUnverified:!!body.yieldUnverified}:{})};
      recipe.yieldUnverified=!!body.yieldUnverified;
      if(!recipe.ingredients.length)throw Error('Add an ingredient.');db.prepare('INSERT INTO recipes VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(recipe.id,JSON.stringify(recipe));return send(res,200,recipe);
    }
    if(url.pathname==='/api/recipe/delete'&&req.method==='POST'){let undoToken;db.exec('BEGIN');try{const recipe=db.prepare('SELECT data FROM recipes WHERE id=?').get(text(body.id));if(recipe)undoToken=recordUndo({recipe:JSON.parse(recipe.data),meals:db.prepare('SELECT * FROM meals WHERE recipe=?').all(text(body.id))});db.prepare('DELETE FROM meals WHERE recipe=?').run(text(body.id));db.prepare('DELETE FROM recipes WHERE id=?').run(text(body.id));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return send(res,200,{...state(),undoToken});}
    if(url.pathname==='/api/undo'&&req.method==='POST'){
      const row=db.prepare('SELECT data FROM undos WHERE id=?').get(text(body.token));if(!row)throw Error('Undo is no longer available.');const undo=JSON.parse(row.data);if(undo.expires<Date.now())throw Error('Undo has expired.');
      db.exec('BEGIN');try{if(undo.recipe){const existing=db.prepare('SELECT data FROM recipes WHERE id=?').get(undo.recipe.id);if(existing&&existing.data!==JSON.stringify(undo.recipe))throw Error('This recipe changed; it cannot be restored over newer edits.');db.prepare('INSERT OR IGNORE INTO recipes VALUES(?,?)').run(undo.recipe.id,JSON.stringify(undo.recipe));}for(const m of undo.meals??[])if(db.prepare('SELECT id FROM recipes WHERE id=?').get(m.recipe))db.prepare('INSERT OR IGNORE INTO meals VALUES(?,?,?)').run(m.slot,m.recipe,m.servings);db.prepare('DELETE FROM undos WHERE id=?').run(body.token);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return send(res,200,state());
    }
    if(url.pathname==='/api/meal'&&req.method==='POST'){
      if(!validSlot(body.slot)||!db.prepare('SELECT id FROM recipes WHERE id=?').get(text(body.recipe)))throw Error('Choose a valid meal and recipe.');const portions=Number(body.servings??2);if(!Number.isFinite(portions)||portions<1||portions>100)throw Error('Choose 1–100 portions.');
      db.prepare('INSERT INTO meals VALUES(?,?,?) ON CONFLICT(slot) DO UPDATE SET recipe=excluded.recipe,servings=excluded.servings').run(body.slot,body.recipe,portions);return send(res,200,state());
    }
    if(url.pathname==='/api/meal/remove'&&req.method==='POST'){const meal=db.prepare('SELECT * FROM meals WHERE slot=?').get(text(body.slot));let undoToken;db.exec('BEGIN');try{if(meal)undoToken=recordUndo({meals:[meal]});db.prepare('DELETE FROM meals WHERE slot=?').run(text(body.slot));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return send(res,200,{...state(),undoToken});}
    if(url.pathname==='/api/recipe/portions'&&req.method==='POST'){const row=db.prepare('SELECT data FROM recipes WHERE id=?').get(text(body.id));if(!row)throw Error('Recipe no longer available.');const portions=Number(body.servings);if(!Number.isFinite(portions)||portions<1||portions>100)throw Error('Choose 1–100 original portions.');const r=JSON.parse(row.data);r.servings=portions;r.yieldUnverified=false;db.prepare('UPDATE recipes SET data=? WHERE id=?').run(JSON.stringify(r),r.id);return send(res,200,r);}
    if(url.pathname==='/api/meal/move'&&req.method==='POST'){
      if(!validSlot(body.from)||!validSlot(body.to))throw Error('Invalid meal slot.');db.exec('BEGIN');try{const a=db.prepare('SELECT * FROM meals WHERE slot=?').get(body.from),b=db.prepare('SELECT * FROM meals WHERE slot=?').get(body.to);if(!a)throw Error('This meal has moved. Refresh and try again.');db.prepare('DELETE FROM meals WHERE slot IN (?,?)').run(body.from,body.to);db.prepare('INSERT INTO meals VALUES(?,?,?)').run(body.to,a.recipe,a.servings);if(b)db.prepare('INSERT INTO meals VALUES(?,?,?)').run(body.from,b.recipe,b.servings);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return send(res,200,state());
    }
    if(url.pathname==='/api/import'&&req.method==='POST')return send(res,200,extractRecipe(await fetchRecipePage(body.url),body.url));
    if(url.pathname==='/api/tally/lists'&&req.method==='GET'){const s=await tally('/api/state?since=-1');return send(res,200,s.lists.filter(l=>l.kind==='shopping'&&l.shared));}
    if(url.pathname==='/api/tally/preview'&&req.method==='POST'){const s=await tally('/api/state?since=-1');return send(res,200,{rows:preview(body,s.lists),version:s.version});}
    if(url.pathname==='/api/tally/send'&&req.method==='POST'){
      if(!/^[\w-]{1,64}$/.test(body.requestId??''))throw Error('Missing send identifier.');const previous=db.prepare('SELECT data FROM sends WHERE id=?').get(body.requestId);if(previous){const data=JSON.parse(previous.data);return send(res,200,data.payload?await deliver(body.requestId,data.payload):data);}
      const s=await tally('/api/state?since=-1');if(s.version!==body.version)return send(res,409,{error:'Tally changed. Review the refreshed preview before sending again.'});
      const rows=preview(body,s.lists);if(rows.some(i=>i.action==='review'))return send(res,409,{error:'Some quantities cannot be combined safely. Untick those ingredients or update them in Tally first.'});if(!rows.length)throw Error('Choose at least one ingredient.');
      const listId=body.listId||randomUUID(),ops=[];if(!body.listId)ops.push({type:'addList',id:listId,name:text(body.name,180)||'Weekly meals',kind:'shopping',shared:true,by:'jason',theme:1});
      for(const i of rows)ops.push(i.existing?{type:'editItem',id:i.existing.id,text:i.existing.text,qty:i.merged}:{type:'addItem',id:randomUUID(),listId,text:i.name,qty:i.qty,by:'jason'});
      const payload={requestId:body.requestId,expectedVersion:s.version,ops,result:{listId,count:rows.length}};
      db.prepare('INSERT INTO sends VALUES(?,?)').run(body.requestId,JSON.stringify({payload}));
      return send(res,200,await deliver(body.requestId,payload));
    }
    return send(res,404,{error:'Not found'});
  }
  if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
  const file=resolve(ROOT,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(ROOT+'/'))return send(res,404,{error:'Not found'});
  try{const content=await readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(content);}catch{return send(res,404,{error:'Not found'});}
}catch(e){send(res,e.status||400,{error:e.message||'Something went wrong.'});}});
server.listen(PORT,()=>console.log(`Simmer on http://localhost:${PORT}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
