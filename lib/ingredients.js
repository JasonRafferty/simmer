const units = {g:['g',1],kg:['g',1000],ml:['ml',1],l:['ml',1000],tsp:['tsp',1],tbsp:['tsp',3],cup:['cup',1],cups:['cup',1],clove:['cloves',1],cloves:['cloves',1],tin:['tins',1],tins:['tins',1],can:['tins',1],cans:['tins',1]};
export const key = s => String(s).toLowerCase().replace(/washing[- ]up/g,'washing up').replace(/[^a-z0-9]+/g,' ').trim();
export const format = n => String(Math.round(n * 100) / 100);
export function parse(line) {
  const fractions={'½':'0.5','¼':'0.25','¾':'0.75','⅓':'0.3333','⅔':'0.6667','⅛':'0.125'};
  line=String(line).trim().replace(/(\d)([½¼¾⅓⅔⅛])/g,'$1 $2').replace(/[½¼¾⅓⅔⅛]/g,c=>fractions[c]);
  const m=line.match(/^(\d+\/\d+|\d+(?:\.\d+)?(?:\s+\d+\/\d+|\s+0\.\d+)?)\s*(.*)$/);
  if(!m)return {name:line,amount:null,unit:''};
  const amount=m[1].split(/\s+/).reduce((n,v)=>n+(v.includes('/')?Number(v.split('/')[0])/Number(v.split('/')[1]):Number(v)),0);
  const u=m[2].match(/^(kg|ml|tbsp|tsp|cups?|cloves?|tins?|cans?|g|l)\b\s*(.*)$/i);
  return {name:(u?u[2]:m[2]).trim()||line,amount,unit:u?u[1].toLowerCase():''};
}
export function scaled(lines,base,servings){return lines.map(line=>{const i=typeof line==='string'?parse(line):{...line};return {...i,amount:i.amount===null?null:i.amount*servings/base};});}
export function quantity(i){return i.amount===null?'':`${format(i.amount)}${i.unit?' '+i.unit:''}`;}
export function combine(ingredients){
  const result=new Map();
  for(const input of ingredients){let i={...input};const u=units[i.unit];if(u&&i.amount!==null){i.amount*=u[1];i.unit=u[0];}
    const k=key(i.name)+'|'+i.unit+'|'+(i.amount===null?'unknown':'number');
    if(result.has(k)&&i.amount!==null)result.get(k).amount+=i.amount;else if(!result.has(k))result.set(k,i);
  }
  return [...result.values()];
}
export function mergeQuantity(existing,incoming){
  const old=existing.trim().match(/^[×x]\s*(\d+)$/i);
  const a=old?{name:incoming.name,amount:Number(old[1]),unit:''}:parse(existing+' '+incoming.name);
  a.name=incoming.name;
  if(!existing||a.amount===null||incoming.amount===null)return null;
  const merged=combine([a,incoming]);return merged.length===1?quantity(merged[0]):null;
}
