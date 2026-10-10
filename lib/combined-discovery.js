import {recipeTags} from './catalogue.js';
import {effortMatches,mainIngredients,filterValues,tagMatches} from './recipe-filters.js';

// Alternate sources so a large local collection cannot bury live MealDB matches.
export function combineDiscovery(local,remote,{category='',style='',effort=''}={}){
  const online=remote.map(r=>({...r,provider:'TheMealDB',style:recipeTags({...r,ingredients:[]}).styles.join(' · ')})).filter(r=>tagMatches(r.style.split(' · '),style)&&effortMatches(r,effort)&&(!filterValues(category).length||filterValues(category).some(value=>value!=='Seafood'&&r.category?.split(' · ').includes(value)||mainIngredients(r).includes(value))));
  const seen=new Set(),results=[];
  for(let i=0;i<Math.max(local.length,online.length)&&results.length<80;i++)for(const r of [online[i],local[i]]){
    if(!r||!r.image||results.length>=80)continue;
    const name=r.name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
    if(seen.has(name))continue;seen.add(name);results.push(r);
  }
  return results;
}
