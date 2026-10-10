import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mainIngredients,effortMatches} from '../lib/recipe-filters.js';
import {openCatalogue,publishRecipe,recipeTags,searchCatalogue,catalogueFilters,catalogueIdeas,removeCatalogueRecipe,removedRecipeIds} from '../lib/catalogue.js';
test('main ingredients separate meat, fish and shellfish without matching graham or stock',()=>{
 assert.deepEqual(mainIngredients({name:'Graham cracker cake',ingredients:['graham crackers','butter']}),['Other ingredients']);
 assert.deepEqual(mainIngredients({name:'Mushroom risotto',ingredients:['chicken stock','rice','mushrooms']}),['Mushrooms']);
 assert.deepEqual(mainIngredients({name:'Grilled salmon',ingredients:['salmon','butter']}),['Fish']);
 assert.deepEqual(mainIngredients({name:'Prawn curry',ingredients:['prawns','curry paste']}),['Seafood']);
 assert.deepEqual(mainIngredients({name:'Roast lamb',ingredients:['lamb','potatoes']}),['Lamb']);
 assert.equal(effortMatches({},'5'),false);assert.equal(effortMatches({ingredientCount:5},'5'),true);assert.equal(effortMatches({ingredientCount:6},'5'),false);
 assert.equal(effortMatches({ingredientCount:6},'6-10'),true);assert.equal(effortMatches({ingredientCount:10},'6-10'),true);assert.equal(effortMatches({ingredientCount:11},'6-10'),false);assert.equal(effortMatches({ingredientCount:11},'11+'),true);assert.equal(effortMatches({ingredientCount:12},['5','11+']),true);assert.equal(effortMatches({ingredientCount:7},['5','11+']),false);
});
test('multiple choices use OR within filters and AND between filters',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'simmer-multi-'));const db=openCatalogue(dir);t.after(async()=>{db.close();await rm(dir,{recursive:true,force:true});});
 for(const [i,cuisine,category,style,count]of [[1,'Italian','Chicken','Pasta dishes',4],[2,'Mexican','Chicken','Wraps & tacos',8],[3,'Japanese','Fish','Noodles',12],[4,'Italian','Beef','Stews',12]]){const recipe={providerId:'epic-'+String(i).repeat(24),name:'Meal '+i,ingredients:['Ingredient '+i],instructions:'Cook safely for twenty minutes. '+i,image:'/catalogue-images/'+String(i).repeat(64)+'.jpg',categories:[category],cuisines:[cuisine],styles:[style],ingredientCount:count};publishRecipe(db,recipe);}
 assert.equal(searchCatalogue(db,'',{cuisine:['Italian','Mexican']}).length,3);
 assert.equal(searchCatalogue(db,'',{cuisine:['Italian','Mexican'],category:['Chicken'],style:['Pasta dishes','Wraps & tacos'],effort:['5','6-10']}).length,2);
 assert.equal(searchCatalogue(db,'',{effort:['11+']}).length,2);assert.equal(searchCatalogue(db,'',{effort:['5','11+']}).length,3);
 const facets=catalogueFilters(db,{cuisine:['Italian','Mexican'],effort:['5','6-10']});assert.deepEqual(facets.categories,['Chicken']);assert.deepEqual(facets.efforts,{'5':1,'6-10':1,'11+':1});
});
test('four filters intersect before the result limit, for both local sources; facets and ideas have matches',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'simmer-filters-'));const db=openCatalogue(dir);t.after(async()=>{db.close();await rm(dir,{recursive:true,force:true});});
 for(let i=0;i<83;i++){const recipe={providerId:(i%2?'tasty-':'epic-')+i.toString(16).padStart(24,'0'),provider:i%2?'Tasty':'Epicurious',name:'Thai chicken curry '+i,recipeCuisine:['Thai'],ingredients:['500g chicken','1 tbsp curry paste',...(i<81?['salt','pepper','oil','water']:[])],instructions:'Cook the chicken thoroughly in the sauce for twenty minutes. '+i,image:'/catalogue-images/'+i.toString(16).padStart(64,'0')+'.jpg'};publishRecipe(db,{...recipe,...recipeTags(recipe)});}
 const matches=searchCatalogue(db,'chicken',{category:'Chicken',cuisine:'Thai',style:'Curries',effort:'5'});assert.equal(matches.length,2);assert.equal(searchCatalogue(db,'chicken',{category:'Fish',effort:'5'}).length,0);
 const filters=catalogueFilters(db,{category:'Chicken',cuisine:'Thai',effort:'5'},'chicken');assert.equal(filters.counts.styles.Curries,2);assert.equal(filters.effortCount,2);assert.deepEqual(catalogueIdeas(db),[]);
 const id=matches[0].providerId;removeCatalogueRecipe(db,id);assert.ok(removedRecipeIds(db).has(id));assert.equal(searchCatalogue(db,'chicken',{effort:'5'}).length,1);assert.equal(db.prepare('SELECT count(*) n FROM catalogue_search').get().n,82);assert.equal(publishRecipe(db,{providerId:id}),false);
 removeCatalogueRecipe(db,'12345');assert.ok(removedRecipeIds(db).has('12345'));
});
