import test from 'node:test';
import assert from 'node:assert/strict';
import {mealRecipe,searchRecipes,getRecipe,discoveryFilters} from '../lib/discovery.js';
test('filters browse without a query, intersect, and exclude empty cuisines',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async url=>{const u=new URL(url);const empty=u.searchParams.get('a')==='Thai';const ids=u.searchParams.has('a')?['802']:['801','802'];return {ok:true,json:async()=>({meals:empty?null:ids.map(id=>({idMeal:id,strMeal:'Dish '+id}))})};};
 try{const filters=await discoveryFilters();assert.ok(filters.cuisines.includes('Italian'));assert.ok(!filters.cuisines.includes('Thai'));assert.ok(filters.cuisines.length<=10);assert.ok(filters.categories.length<=8);const category=await searchRecipes('',{category:'Pasta'});assert.deepEqual(category.map(r=>r.providerId),['801','802']);const both=await searchRecipes('',{category:'Pasta',cuisine:'Italian'});assert.deepEqual(both.map(r=>r.providerId),['802']);}finally{globalThis.fetch=original;}
});
test('combines name, ingredient and category matches and intersects filters',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async url=>{const u=new URL(url);const ids=u.pathname.includes('search')?['201']:u.searchParams.has('i')?['202']:u.searchParams.get('c')==='UniqueCategory'?['201','202']:u.searchParams.has('a')?['202']:['203','201'];return {ok:true,json:async()=>({meals:ids.map(id=>({idMeal:id,strMeal:'Meal '+id}))})};};
  try{const all=await searchRecipes('unique combined query');assert.deepEqual(all.map(r=>r.providerId),['201','202','203']);const filtered=await searchRecipes('unique combined query',{category:'UniqueCategory',cuisine:'UniqueCuisine'});assert.deepEqual(filtered.map(r=>r.providerId),['202']);}finally{globalThis.fetch=original;}
});
test('discovery retains source data and marks missing yield honestly',()=>{
  const r=mealRecipe({idMeal:'123',strMeal:'Chicken pasta',strIngredient1:'Pasta',strMeasure1:'200g',strIngredient2:'Chicken',strMeasure2:'',strIngredient3:' ',strInstructions:'Boil.\r\n\r\nServe.',strMealThumb:'https://example.com/pasta.jpg'});
  assert.equal(r.name,'Chicken pasta');assert.deepEqual(r.ingredients,['200g Pasta','Chicken']);assert.equal(r.yieldUnverified,true);assert.equal(r.servings,2);assert.equal(r.prep,0);assert.equal(r.source,'https://www.themealdb.com/meal.php?c=123');assert.equal(r.instructions,'Boil.\n\nServe.');
});
test('dish search, ingredient fallback, lookup and unavailable service',async()=>{
  const original=globalThis.fetch;const calls=[];
  globalThis.fetch=async url=>{calls.push(String(url));const u=new URL(url);const meals=u.pathname.includes('lookup')?[{idMeal:'999',strMeal:'Test recipe',strIngredient1:'Rice',strMeasure1:'200g'}]:u.pathname.includes('filter')?[{idMeal:'999',strMeal:'Test recipe'}]:null;return {ok:true,json:async()=>({meals})};};
  try{const r=await searchRecipes('test rice ingredient');assert.equal(r[0].providerId,'999');assert.ok(calls[1].includes('filter.php'));const detail=await getRecipe('999');assert.equal(detail.ingredients[0],'200g Rice');await assert.rejects(()=>getRecipe('invalid'));globalThis.fetch=async()=>{throw Error('Network error');};await assert.rejects(()=>searchRecipes('network outage unique'),/unavailable/);}finally{globalThis.fetch=original;}
});
