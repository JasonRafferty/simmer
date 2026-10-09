import test from 'node:test';
import assert from 'node:assert/strict';
import {combineDiscovery} from '../lib/combined-discovery.js';
const dish=(name,providerId)=>({name,providerId,image:'https://example.com/photo.jpg'});
test('combined discovery exposes both sources and removes equivalent titles',()=>{
 const result=combineDiscovery([dish('Chicken curry','epic-a'),dish('Pasta','epic-b')],[dish('CHICKEN CURRY!','1'),dish('Soup','2')]);
 assert.deepEqual(result.map(r=>r.providerId),['1','2','epic-b']);
 assert.equal(result[0].provider,'TheMealDB');
});
test('food style filters also apply to MealDB and missing photos are excluded',()=>{
 assert.deepEqual(combineDiscovery([],[dish('Chicken curry','1'),dish('Salad','2'),{name:'Curry',providerId:'3'}],{style:'Curries'}).map(r=>r.providerId),['1']);
 assert.equal(combineDiscovery(Array.from({length:100},(_,i)=>dish('Dish '+i,'epic-'+i)),[]).length,80);
});
