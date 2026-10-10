import {resolve,join} from 'node:path';
import {readdir,stat,rm} from 'node:fs/promises';

// Lists old backups and staging folders in the data directory. Nothing is deleted without --delete.
// The live databases, their WAL files and catalogue-images are never touched.
// Usage: node scripts/prune-backups.mjs data [--keep 2] [--include-staging] [--delete]
const args=process.argv.slice(2),directory=resolve(args.find(a=>!a.startsWith('--')&&!/^\d+$/.test(a))??'data');
const keep=Math.max(1,Number(args[args.indexOf('--keep')+1])||2),remove=args.includes('--delete'),staging=args.includes('--include-staging');
const protectedNames=new Set(['catalogue.db','catalogue.db-wal','catalogue.db-shm','simmer.db','simmer.db-wal','simmer.db-shm','catalogue-images','import-report.json']);
const kinds=[['catalogue backup',/^catalogue-before-.*\.db$/],['saved-data backup',/^simmer-before-.*\.db$/],['retired dataset',/^retired-/],['import staging',/^(archive-import\.|imports$)/]];
async function size(path){const info=await stat(path);if(!info.isDirectory())return info.size;let total=0;for(const entry of await readdir(path))total+=await size(join(path,entry));return total;}
const human=bytes=>bytes>1e9?(bytes/1e9).toFixed(2)+' GB':(bytes/1e6).toFixed(1)+' MB';

const found=[];
for(const name of await readdir(directory)){
 if(protectedNames.has(name))continue;const kind=kinds.find(([,pattern])=>pattern.test(name));if(!kind)continue;
 const path=join(directory,name),info=await stat(path);found.push({name,path,kind:kind[0],modified:info.mtimeMs,bytes:await size(path)});
}
const plan=[];
for(const [kind]of kinds){
 const items=found.filter(f=>f.kind===kind).sort((a,b)=>b.modified-a.modified);
 items.forEach((item,index)=>{const isBackup=kind.endsWith('backup');plan.push({...item,action:isBackup?index<keep?'keep':'remove':staging?'remove':'keep (add --include-staging to remove)'});});
}
for(const item of plan)console.log(`${item.action.startsWith('remove')?'REMOVE':'keep  '}  ${human(item.bytes).padStart(9)}  ${item.kind.padEnd(18)} ${item.name}`);
const removable=plan.filter(p=>p.action==='remove'),total=removable.reduce((s,p)=>s+p.bytes,0);
console.log(`\n${removable.length} item(s), ${human(total)} ${remove?'deleted':'would be freed'}. Keeping the newest ${keep} backup(s) of each kind.${remove?'':' Re-run with --delete to remove them.'}`);
if(remove)for(const item of removable)await rm(item.path,{recursive:true,force:true});
