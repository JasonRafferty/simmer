const clean=s=>String(s??'').trim();
export function mealRecipe(meal){
  if(!meal?.idMeal||!meal.strMeal)throw Error('Recipe details were not available.');
  const ingredients=[];for(let i=1;i<=20;i++){const name=clean(meal['strIngredient'+i]);if(name)ingredients.push([clean(meal['strMeasure'+i]),name].filter(Boolean).join(' '));}
  return {providerId:String(meal.idMeal),name:clean(meal.strMeal),image:clean(meal.strMealThumb),source:clean(meal.strSource)||`https://www.themealdb.com/meal.php?c=${encodeURIComponent(meal.idMeal)}`,provider:'TheMealDB',providerURL:'https://www.themealdb.com',servings:2,yieldUnverified:true,prep:0,cook:0,ingredients,instructions:clean(meal.strInstructions).replace(/\r\n/g,'\n'),category:clean(meal.strCategory),cuisine:clean(meal.strArea)};
}
const cache=new Map();
async function request(endpoint,params){
  const url=new URL(`https://www.themealdb.com/api/json/v1/${encodeURIComponent(process.env.MEALDB_API_KEY||'1')}/${endpoint}.php`);for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  const cached=cache.get(url.href);if(cached&&Date.now()-cached.at<300000)return cached.data;
  let response;try{response=await fetch(url,{signal:AbortSignal.timeout(10000)});}catch{throw Error('Recipe search is unavailable. Please try again shortly.');}
  if(!response.ok)throw Error('Recipe search is unavailable. Please try again shortly.');
  const data=await response.json();if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(url.href,{at:Date.now(),data});return data;
}
export async function searchRecipes(query){
  const q=clean(query).slice(0,80);if(q.length<2)throw Error('Enter at least two letters.');
  const named=await request('search',{s:q});let meals=named.meals??[];
  if(!meals.length){const filtered=await request('filter',{i:q.replace(/\s+/g,'_')});meals=filtered.meals??[];}
  if(!meals.length){const category=await request('filter',{c:q});meals=category.meals??[];}
  return meals.slice(0,40).map(m=>({providerId:String(m.idMeal),name:clean(m.strMeal),image:clean(m.strMealThumb),category:clean(m.strCategory),cuisine:clean(m.strArea)}));
}
export async function getRecipe(id){if(!/^\d{1,12}$/.test(id))throw Error('Invalid recipe.');const data=await request('lookup',{i:id});if(!data.meals?.[0])throw Error('This recipe is no longer available.');return mealRecipe(data.meals[0]);}
