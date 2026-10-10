import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {surpriseFilters} from '../lib/catalogue.js';
test('surprise chooses a valid filter combination without effort or unknown tags',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec('CREATE TABLE catalogue(data TEXT)');for(const r of [{name:'A',categories:['Chicken'],cuisines:['Thai'],styles:['Curries'],ingredientCount:15},{name:'B',categories:['Chicken'],cuisines:['Mexican'],styles:['Wraps & tacos'],ingredientCount:3}])db.prepare('INSERT INTO catalogue VALUES(?)').run(JSON.stringify(r));
 for(let i=0;i<20;i++){const filters=surpriseFilters(db);assert.deepEqual(Object.keys(filters),['category','cuisine','style']);assert.equal(filters.category,'Chicken');assert.ok(filters.cuisine==='Thai'?filters.style==='Curries':filters.cuisine==='Mexican'&&filters.style==='Wraps & tacos');}
 db.exec('DELETE FROM catalogue');db.prepare('INSERT INTO catalogue VALUES(?)').run(JSON.stringify({categories:['Chicken'],cuisines:['Not specified'],styles:['Other dishes']}));assert.equal(surpriseFilters(db),null);
 }finally{db.close();}
});
