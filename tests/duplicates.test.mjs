import test from 'node:test';
import assert from 'node:assert/strict';
import {duplicateGroups,titleKey} from '../lib/duplicates.js';
test('duplicate finder ignores filler words and separates same-name different recipes',()=>{
 assert.equal(titleKey('The Best Classic Mac & Cheese'),titleKey('Mac and Cheese'));
 assert.equal(titleKey('Grilled Salmon As Made By Chef Kiano'),titleKey('Grilled Salmon'));
 const groups=duplicateGroups([
  {providerId:'a',name:'Our Favorite Banana Bread',ingredients:['3 bananas','2 cups flour','1 cup sugar','2 eggs']},
  {providerId:'b',name:'Banana Bread',ingredients:['4 ripe bananas','250g flour','150g sugar','2 eggs','1 tsp baking soda']},
  {providerId:'c',name:'Fish Curry',ingredients:['500g cod','curry paste']},
  {providerId:'d',name:'Easy Fish Curry',ingredients:['1 tin coconut milk','prawns','lime']}]);
 assert.deepEqual(groups.map(g=>[g.recipes.map(r=>r.providerId).join(','),g.likely]),[['a,b',true],['c,d',false]]);
});
