const clean=s=>String(s??'').trim();
const values=value=>[...new Set([].concat(value??[]).map(clean).filter(Boolean))];
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
export async function searchRecipes(query,filters={}){
  const q=clean(query).slice(0,80),categories=values(filters.category),cuisines=values(filters.cuisine);
  if(q.length<2&&!categories.length&&!cuisines.length)throw Error('Enter at least two letters or choose a filter.');
  const searches=q.length>=2?await Promise.all([request('search',{s:q}),request('filter',{i:q.replace(/\s+/g,'_')}),request('filter',{c:q})]):[];
  const [categoryResults,cuisineResults]=await Promise.all([Promise.all(categories.map(c=>request('filter',{c}))),Promise.all(cuisines.map(a=>request('filter',{a})))]);
  const restrictions=[...(categories.length?[{meals:categoryResults.flatMap(r=>r.meals??[])}]:[]),...(cuisines.length?[{meals:cuisineResults.flatMap(r=>r.meals??[])}]:[])];
  const unique=new Map();for(const m of searches.flatMap(r=>r.meals??[]))if(!unique.has(m.idMeal))unique.set(m.idMeal,m);
  if(!q)for(const m of restrictions[0]?.meals??[])unique.set(m.idMeal,m);
  const allowed=restrictions.map(r=>new Set((r.meals??[]).map(m=>m.idMeal)));
  return [...unique.values()].filter(m=>allowed.every(ids=>ids.has(m.idMeal))).slice(0,80).map(m=>({providerId:String(m.idMeal),name:clean(m.strMeal),image:clean(m.strMealThumb),category:clean(m.strCategory)||categories.filter((_,i)=>categoryResults[i].meals?.some(x=>x.idMeal===m.idMeal)).join(' · '),cuisine:clean(m.strArea)||cuisines.filter((_,i)=>cuisineResults[i].meals?.some(x=>x.idMeal===m.idMeal)).join(' · ')}));
}
export async function discoveryFilters(){
  const populated=async (values,key)=>{const results=await Promise.all(values.map(async value=>{const data=await request('filter',{[key]:value});return data.meals?.length?value:null;}));return results.filter(Boolean);};
  const [categories,cuisines]=await Promise.all([
    populated(['Chicken','Beef','Pork','Seafood','Pasta','Vegetarian','Vegan','Dessert'],'c'),
    populated(['British','Italian','Indian','Chinese','Mexican','Thai','Japanese','Greek','French','Spanish'],'a')
  ]);return {categories,cuisines};
}
export async function getRecipe(id){if(!/^\d{1,12}$/.test(id))throw Error('Invalid recipe.');const data=await request('lookup',{i:id});if(!data.meals?.[0])throw Error('This recipe is no longer available.');return mealRecipe(data.meals[0]);}
