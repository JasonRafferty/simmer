import {resolve,join} from 'node:path';
import {openCatalogue} from '../lib/catalogue.js';
import {classifyUnknown} from '../lib/classify-unknown.js';

const directory=resolve(process.argv[2]??'data'),apply=process.argv.includes('--apply'),db=openCatalogue(directory);
try{
 const changes=[];let cuisines=0,styles=0;
 for(const row of db.prepare('SELECT id,data FROM catalogue').all()){
  const before=JSON.parse(row.data),after=classifyUnknown(before);
  if(JSON.stringify(before)===JSON.stringify(after))continue;
  cuisines+=JSON.stringify(before.cuisines)!==JSON.stringify(after.cuisines)?1:0;
  styles+=JSON.stringify(before.styles)!==JSON.stringify(after.styles)?1:0;
  changes.push({id:row.id,before,after});
 }
 let backup;
 if(apply&&changes.length){
  backup=join(directory,'catalogue-before-unknown-tags-'+Date.now()+'.db');db.prepare('VACUUM INTO ?').run(backup);
  db.exec('BEGIN IMMEDIATE');try{const update=db.prepare('UPDATE catalogue SET data=? WHERE id=? AND data=?');for(const row of changes){if(update.run(JSON.stringify(row.after),row.id,JSON.stringify(row.before)).changes!==1)throw Error('Catalogue changed during classification; retry.');}db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
 }
 console.log(JSON.stringify({applied:apply,recipes:changes.length,cuisines,styles,backup,samples:changes.slice(0,12).map(({before,after})=>({name:after.name,before:{cuisines:before.cuisines,styles:before.styles},after:{cuisines:after.cuisines,styles:after.styles}}))},null,2));
}finally{db.close();}
