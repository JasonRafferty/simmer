import {lookup} from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import {publicIPv4} from './import.js';

export function imageExtension(bytes){
  if(bytes.length<16)return null;
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'webp';return null;
}
export async function fetchPhoto(input,redirects=0){
  const url=new URL(input);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!['','80','443'].includes(url.port))throw Error('Invalid photo URL.');
  const addresses=await lookup(url.hostname,{all:true,family:4});if(!addresses.length||addresses.some(a=>!publicIPv4(a.address)))throw Error('Private photo URLs are not allowed.');
  return new Promise((resolve,reject)=>{
    const req=(url.protocol==='https:'?https:http).get(url,{headers:{'User-Agent':'Simmer/1.0 recipe importer',Accept:'image/jpeg,image/png,image/webp'},lookup:(hostname,options,callback)=>options.all?callback(null,[{address:addresses[0].address,family:4}]):callback(null,addresses[0].address,4)},res=>{
      if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();if(redirects>=3)return reject(Error('Too many photo redirects.'));fetchPhoto(new URL(res.headers.location,url),redirects+1).then(resolve,reject);return;}
      if(res.statusCode!==200){res.resume();return reject(Error('Photo unavailable.'));}
      const parts=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>6000000)req.destroy(Error('Photo too large.'));else parts.push(chunk);});res.on('error',reject);res.on('end',()=>{const bytes=Buffer.concat(parts),extension=imageExtension(bytes);if(!extension)return reject(Error('Not a JPEG, PNG or WebP photo.'));resolve({bytes,extension});});
    });const deadline=setTimeout(()=>req.destroy(Error('Photo timed out.')),15000);req.on('close',()=>clearTimeout(deadline));req.on('error',reject);
  });
}
