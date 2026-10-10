const units = {g:['g',1],kg:['g',1000],ml:['ml',1],l:['ml',1000],tsp:['ml',5],tbsp:['ml',15],cup:['ml',240],cups:['ml',240],clove:['cloves',1],cloves:['cloves',1],tin:['tins',1],tins:['tins',1],can:['tins',1],cans:['tins',1],oz:['g',28.349523125],lb:['g',453.59237],'fl oz':['ml',29.5735295625],pinch:['pinches',1],pinches:['pinches',1],pack:['packs',1],packs:['packs',1]};
const aliases=new Map([['yogurt','yoghurt'],['yogurts','yoghurts'],['scallions','spring onions'],['zucchini','courgette'],['eggplant','aubergine'],['cilantro','coriander'],['garbanzo beans','chickpeas'],['baking soda','bicarbonate of soda']]);
const unitNames={gram:'g',grams:'g',kilogram:'kg',kilograms:'kg',milliliter:'ml',milliliters:'ml',millilitre:'ml',millilitres:'ml',liter:'l',liters:'l',litre:'l',litres:'l',teaspoon:'tsp',teaspoons:'tsp',tablespoon:'tbsp',tablespoons:'tbsp',ounce:'oz',ounces:'oz',pound:'lb',pounds:'lb',lbs:'lb',c:'cup','fluid ounce':'fl oz','fluid ounces':'fl oz','fl oz':'fl oz'};
export const key=s=>{const v=String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim();return aliases.get(v)??v;};
export const format = n => String(Math.round(n * 100) / 100);
export function parse(line) {
  const fractions={'½':'0.5','¼':'0.25','¾':'0.75','⅓':'0.3333','⅔':'0.6667','⅛':'0.125'};
  line=String(line).trim().replace(/(\d)([½¼¾⅓⅔⅛])/g,'$1 $2').replace(/[½¼¾⅓⅔⅛]/g,c=>fractions[c]);
  const range=line.match(/^(\d+(?:\.\d+)?\s*(?:[-–—]|to)\s*\d+(?:\.\d+)?)(?:\s*(kg|g|ml|l|tsp|tbsp))?\s+(.+)$/i);
  if(range)return {name:range[3],amount:null,unit:'',quantityText:range[1]+(range[2]?' '+range[2]:''),needsReview:true};
  const m=line.match(/^(\d+\/\d+|\d+(?:\.\d+)?(?:\s+\d+\/\d+|\s+0\.\d+)?)\s*(.*)$/);
  if(!m)return {name:line,amount:null,unit:''};
  const amount=m[1].split(/\s+/).reduce((n,v)=>n+(v.includes('/')?Number(v.split('/')[0])/Number(v.split('/')[1]):Number(v)),0);
  const u=m[2].match(/^(fluid ounces?|fl\.?\s*oz\.?|kilograms?|grams?|milliliters?|millilitres?|liters?|litres?|teaspoons?|tablespoons?|ounces?|pounds?|lbs|kg|ml|tbsp|tsp|cups?|cloves?|tins?|cans?|pinches|pinch|packs?|oz|lb|g|l|c)\b\.?\s*(.*)$/i);
  if(!Number.isFinite(amount)||amount<=0)return {name:line,amount:null,unit:'',needsReview:true,quantityText:line};
  const rawUnit=u?.[1].toLowerCase().replace(/\./g,'').replace(/\s+/g,' ');
  return {name:(u?u[2]:m[2]).trim()||line,amount,unit:u?(unitNames[rawUnit]??rawUnit):''};
}
export function toMetric(input){const i={...input},u=units[i.unit];if(u&&i.amount!==null){i.amount*=u[1];i.unit=u[0];}return i;}
export function scaled(lines,base,servings){return lines.map(line=>{const i=toMetric(typeof line==='string'?parse(line):line);return {...i,amount:i.amount===null?null:i.amount*servings/base};});}
const metricFormat=n=>format(n>=100?Math.round(n):n>=10?Math.round(n*10)/10:n);
export function quantity(input){const i=toMetric(input);return i.amount===null?(i.quantityText??''):`${i.unit==='g'||i.unit==='ml'?metricFormat(i.amount):format(i.amount)}${i.unit?' '+i.unit:''}`;}
export const rowKey=input=>{const i=toMetric(input);return key(i.name)+'|'+i.unit+'|'+(i.amount===null?'unknown:'+quantity(i):'number');};
export function combine(ingredients){
  const result=new Map();
  for(const input of ingredients){const i=toMetric(input);
    const k=rowKey(i);
    if(result.has(k)&&i.amount!==null)result.get(k).amount+=i.amount;else if(!result.has(k))result.set(k,i);
  }
  return [...result.values()];
}
export function mergeQuantity(existing,incoming){
  let value=existing.trim(),multiplier=1;const packs=value.match(/^(.*?)\s*[×x]\s*(\d+)$/i);
  if(packs&&packs[1].trim()){value=packs[1].trim();multiplier=Number(packs[2]);}
  const old=value.match(/^[×x]\s*(\d+)$/i);
  const a=old?{name:incoming.name,amount:Number(old[1]),unit:''}:parse(value+' '+incoming.name);
  if(!value||a.amount===null||a.needsReview||incoming.amount===null||incoming.needsReview||key(a.name)!==key(incoming.name))return null;
  a.amount*=multiplier;
  const merged=combine([a,incoming]);return merged.length===1?quantity(merged[0]):null;
}
export function rebuildRows(ingredients,overrides=new Map()){
  return combine(ingredients).map(i=>{const identity=rowKey(i),edit=overrides.get(identity)??{};return {...i,identity,selected:edit.selected??true,...edit};});
}
