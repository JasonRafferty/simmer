import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readdir,rm,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
test('backup pruning reports first, keeps the newest backups and never touches live data',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'simmer-prune-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 for(const name of ['catalogue.db','simmer.db','catalogue.db-wal'])await writeFile(join(dir,name),'live');
 await mkdir(join(dir,'catalogue-images'));await mkdir(join(dir,'imports'));
 for(let i=1;i<=4;i++){const file=join(dir,`catalogue-before-test-${i}.db`);await writeFile(file,'x');await utimes(file,i*1000,i*1000);}
 const script=new URL('../scripts/prune-backups.mjs',import.meta.url).pathname;
 const report=execFileSync(process.execPath,[script,dir]).toString();assert.match(report,/2 item\(s\)/);assert.equal((await readdir(dir)).length,9);
 execFileSync(process.execPath,[script,dir,'--delete']);
 assert.deepEqual((await readdir(dir)).sort(),['catalogue-before-test-3.db','catalogue-before-test-4.db','catalogue-images','catalogue.db','catalogue.db-wal','imports','simmer.db']);
});
