import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {surpriseRecipe} from '../lib/catalogue.js';
test('surprise respects multiple cuisine choices and dish filters but ignores effort',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec('CREATE TABLE catalogue(data TEXT)');for(const r of [{name:'A',categories:['Chicken'],cuisines:['Thai'],styles:['Curries'],ingredientCount:15},{name:'B',categories:['Chicken'],cuisines:['Mexican'],styles:['Wraps & tacos'],ingredientCount:3}])db.prepare('INSERT INTO catalogue VALUES(?)').run(JSON.stringify(r));
 assert.equal(surpriseRecipe(db,{category:['Chicken'],cuisine:['Thai','Italian'],style:['Curries'],effort:['5']}).name,'A');assert.equal(surpriseRecipe(db,{cuisine:['French']}),null);
 }finally{db.close();}
});
