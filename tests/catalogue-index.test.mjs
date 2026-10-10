import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIndex,searchIndex,indexFacets,surpriseIndex,pantryIndex,estimateMinutes,suggestWord} from '../lib/catalogue-index.js';

const recipe=(id,name,tags={},extra={})=>({id,data:JSON.stringify({providerId:id,name,image:'/x.jpg',categories:['Chicken'],cuisines:['Thai'],styles:['Curries'],ingredients:['500g chicken','1 tbsp oil'],instructions:'',...tags,...extra})});

test('cook time estimates add method durations to a prep allowance',()=>{
 assert.equal(estimateMinutes({prep:10,cook:20}),30);
 assert.equal(estimateMinutes({ingredients:['a','b'],instructions:'Simmer for 20 minutes. Bake 1 hour, then rest 5 to 10 minutes.'}),20+60+10+7);
 assert.ok(estimateMinutes({ingredients:[],instructions:'Marinate overnight.'})>480);
});

test('search matches stems, tags and typos, pages results and keeps a stable shuffle per seed',()=>{
 const rows=[recipe('a','Green Curry'),recipe('b','Chicken Noodles',{styles:['Noodles']}),recipe('c','Spaghetti Carbonara',{cuisines:['Italian'],styles:['Pasta dishes'],categories:['Pork']}),...Array.from({length:30},(_,i)=>recipe('s'+i,'Stew '+i,{styles:['Stews']}))];
 const index=buildIndex(rows,{hidden:new Set(['s29'])});
 assert.equal(index.recipes.length,32);
 assert.deepEqual(searchIndex(index,'curries').recipes.map(r=>r.name),['Green Curry']);
 assert.ok(searchIndex(index,'thai noodles').recipes.some(r=>r.name==='Chicken Noodles'));
 const typo=searchIndex(index,'spagetti');assert.equal(typo.corrected,'spaghetti');assert.equal(typo.recipes[0].name,'Spaghetti Carbonara');
 const relaxed=searchIndex(index,'carbonara zzzz');assert.equal(relaxed.relaxed,true);assert.equal(relaxed.recipes[0].name,'Spaghetti Carbonara');
 const first=searchIndex(index,'',{style:'Stews'},{limit:10,seed:'x'}),second=searchIndex(index,'',{style:'Stews'},{offset:10,limit:10,seed:'x'});
 assert.equal(first.total,29);assert.equal(first.nextOffset,10);assert.equal(new Set([...first.recipes,...second.recipes].map(r=>r.providerId)).size,20);
 assert.deepEqual(searchIndex(index,'',{style:'Stews'},{limit:10,seed:'x'}).recipes,first.recipes);
 assert.equal(searchIndex(index,'',{time:'30'}).total,32);assert.equal(first.recipes[0].ingredientCount,2);
 assert.equal(suggestWord(index,'carbonarra'),'carbonara');
});

test('facets report popular cuisines and time ranges',()=>{
 const index=buildIndex([recipe('a','A'),recipe('b','B'),recipe('c','C',{cuisines:['Everyday / international']}),recipe('d','D',{cuisines:['Italian']})]);
 const facets=indexFacets(index,{cuisine:'Thai'});
 assert.deepEqual(facets.popularCuisines,['Thai','Italian']);assert.equal(facets.counts.cuisines.Italian,1);assert.equal(facets.counts.categories.Chicken,2);assert.equal(facets.times['30'],2);
});

test('surprise prefers well-stocked meal combinations, avoids recent picks and respects filters',()=>{
 const rows=[...Array.from({length:8},(_,i)=>recipe('t'+i,'T'+i)),...Array.from({length:8},(_,i)=>recipe('m'+i,'M'+i,{cuisines:['Mexican'],styles:['Wraps & tacos']})),recipe('x','Rare',{cuisines:['Uzbek'],styles:['Rice dishes']}),...Array.from({length:8},(_,i)=>recipe('d'+i,'D'+i,{cuisines:['French'],styles:['Drinks']})),...Array.from({length:8},(_,i)=>recipe('e'+i,'E'+i,{cuisines:['Everyday / international'],styles:['Stews']}))];
 const index=buildIndex(rows);
 for(let i=0;i<30;i++){const pick=surpriseIndex(index);assert.ok(['Thai','Mexican'].includes(pick.filters.cuisine));assert.equal(pick.count,8);}
 for(let i=0;i<10;i++)assert.equal(surpriseIndex(index,{},{avoid:['Thai']}).filters.cuisine,'Mexican');
 assert.equal(surpriseIndex(index,{style:'Drinks'}).filters.cuisine,'French');
 assert.equal(surpriseIndex(index,{cuisine:'Uzbek'}).filters.style,'Rice dishes');
});

test('pantry ranking treats staples as available and lists what is missing',()=>{
 const index=buildIndex([recipe('a','Chicken Rice',{},{ingredients:['500g chicken thighs','200g rice','1 tsp kosher salt','Freshly ground black pepper']}),recipe('b','Chicken Peppers',{},{ingredients:['500g chicken','1 red bell pepper, sliced','2 tbsp (30 ml) fish sauce']}),recipe('c','Beef Stew',{},{ingredients:['1kg beef','2 carrots']})]);
 const result=pantryIndex(index,['chicken','rice']);
 assert.deepEqual(result.recipes.map(r=>r.name),['Chicken Rice','Chicken Peppers']);
 assert.equal(result.recipes[0].missingCount,0);assert.deepEqual(result.recipes[1].missing,['red bell pepper','fish sauce']);
 assert.equal(pantryIndex(index,[]).total,0);
});
