import {parse} from './ingredients.js';
import {filterValues,tagMatches,effortMatches} from './recipe-filters.js';

// One in-memory view of the catalogue, so search, facets, surprise and pantry matching
// never re-parse every recipe per request. Rebuilt only when the database changes.
export const placeholders=new Set(['Everyday / international','Not specified','Other dishes','Other ingredients']);
export const mealStyles=new Set(['Meat & fish mains','Curries','Stews','Pasta dishes','Noodles','Rice dishes','Stir-fries','Soups','Salads','Grilled & BBQ','Roasts & baked dishes','Traybakes','Pies & pastry','Pizza','Wraps & tacos','Sandwiches & burgers','Egg dishes']);
export const timeRanges={'30':'Under 30 min','30-60':'30–60 min','60+':'Over 1 hour'};
const normalise=s=>String(s??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
const tokens=s=>normalise(s).match(/[\p{L}\p{N}]+/gu)??[];
export const stem=w=>w.length>4&&w.endsWith('ies')?w.slice(0,-3)+'y':w.length>4&&w.endsWith('oes')?w.slice(0,-2):w.length>3&&w.endsWith('s')&&!w.endsWith('ss')?w.slice(0,-1):w;
const numbers={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,eight:8,ten:10,fifteen:15,twenty:20,thirty:30,forty:40,few:3,several:5};

// Explicit durations in the method plus a prep allowance that grows with the ingredient list.
export function estimateMinutes(recipe){
 const given=(Number(recipe.prep)||0)+(Number(recipe.cook)||0);if(given)return given;
 const text=normalise(recipe.instructions);let cooking=0;
 for(const m of text.matchAll(/\b(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|eight|ten|fifteen|twenty|thirty|forty|few|several)(?:\s*(?:-|–|to|or)\s*(\d+(?:\.\d+)?))?\s*(?:more\s+)?(hours?|hrs?|minutes?|mins?)\b/g)){
  const value=Number(m[2]??(numbers[m[1]]??m[1]));if(!Number.isFinite(value))continue;cooking+=/^h/.test(m[3])?value*60:value;
 }
 if(/\bovernight\b/.test(text))cooking+=480;
 const count=recipe.ingredientCount??recipe.ingredients?.length??0;
 return Math.round(Math.min(cooking,2880)+Math.min(30,4+count*1.5));
}
export const timeMatches=(minutes,selection)=>!filterValues(selection).length||filterValues(selection).some(v=>v==='30'&&minutes<30||v==='30-60'&&minutes>=30&&minutes<=60||v==='60+'&&minutes>60);

export function buildIndex(rows,{hidden=new Set(),hasImage=()=>true}={}){
 const recipes=[],vocab={title:new Map(),tag:new Map(),ingredient:new Map()};
 const post=(field,word,i)=>{const w=stem(word);let set=vocab[field].get(w);if(!set)vocab[field].set(w,set=new Set());set.add(i);};
 for(const row of rows){
  const r=JSON.parse(row.data),id=r.providerId??row.id;if(hidden.has(id)||!hasImage(r.image))continue;
  const i=recipes.length,tags=[...(r.categories??[]),...(r.cuisines??[]),...(r.styles??[])].filter(t=>!placeholders.has(t));
  recipes.push({id,name:r.name,provider:r.provider,image:r.image,categories:r.categories??[],cuisines:r.cuisines??[],styles:r.styles??[],ingredientCount:r.ingredientCount??r.ingredients?.length,minutes:estimateMinutes(r),ingredients:r.ingredients??[]});
  for(const w of tokens(r.name))post('title',w,i);for(const w of tokens(tags.join(' ')))post('tag',w,i);for(const w of tokens((r.ingredients??[]).join(' ')))post('ingredient',w,i);
 }
 return {recipes,vocab};
}

const passes=(r,f,skip)=>(skip==='category'||tagMatches(r.categories,f.category))&&(skip==='cuisine'||tagMatches(r.cuisines,f.cuisine))&&(skip==='style'||tagMatches(r.styles,f.style))&&(skip==='effort'||effortMatches(r,f.effort))&&(skip==='time'||timeMatches(r.minutes,f.time));
// Prefix match on stemmed words, so "curr" and "curries" both find "curry".
function wordMatches(index,word){
 const w=stem(word),hits={};
 for(const field of ['title','tag','ingredient']){const set=new Set();for(const [token,ids]of index.vocab[field])if(token.startsWith(w))for(const i of ids)set.add(i);hits[field]=set;}
 return hits;
}
const weights={title:3,tag:2,ingredient:1};
function scoreWords(index,words){
 const perWord=words.map(w=>wordMatches(index,w)),scores=new Map(),matched=new Map();
 perWord.forEach(hits=>{const seen=new Set();for(const field of ['title','tag','ingredient'])for(const i of hits[field]){scores.set(i,(scores.get(i)??0)+weights[field]);if(!seen.has(i)){seen.add(i);matched.set(i,(matched.get(i)??0)+1);}}});
 return {scores,matched,empty:perWord.map(h=>!h.title.size&&!h.tag.size&&!h.ingredient.size)};
}
const distance=(a,b)=>{if(Math.abs(a.length-b.length)>2)return 9;let prev=Array.from({length:b.length+1},(_,j)=>j);for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(prev[j]+1,row[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=row;}return prev[b.length];};
// Closest common title or tag word for a misspelling, e.g. "shakshouka" → "shakshuka".
export function suggestWord(index,word){
 const w=normalise(word);if(w.length<4)return null;let best=null;
 for(const field of ['title','tag'])for(const [token,ids]of index.vocab[field]){if(token.length<3)continue;const d=distance(w,token);if(d<=(w.length>=7?2:1)&&(!best||d<best.d||d===best.d&&ids.size>best.n))best={token,d,n:ids.size};}
 return best?.token??null;
}
const hash=(seed,id)=>{let h=2166136261;for(const c of seed+'|'+id){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};

export function searchIndex(index,query,filters={},{offset=0,limit=48,seed=String(Math.random())}={}){
 let words=tokens(query).slice(0,12),corrected=null,relaxed=false;
 const candidates=index.recipes.map((r,i)=>i).filter(i=>passes(index.recipes[i],filters));
 let ordered;
 if(!words.length){
  const browse=!['category','cuisine','style','effort','time'].some(k=>filterValues(filters[k]).length);
  ordered=candidates.filter(i=>!browse||!index.recipes[i].styles.some(s=>s==='Desserts & baking'||s==='Drinks')).sort((a,b)=>hash(seed,index.recipes[a].id)-hash(seed,index.recipes[b].id));
 }else{
  const rank=list=>{const {scores,matched,empty}=scoreWords(index,list);return {empty,results:candidates.filter(i=>matched.get(i)===list.length).sort((a,b)=>scores.get(b)-scores.get(a)||index.recipes[a].name.length-index.recipes[b].name.length),scores,matched};};
  let attempt=rank(words);
  if(!attempt.results.length&&attempt.empty.some(Boolean)){
   const fixed=words.map((w,n)=>attempt.empty[n]?suggestWord(index,w)??w:w);
   if(fixed.join(' ')!==words.join(' ')){const retry=rank(fixed);if(retry.results.length){attempt=retry;corrected=fixed.join(' ');}}
  }
  if(!attempt.results.length&&words.length>1){
   relaxed=true;const {scores,matched}=attempt;
   attempt.results=candidates.filter(i=>matched.get(i)).sort((a,b)=>matched.get(b)-matched.get(a)||scores.get(b)-scores.get(a));
  }
  ordered=attempt.results;
 }
 const page=ordered.slice(offset,offset+limit).map(i=>card(index.recipes[i]));
 return {recipes:page,total:ordered.length,nextOffset:offset+page.length<ordered.length?offset+page.length:null,corrected,relaxed:relaxed&&ordered.length>0};
}
export const card=r=>({providerId:r.id,provider:r.provider,name:r.name,image:r.image,category:r.categories.join(' · '),cuisine:r.cuisines.join(' · '),style:r.styles.join(' · '),ingredientCount:r.ingredientCount,minutes:r.minutes});

export function indexFacets(index,filters={},query=''){
 const words=tokens(query).slice(0,12),{matched}=words.length?scoreWords(index,words):{};
 const counts={categories:{},cuisines:{},styles:{}},efforts={'5':0,'6-10':0,'11+':0},times={'30':0,'30-60':0,'60+':0},totals={};
 index.recipes.forEach((r,i)=>{
  for(const c of r.cuisines)totals[c]=(totals[c]??0)+1;
  if(words.length&&matched.get(i)!==words.length)return;
  for(const [field,key]of [['categories','category'],['cuisines','cuisine'],['styles','style']])if(passes(r,filters,key))for(const value of r[field])counts[field][value]=(counts[field][value]??0)+1;
  if(passes(r,filters,'effort'))for(const range of Object.keys(efforts))if(effortMatches(r,range))efforts[range]++;
  if(passes(r,filters,'time'))for(const range of Object.keys(times))if(timeMatches(r.minutes,range))times[range]++;
 });
 const popularCuisines=Object.entries(totals).filter(([c])=>!placeholders.has(c)).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([c])=>c);
 return {categories:Object.keys(counts.categories).sort(),cuisines:Object.keys(counts.cuisines).sort(),styles:Object.keys(counts.styles).sort(),counts,effortCount:efforts['5'],efforts,times,popularCuisines};
}

// Weighted random pick of an ingredient × cuisine × dish type with enough recipes to browse.
export function surpriseIndex(index,filters={},{avoid=[],minimum=6,random=Math.random}={}){
 const combos=new Map(),styleChoice=filterValues(filters.style);
 for(const r of index.recipes){
  if(!passes(r,filters))continue;
  for(const category of r.categories)for(const cuisine of r.cuisines)for(const style of r.styles){
   if(placeholders.has(category)||placeholders.has(cuisine)||placeholders.has(style))continue;
   if(!filterValues(filters.category).length||filterValues(filters.category).includes(category))if(!filterValues(filters.cuisine).length||filterValues(filters.cuisine).includes(cuisine))if(styleChoice.length?styleChoice.includes(style):mealStyles.has(style)){
    const key=category+'|'+cuisine+'|'+style,combo=combos.get(key);if(combo)combo.count++;else combos.set(key,{category,cuisine,style,count:1});
   }
  }
 }
 let pool=[...combos.values()].filter(c=>c.count>=minimum);if(!pool.length)pool=[...combos.values()];
 const recent=new Set(avoid);const fresh=pool.filter(c=>!recent.has(c.cuisine)&&!recent.has(c.category));if(fresh.length)pool=fresh;
 if(!pool.length)return null;
 const weight=c=>Math.sqrt(Math.min(c.count,60));let roll=random()*pool.reduce((s,c)=>s+weight(c),0);
 for(const c of pool){roll-=weight(c);if(roll<=0)return {filters:{category:c.category,cuisine:c.cuisine,style:c.style},count:c.count};}
 const last=pool.at(-1);return {filters:{category:last.category,cuisine:last.cuisine,style:last.style},count:last.count};
}

// Descriptive words are dropped, then an ingredient is a staple only if every remaining word is a staple word,
// so "kosher salt" is a staple but "red bell pepper" and "peanut butter" are not.
const descriptors=new Set('fresh freshly ground large small medium chopped minced diced sliced finely thinly kosher coarse sea fine extra virgin unsalted salted granulated to taste and or plus more for clove cloves cold warm hot divided optional serving packed pure light'.split(' '));
const stapleWords=new Set('salt pepper black white brown oil olive vegetable canola water sugar butter flour all purpose garlic onion baking soda powder ice cooking spray'.split(' '));
const ingredientWords=line=>tokens(String(parse(line).name).replace(/\([^)]*\)/g,' ').split(',')[0]).filter(w=>!descriptors.has(w)).map(stem).join(' ');
const isStaple=name=>name.split(' ').every(w=>stapleWords.has(w));
export function pantryIndex(index,have,{assumeStaples=true,limit=48,offset=0}={}){
 const wanted=[...new Set(have.map(h=>tokens(h).map(stem).join(' ')).filter(Boolean))];if(!wanted.length)return {recipes:[],total:0,nextOffset:null};
 index.pantry??=index.recipes.map(r=>r.ingredients.map(ingredientWords).filter(Boolean));
 const covered=(name,list)=>list.some(h=>(' '+name+' ').includes(' '+h+' ')||name===h);
 const scored=[];
 index.pantry.forEach((names,i)=>{
  if(!names.length)return;const uses=new Set();const missing=[];
  for(const name of names){const hit=wanted.find(h=>covered(name,[h]));if(hit)uses.add(hit);else if(!(assumeStaples&&isStaple(name)))missing.push(name);}
  if(uses.size)scored.push({i,uses:uses.size,missing});
 });
 scored.sort((a,b)=>(a.missing.length-a.uses*1.5)-(b.missing.length-b.uses*1.5)||a.missing.length-b.missing.length||index.recipes[a.i].ingredientCount-index.recipes[b.i].ingredientCount);
 const page=scored.slice(offset,offset+limit).map(s=>({...card(index.recipes[s.i]),missing:s.missing.slice(0,6),missingCount:s.missing.length,uses:s.uses}));
 return {recipes:page,total:scored.length,nextOffset:offset+page.length<scored.length?offset+page.length:null};
}
