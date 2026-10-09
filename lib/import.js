import {lookup} from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
const clean=s=>String(s??'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').trim();
export function publicIPv4(ip){const [a,b]=ip.split('.').map(Number);return /^\d+\.\d+\.\d+\.\d+$/.test(ip)&&![0,10,127,169,192,224,240,255].includes(a)&&!(a===172&&b>=16&&b<=31)&&!(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19))&&a<224;}
export async function fetchRecipePage(input,redirects=0){
  const url=new URL(input);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!['','80','443'].includes(url.port))throw Error('Use a public http or https recipe link.');
  const addresses=await lookup(url.hostname,{all:true,family:4});if(!addresses.length||addresses.some(a=>!publicIPv4(a.address)))throw Error('Private network recipe links are not allowed.');
  return new Promise((resolve,reject)=>{const request=(url.protocol==='https:'?https:http).get(url,{headers:{'User-Agent':'Simmer/1.0 recipe importer','Accept':'text/html'},lookup:(hostname,options,callback)=>options.all?callback(null,[{address:addresses[0].address,family:4}]):callback(null,addresses[0].address,4)},res=>{
    if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();if(redirects>=3)return reject(Error('Too many redirects.'));fetchRecipePage(new URL(res.headers.location,url),redirects+1).then(resolve,reject);return;}
    if(res.statusCode!==200){res.resume();return reject(Error('This website could not be imported. Add the recipe manually instead.'));}
    let size=0,body='';res.setEncoding('utf8');res.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>3000000)request.destroy(Error('Recipe page is too large.'));else body+=chunk;});res.on('end',()=>resolve(body));res.on('error',reject);
  });request.setTimeout(12000,()=>request.destroy(Error('Recipe website timed out.')));request.on('error',reject);});
}
export function extractRecipe(html,source){
  let found;
  function walk(node){if(!node||typeof node!=='object'||found)return;if([].concat(node['@type']??[]).some(t=>String(t).split('/').pop()==='Recipe')){found=node;return;}for(const value of Object.values(node))if(typeof value==='object')Array.isArray(value)?value.forEach(walk):walk(value);}
  for(const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{walk(JSON.parse(match[1]));}catch{}}
  if(!found)throw Error('No structured recipe found. You can still add this recipe manually.');
  const steps=node=>Array.isArray(node)?node.flatMap(steps):typeof node==='string'?[clean(node)]:node?.itemListElement?steps(node.itemListElement):node?.text?[clean(node.text)]:[];
  const minutes=s=>{const m=String(s??'').match(/PT(?:(\d+)H)?(?:(\d+)M)?/);return m?Number(m[1]??0)*60+Number(m[2]??0):0;};
  let image=Array.isArray(found.image)?found.image[0]:found.image;image=typeof image==='object'?image?.url:image;
  let imageURL='';try{const u=new URL(image,source);if(['http:','https:'].includes(u.protocol)&&image)imageURL=u.href;}catch{}
  return {name:clean(found.name),servings:Math.max(1,Number(String(found.recipeYield??'2').match(/\d+/)?.[0]??2)),ingredients:[].concat(found.recipeIngredient??[]).map(clean).filter(Boolean),instructions:steps(found.recipeInstructions).join('\n\n'),prep:minutes(found.prepTime),cook:minutes(found.cookTime),image:imageURL,source};
}
