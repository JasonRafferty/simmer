import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openCatalogue,publishRecipe,catalogueStatus,getCatalogueRecipe} from '../lib/catalogue.js';

test('Tasty staging retains original quantities, source cuisines and unknown portions',t=>{
 const check=spawnSync('python3',['--version']);if(check.error)return t.skip('Python 3 is needed for dataset importing');
 const result=spawnSync('python3',['-c',`
import importlib.util,json
s=importlib.util.spec_from_file_location('tasty','scripts/prepare-tasty.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
d={'name':'Test mixed cuisine dish','recipe_id':'test-dish','tags':[1,2,3]}
r={'ingredients':[{'name':'cream cheese','primary_quantity':'4','primary_unit':'oz','metric_quantity':'55','metric_unit':'g','comment':'softened'}],'instructions':['Mix all ingredients, then cook thoroughly for twenty minutes.']}
tags={1:{'type':'cuisine','name':'japanese','display_name':'Japanese'},2:{'type':'cuisine','name':'mexican','display_name':'Mexican'},3:{'type':'dietary','name':'vegetarian'}}
assert m.allowed('https://img.buzzfeed.com/test.jpg')
assert not m.allowed('https://img.buzzfeed.com.evil.example/test.jpg')
assert not m.allowed('http://127.0.0.1/test.jpg')
assert m.clean('Mac '+chr(226)+chr(128)+chr(152)+'N'+chr(226)+chr(128)+chr(153)+' Cheese')=='Mac ‘N’ Cheese'
assert m.clean('Fish &amp; chips')=='Fish & chips'
print(json.dumps(m.stage_recipe(d,r,tags)))
`],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const recipe=JSON.parse(result.stdout);assert.deepEqual(recipe.ingredients,['4 oz cream cheese, softened']);assert.deepEqual(recipe.recipeCuisine,['Japanese','Mexican']);assert.equal(recipe.source,'https://tasty.co/recipe/test-dish');assert.equal(recipe.yieldUnverified,true);assert.deepEqual(recipe.diets,['VegetarianDiet']);
});

test('Tasty merge is backed up, repeatable and preserves existing catalogue and user state',async t=>{
 const root=await mkdtemp(join(tmpdir(),'simmer-tasty-merge-')),data=join(root,'data'),stage=join(root,'stage');t.after(()=>rm(root,{recursive:true,force:true}));
 for(const dir of [data,stage,join(data,'catalogue-images'),join(stage,'catalogue-images')])await mkdir(dir);
 const photo='/catalogue-images/'+'c'.repeat(64)+'.jpg',oldPhoto='/catalogue-images/'+'d'.repeat(64)+'.jpg';
 const recipe={providerId:'tasty-'+'5'.repeat(24),provider:'Tasty',name:'Taiwanese Noodle Soup',recipeCuisine:['Taiwanese'],ingredients:['200g noodles','500ml broth'],instructions:'Bring the broth to the boil. Add noodles and cook until tender.',image:photo};
 const db=openCatalogue(data);publishRecipe(db,{...recipe,providerId:'epic-'+'6'.repeat(24),provider:'Epicurious',name:'Roast potatoes',ingredients:['500g potatoes'],image:oldPhoto});db.close();
 await writeFile(join(data,'simmer.db'),'Existing saved recipes and calendar');await writeFile(join(data,oldPhoto.slice(1)),Buffer.from([255,216,255]));await writeFile(join(stage,photo.slice(1)),Buffer.from([255,216,255]));await writeFile(join(stage,'recipes.jsonl'),JSON.stringify(recipe)+'\n'+JSON.stringify({...recipe,providerId:'tasty-'+'7'.repeat(24),name:'TAIWANESE NOODLE SOUP!'})+'\n');await writeFile(join(stage,'import-report.json'),JSON.stringify({source:'Tasty',rows:2}));
 const run=()=>spawnSync(process.execPath,['scripts/merge-tasty.mjs',stage,data],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
 const first=run();assert.equal(first.status,0,first.stderr);assert.equal(JSON.parse(first.stdout).added,1);assert.equal(JSON.parse(first.stdout).duplicates,1);const again=run();assert.equal(again.status,0,again.stderr);assert.equal(JSON.parse(again.stdout).added,0);
 const result=openCatalogue(data);assert.equal(catalogueStatus(result).ready,2);assert.ok(getCatalogueRecipe(result,recipe.providerId).cuisines.includes('Taiwanese'));assert.equal(result.prepare('SELECT count(*) n FROM catalogue_search').get().n,2);result.close();
 assert.equal(await readFile(join(data,'simmer.db'),'utf8'),'Existing saved recipes and calendar');assert.equal((await readdir(data)).filter(n=>n.startsWith('catalogue-before-tasty-')).length,2);
});
