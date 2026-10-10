import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {searchCatalogue} from '../lib/catalogue.js';
test('default browse shuffles savoury recipes and keeps desserts and drinks available through filters',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec('CREATE TABLE catalogue(id TEXT,data TEXT)');
  for(let i=0;i<100;i++){const style=i<80?'Stews':i<90?'Desserts & baking':'Drinks';const r={providerId:String(i),name:'Recipe '+i,styles:[style],categories:['Chicken'],cuisines:['British'],ingredientCount:5};db.prepare('INSERT INTO catalogue VALUES(?,?)').run(String(i),JSON.stringify(r));}
  const first=searchCatalogue(db,''),second=searchCatalogue(db,'');assert.equal(first.length,80);assert.ok(first.every(r=>r.style==='Stews'));assert.notDeepEqual(first.map(r=>r.providerId),second.map(r=>r.providerId));
  assert.equal(searchCatalogue(db,'',{style:'Desserts & baking'}).length,10);assert.equal(searchCatalogue(db,'',{style:'Drinks'}).length,10);
 }finally{db.close();}
});
