import test from 'node:test';
import assert from 'node:assert/strict';
import {parse,scaled,combine,mergeQuantity,rebuildRows} from '../lib/ingredients.js';
import {instructionSteps} from '../lib/steps.js';
import {extractRecipe,publicIPv4} from '../lib/import.js';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('scaling, fractions and safe compatible merging',()=>{
  assert.deepEqual(parse('200g pasta'),{name:'pasta',amount:200,unit:'g'});
  assert.equal(parse('1/2 tsp salt').amount,.5);assert.equal(parse('1½ tbsp oil').amount,1.5);
  assert.equal(scaled(['200g pasta'],4,2)[0].amount,100);
  assert.equal(scaled(['salt to taste'],4,2)[0].amount,null);
  assert.equal(combine([parse('500g pasta'),parse('1kg pasta')])[0].amount,1500);
  assert.equal(mergeQuantity('500 g',parse('1kg pasta')),'1500 g');
  assert.equal(mergeQuantity('2 cups',parse('100g flour')),null);
  assert.equal(mergeQuantity('',parse('2 onions')),null);
  assert.equal(mergeQuantity('500g ×2',parse('100g pasta')),'1100 g');
  assert.equal(mergeQuantity('500g ×2',parse('1kg pasta')),'2000 g');
  assert.equal(mergeQuantity('1–2',parse('2 onions')),null);
  assert.equal(parse('1–2 onions').needsReview,true);assert.equal(parse('1–2 onions').name,'onions');
  assert.equal(parse('1-2 onions').amount,null);
  const rows=rebuildRows([parse('200g pasta'),parse('2 onions')]);const overrides=new Map([[rows[0].identity,{name:'Wholewheat pasta',amount:175,unit:'g'}],[rows[1].identity,{selected:false}]]);
  const updated=rebuildRows([parse('400g pasta'),parse('4 onions')],overrides);assert.equal(updated[0].name,'Wholewheat pasta');assert.equal(updated[0].amount,175);assert.equal(updated[1].selected,false);
  assert.deepEqual(instructionSteps('STEP 1\nHeat at 180°C for 20 minutes.\n\nSTEP 2\nCheck it is cooked.'),['Heat at 180°C for 20 minutes.','Check it is cooked.']);
});
test('structured recipe import and private network blocking',()=>{
  const data={'@graph':[{'@type':['Recipe'],name:'Pasta &amp; peas',recipeYield:'4 servings',recipeIngredient:['200g pasta','100g peas'],recipeInstructions:[{'@type':'HowToSection',itemListElement:[{text:'Boil pasta.'},{text:'Add peas.'}]}],prepTime:'PT10M',cookTime:'PT1H5M',image:[{url:'https://example.com/photo.jpg'}]}]};
  const r=extractRecipe('<script type="application/ld+json">'+JSON.stringify(data)+'</script>','https://example.com/recipe');assert.equal(r.servings,4);assert.equal(r.cook,65);assert.equal(r.name,'Pasta & peas');assert.equal(r.instructions,'Boil pasta.\n\nAdd peas.');
  for(const ip of ['127.0.0.1','10.1.2.3','192.168.0.35','169.254.169.254','172.16.1.1','100.64.0.1','::1'])assert.equal(publicIPv4(ip),false);assert.equal(publicIPv4('8.8.8.8'),true);
});
test('persistent shared calendar and confirmed Tally sends',async t=>{
  const tally={version:1,lists:[{id:'groceries',name:'Groceries',kind:'shopping',shared:true,items:[{id:'pasta',text:'pasta',qty:'500 g',done:false}]}]};let sent=[];
  const receipts=new Map();let loseReply=true;
  const mock=createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.method==='POST'){let s='';for await(const c of req)s+=c;const body=JSON.parse(s);if(receipts.has(body.requestId))return res.end(JSON.stringify(receipts.get(body.requestId)));if(body.expectedVersion!==tally.version){res.statusCode=409;return res.end(JSON.stringify({error:'Tally changed.'}));}sent.push(...body.ops);tally.version++;receipts.set(body.requestId,body.result);if(body.requestId==='lost-reply'&&loseReply){loseReply=false;req.socket.destroy();return;}return res.end(JSON.stringify(body.result));}res.end(JSON.stringify(tally));});await new Promise(r=>mock.listen(0,'127.0.0.1',r));
  const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
  const data=await mkdtemp(join(tmpdir(),'simmer-test-'));let child;
  async function start(){child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATA_DIR:data,TALLY_URL:'http://127.0.0.1:'+mock.address().port},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),10000);child.stdout.on('data',c=>{if(String(c).includes('Simmer on')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code));});});}
  async function stop(){if(child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}}
  t.after(async()=>{await stop();await new Promise(r=>mock.close(r));await rm(data,{recursive:true,force:true});});await start();
  const api=async(path,body)=>{const r=await fetch(`http://localhost:${port}/api/`+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const {data:r}=await api('recipe',{name:'Pasta',servings:2,ingredients:['200g pasta'],instructions:'Boil.',providerId:'555',yieldUnverified:true});assert.ok(r.id);
  const duplicate=await api('recipe',{name:'Pasta',servings:2,ingredients:['200g pasta'],instructions:'Boil.',providerId:'555',yieldUnverified:true});assert.equal(duplicate.data.id,r.id);assert.equal(duplicate.data.provider,'TheMealDB');assert.equal((await api('state')).data.recipes.length,1);
  const confirmed=await api('recipe/portions',{id:r.id,servings:4});assert.equal(confirmed.data.servings,4);assert.equal(confirmed.data.yieldUnverified,false);
  await api('meal',{slot:'2026-10-12:lunch',recipe:r.id});await api('meal',{slot:'2026-10-13:dinner',recipe:r.id,servings:4});await api('meal/move',{from:'2026-10-12:lunch',to:'2026-10-13:dinner'});let s=(await api('state')).data;assert.equal(s.meals.find(m=>m.slot==='2026-10-12:lunch').servings,4);assert.equal(sent.length,0);
  const body={listId:'groceries',ingredients:[parse('200g pasta')]};const preview=(await api('tally/preview',body)).data;assert.equal(preview.rows[0].merged,'700 g');assert.equal(sent.length,0);
  const conflict=(await api('tally/preview',{ingredients:[parse('200g flour'),parse('1 cup flour')]})).data;assert.equal(conflict.rows[0].action,'review');assert.equal(conflict.rows[1].action,'review');
  assert.equal((await api('tally/send',{...body,version:0,requestId:'stale'})).status,409);
  const send={...body,version:preview.version,requestId:'once'};assert.equal((await api('tally/send',send)).status,200);assert.equal(sent.length,1);assert.equal(sent[0].qty,'700 g');await api('tally/send',send);assert.equal(sent.length,1);
  await stop();await start();s=(await api('state')).data;assert.equal(s.recipes.length,1);assert.equal(s.meals.length,2);await api('tally/send',send);assert.equal(sent.length,1);
  const lost={ingredients:[parse('2 carrots')],name:'Retry shop',version:tally.version,requestId:'lost-reply'};assert.notEqual((await api('tally/send',lost)).status,200);const count=sent.length;await stop();await start();assert.equal((await api('tally/send',lost)).status,200);assert.equal(sent.length,count);
  const removed=await api('meal/remove',{slot:'2026-10-12:lunch'});assert.ok(removed.data.undoToken);await api('undo',{token:removed.data.undoToken});assert.equal((await api('state')).data.meals.length,2);
  const deleted=await api('recipe/delete',{id:r.id});assert.equal((await api('state')).data.meals.length,0);await api('undo',{token:deleted.data.undoToken});assert.equal((await api('state')).data.recipes.length,1);assert.equal((await api('state')).data.meals.length,2);
});
