import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {importMealDb,localMeal} from '../scripts/import-mealdb.mjs';
import {openCatalogue,getCatalogueRecipe,localImageExists,searchCataloguePage} from '../lib/catalogue.js';

const meal={idMeal:'52772',strMeal:'Tomato sauce',strCategory:'Miscellaneous',strArea:'Italian',strInstructions:'Simmer for 10 minutes.',strMealThumb:'https://www.themealdb.com/images/media/meals/test.jpg',strIngredient1:'Tomatoes',strMeasure1:'500g'};

test('MealDB import saves local detail and photo, and is repeatable',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'simmer-mealdb-'));
 const fetchImpl=async url=>String(url).includes('search.php')?new Response(JSON.stringify({meals:[meal]}),{headers:{'content-type':'application/json'}}):new Response(Buffer.from([255,216,255,217]),{headers:{'content-type':'image/jpeg'}});
 try{
  const first=await importMealDb(dir,{fetchImpl,initials:'a'});assert.equal(first.added,1);
  const second=await importMealDb(dir,{fetchImpl,initials:'a'});assert.equal(second.added,0);
  const db=openCatalogue(dir);try{
   const recipe=getCatalogueRecipe(db,meal.idMeal);assert.equal(recipe.provider,'TheMealDB');assert.deepEqual(recipe.cuisines,['Italian']);assert.ok(recipe.styles.includes('Sauces & dips'));assert.ok(localImageExists(dir,recipe.image));
   assert.equal(searchCataloguePage(db,'').recipes.length,0);assert.equal(searchCataloguePage(db,'',{style:'Sauces & dips'}).recipes.length,1);
  }finally{db.close();}
 }finally{await rm(dir,{recursive:true,force:true});}
});
