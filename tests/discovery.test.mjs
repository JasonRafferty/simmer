import test from 'node:test';
import assert from 'node:assert/strict';
import {mealRecipe,searchRecipes,getRecipe} from '../lib/discovery.js';
test('discovery retains source data and marks missing yield honestly',()=>{
  const r=mealRecipe({idMeal:'123',strMeal:'Chicken pasta',strIngredient1:'Pasta',strMeasure1:'200g',strIngredient2:'Chicken',strMeasure2:'',strIngredient3:' ',strInstructions:'Boil.\r\n\r\nServe.',strMealThumb:'https://example.com/pasta.jpg'});
  assert.equal(r.name,'Chicken pasta');assert.deepEqual(r.ingredients,['200g Pasta','Chicken']);assert.equal(r.yieldUnverified,true);assert.equal(r.servings,2);assert.equal(r.prep,0);assert.equal(r.source,'https://www.themealdb.com/meal.php?c=123');assert.equal(r.instructions,'Boil.\n\nServe.');
});
test('dish search, ingredient fallback, lookup and unavailable service',async()=>{
  const original=globalThis.fetch;const calls=[];
  globalThis.fetch=async url=>{calls.push(String(url));const u=new URL(url);const meals=u.pathname.includes('lookup')?[{idMeal:'999',strMeal:'Test recipe',strIngredient1:'Rice',strMeasure1:'200g'}]:u.pathname.includes('filter')?[{idMeal:'999',strMeal:'Test recipe'}]:null;return {ok:true,json:async()=>({meals})};};
  try{const r=await searchRecipes('test rice ingredient');assert.equal(r[0].providerId,'999');assert.ok(calls[1].includes('filter.php'));const detail=await getRecipe('999');assert.equal(detail.ingredients[0],'200g Rice');await assert.rejects(()=>getRecipe('invalid'));globalThis.fetch=async()=>{throw Error('Network error');};await assert.rejects(()=>searchRecipes('network outage unique'),/unavailable/);}finally{globalThis.fetch=original;}
});
