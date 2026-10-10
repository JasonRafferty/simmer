import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyUnknown} from '../lib/classify-unknown.js';
const recipe={name:'Rigatoni with tomato sauce',ingredients:['250g rigatoni','tomatoes'],instructions:'Boil pasta. Stir in sauce.',cuisines:['Not specified'],styles:['Other dishes'],categories:['Vegetables'],image:'/photo.jpg'};
test('unknown facets are filled independently without modifying known tags or content',()=>{
 const updated=classifyUnknown(recipe);assert.ok(updated.styles.includes('Pasta dishes'));assert.deepEqual(updated.cuisines,['Not specified']);
 for(const key of ['name','ingredients','instructions','categories','image'])assert.deepEqual(updated[key],recipe[key]);
 const known={...recipe,cuisines:['British'],styles:['Salads']};assert.deepEqual(classifyUnknown(known),known);
 const cuisineOnly=classifyUnknown({...recipe,name:'Paneer',styles:['Stews']});assert.deepEqual(cuisineOnly.cuisines,['South Asian']);assert.deepEqual(cuisineOnly.styles,['Stews']);
 const styleOnly=classifyUnknown({...recipe,cuisines:['French']});assert.deepEqual(styleOnly.cuisines,['French']);assert.ok(styleOnly.styles.includes('Pasta dishes'));
 assert.deepEqual(classifyUnknown(updated),updated);
});
test('ambiguous recipes stay unknown and distinctive dish names fill missing tags',()=>{
 const ambiguous={...recipe,name:'Chicken with lemon',ingredients:['chicken','lemon']};assert.deepEqual(classifyUnknown(ambiguous),ambiguous);
 for(const [name,style]of [['Peach Crumble','Desserts & baking'],['Braised Beef','Stews'],['Lemon Refresher','Drinks'],['Sweet Corn Frittata','Egg dishes'],['Enfrijoladas','Other dishes']])assert.ok(classifyUnknown({...recipe,name,ingredients:[]}).styles.includes(style));
 assert.deepEqual(classifyUnknown({...recipe,name:'Enfrijoladas'}).cuisines,['Mexican']);
});
