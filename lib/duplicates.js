import {parse} from './ingredients.js';

// Titles are compared after dropping marketing words, so "The Best Classic Mac and Cheese" matches "Mac & Cheese".
const filler=new Set('a an and the with of in on for our my your classic best ever easy easiest simple simplest perfect perfectly ultimate quick homemade recipe favorite favourite famous delicious tasty really very you ll eat ll s made by'.split(' '));
const stem=w=>w.length>4&&w.endsWith('ies')?w.slice(0,-3)+'y':w.length>3&&w.endsWith('s')&&!w.endsWith('ss')?w.slice(0,-1):w;
const words=s=>String(s??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/&/g,' and ').match(/[\p{L}\p{N}]+/gu)??[];
export function titleKey(name){
 const cleaned=String(name).replace(/\bas made by\b.*$/i,'').replace(/\bby (chef )?[A-Z][\w’']+( [A-Z][\w’']+)*$/,'').replace(/\(.*?\)/g,' ');
 return [...new Set(words(cleaned).filter(w=>!filler.has(w)).map(stem))].sort().join(' ');
}
const ingredientSet=recipe=>new Set((recipe.ingredients??[]).map(line=>words(String(parse(line).name).replace(/\(.*?\)/g,' ').split(',')[0]).map(stem).slice(-2).join(' ')).filter(Boolean));
const similarity=(a,b)=>{const union=new Set([...a,...b]);let shared=0;for(const x of a)if(b.has(x))shared++;return union.size?shared/union.size:0;};

export function duplicateGroups(recipes,{threshold=0.5}={}){
 const byKey=new Map();
 for(const r of recipes){const key=titleKey(r.name);if(!key)continue;const list=byKey.get(key);if(list)list.push(r);else byKey.set(key,[r]);}
 const groups=[];
 for(const [key,list]of byKey){
  if(list.length<2)continue;const sets=list.map(ingredientSet);let best=0;
  for(let i=0;i<sets.length;i++)for(let j=i+1;j<sets.length;j++)best=Math.max(best,similarity(sets[i],sets[j]));
  groups.push({key,likely:best>=threshold,similarity:best,recipes:list.map(r=>({providerId:r.providerId,provider:r.provider,name:r.name}))});
 }
 return groups.sort((a,b)=>b.similarity-a.similarity||a.key.localeCompare(b.key));
}
