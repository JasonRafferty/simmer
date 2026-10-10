import test from 'node:test';
import assert from 'node:assert/strict';
import {inferAdditionalCuisines} from '../lib/cuisine-inference.js';
import {classifyUnknown} from '../lib/classify-unknown.js';
test('additional cuisines recognise dishes and require combined ingredient evidence',()=>{
 for(const [name,cuisine]of [['Arroz Caldo','Filipino'],['Pol Sambol','Sri Lankan'],['Burst Cherry Tomato Pasta','Italian'],['Gumbo','Cajun'],['Gratin Dauphinoise','French'],['Chicken Jalfrezi','South Asian']]){
  const ingredients=name.includes('Pasta')?['spaghetti','tomatoes','basil']:[];assert.ok(inferAdditionalCuisines({name,ingredients}).includes(cuisine),name);
 }
 assert.deepEqual(inferAdditionalCuisines({name:'Chicken and rice',ingredients:['chicken','rice','garlic','soy sauce']}),[]);
 assert.deepEqual(inferAdditionalCuisines({name:'Chicken and rice with salsa verde',ingredients:['parsley','capers','olive oil']}),[]);
 assert.deepEqual(inferAdditionalCuisines({name:'Noodle bowl',ingredients:['soy sauce','ginger','sesame oil','scallions']}),['East Asian']);
 assert.deepEqual(inferAdditionalCuisines({name:'A dinner',recipeCuisine:['Sri Lankan'],ingredients:[]}),['Sri Lankan']);
});
test('expanded inference still preserves existing cuisine classifications',()=>{
 const r={name:'Pizza',ingredients:['flour'],styles:['Pizza'],cuisines:['American']};assert.deepEqual(classifyUnknown(r),r);
 assert.deepEqual(classifyUnknown({...r,cuisines:['Not specified']}).cuisines,['Italian']);
});
