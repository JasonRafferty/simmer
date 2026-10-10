import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openCatalogue,publishRecipe,searchCatalogue,catalogueFilters,catalogueStatus,getCatalogueRecipe,recipeFingerprint,recipeTags,localImageExists,deduplicateTitles} from '../lib/catalogue.js';
import {parse} from '../lib/ingredients.js';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

const photo='/catalogue-images/'+'a'.repeat(64)+'.jpg';
const recipe={providerId:'epic-'+'1'.repeat(24),provider:'Epicurious',name:'Thai Chicken Curry',ingredients:['500g chicken','1 tablespoon curry paste'],instructions:'Heat the oil.\n\nAdd the chicken and cook thoroughly for 20 minutes.',image:photo,source:'https://example.com/thai-chicken',servings:2,yieldUnverified:false,categories:['Chicken'],cuisines:['Thai'],styles:['Curries'],prep:5,cook:20};
test('catalogue search, filtering, safe query syntax, deduplication',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'simmer-catalogue-'));const db=openCatalogue(dir);t.after(async()=>{db.close();await rm(dir,{recursive:true,force:true});});
 publishRecipe(db,recipe);assert.equal(searchCatalogue(db,'chicken',{cuisine:'Thai',style:'Curries'}).length,1);assert.equal(searchCatalogue(db,'chicken',{cuisine:'Italian'}).length,0);assert.equal(searchCatalogue(db,'',{style:'Curries'}).length,1);assert.doesNotThrow(()=>searchCatalogue(db,'" OR * : NEAR(foo)'));assert.equal(getCatalogueRecipe(db,recipe.providerId).name,recipe.name);
 const facets=catalogueFilters(db);assert.deepEqual(facets.categories,['Chicken']);assert.deepEqual(facets.cuisines,['Thai']);assert.deepEqual(facets.styles,['Curries']);assert.equal(facets.counts.categories.Chicken,1);assert.equal(catalogueStatus(db).ready,1);
 const equivalent={...recipe,name:'THAI CHICKEN CURRY!',ingredients:['0.5kg chicken','3 teaspoons curry paste']};assert.equal(recipeFingerprint(recipe),recipeFingerprint(equivalent));assert.throws(()=>publishRecipe(db,{...equivalent,providerId:'epic-'+'2'.repeat(24),image:photo.replace('a'.repeat(64),'b'.repeat(64))}),/UNIQUE/);assert.equal(catalogueStatus(db).ready,1);
 assert.throws(()=>publishRecipe(db,{...recipe,providerId:'epic-'+'3'.repeat(24),name:'Different dish'}),/UNIQUE/);assert.throws(()=>publishRecipe(db,{...recipe,image:''}),/Incomplete/);
 assert.equal(localImageExists(dir,photo),false);await mkdir(join(dir,'catalogue-images'));await writeFile(join(dir,photo.slice(1)),Buffer.from([255,216,255]));assert.equal(localImageExists(dir,photo),true);assert.equal(localImageExists(dir,'/catalogue-images/../../simmer.db'),false);
});
test('inferred cuisine tags and readable measurement units',async()=>{
 const inferred=recipeTags({...recipe,name:'Kimchi Noodles',tagsInferred:true});assert.ok(inferred.cuisines.includes('Korean'));assert.ok(inferred.styles.includes('Noodles'));
 const tags=recipeTags({...recipe,keywords:'Thai,Asian,Stir-Fry',recipeCuisine:'Thai'});assert.ok(tags.cuisines.includes('Thai'));assert.ok(tags.styles.includes('Curries'));assert.ok(tags.styles.includes('Stir-fries'));assert.ok(!tags.categories.includes('Vegetarian'));
 assert.equal(parse('1 tablespoon oil').unit,'tbsp');assert.equal(parse('2 teaspoons salt').name,'salt');assert.equal(parse('1/2 c. butter').unit,'cup');assert.equal(parse('8 ounces flour').unit,'oz');assert.equal(parse('1 kilogram potatoes').unit,'kg');
});
test('catalogue HTTP search, photo serving and saving remain separate from the catalogue',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'simmer-catalogue-api-'));await mkdir(join(dir,'catalogue-images'));await writeFile(join(dir,photo.slice(1)),Buffer.from([255,216,255]));const db=openCatalogue(dir);publishRecipe(db,recipe);db.close();
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATA_DIR:dir},stdio:['ignore','pipe','pipe']});t.after(async()=>{if(child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}await rm(dir,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),10000);child.stdout.on('data',c=>{if(String(c).includes('Simmer on')){clearTimeout(timer);resolve();}});child.once('exit',()=>{clearTimeout(timer);reject(Error('Server exited'));});});
 const base='http://127.0.0.1:'+port,api=async(path,body)=>fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined}).then(r=>r.json());
 assert.equal((await api('state')).recipes.length,0);const search=await api('discover?catalogueOnly=1&q=chicken&cuisine=Thai&style=Curries');assert.equal(search.recipes.length,1);const detail=await api('discover/recipe?id='+recipe.providerId);assert.equal(detail.ingredients.length,2);
 const image=await fetch(base+photo);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/jpeg');const saved=await api('recipe',detail);assert.equal(saved.provider,'Epicurious');assert.equal(saved.image,photo);assert.equal((await api('state')).recipes.length,1);assert.equal((await api('catalogue/status')).ready,1);const again=await api('recipe',detail);assert.equal(again.id,saved.id);assert.equal((await api('state')).recipes.length,1);
 const tastyPhoto=photo.replace('a'.repeat(64),'b'.repeat(64));await writeFile(join(dir,tastyPhoto.slice(1)),Buffer.from([255,216,255]));const tasty={...recipe,providerId:'tasty-'+'4'.repeat(24),provider:'Tasty',name:'Japanese Noodle Soup',ingredients:['200g noodles','500ml stock'],instructions:'Bring stock to a boil. Add noodles and cook until tender.',image:tastyPhoto,source:'https://tasty.co/recipe/japanese-noodle-soup'};const connection=openCatalogue(dir);publishRecipe(connection,tasty);connection.close();
 const tastyDetail=await api('discover/recipe?id='+tasty.providerId);assert.equal(tastyDetail.provider,'Tasty');const tastySaved=await api('recipe',tastyDetail);assert.equal(tastySaved.provider,'Tasty');assert.equal(tastySaved.providerURL,'https://tasty.co/');assert.equal(tastySaved.providerId,tasty.providerId);assert.equal((await api('recipe',tastyDetail)).id,tastySaved.id);
 assert.equal((await api('discover/remove',{providerId:tasty.providerId})).removed,true);assert.equal((await api('catalogue/status')).ready,1);assert.equal((await api('state')).recipes.length,2);assert.equal((await api('discover?catalogueOnly=1&q=Japanese')).recipes.length,0);assert.ok((await api('discover/recipe?id='+tasty.providerId)).error);assert.ok((await api('discover/remove',{providerId:'../../simmer.db'})).error);
});
