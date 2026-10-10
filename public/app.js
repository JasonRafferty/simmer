import {scaled,combine,quantity,parse,format,rebuildRows,rowKey} from '/ingredients.js';
import {instructionSteps} from '/steps.js';
import {setupFilterPickers,selectedFilterValues,setFilterValues} from './filter-picker.js';
import {setupCookMode} from './cook-mode.js';
const FILTERS=['category','cuisine','style','effort','time'];
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={recipes:[],meals:[]},offset=0,pickSlot=null,detailRecipe=null,detailServings=2,moving=null,shoppingMeals=[],shoppingRows=[],preview=null,requestId=null,busy=false;
const localDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function dates(){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7)+offset*7);return Array.from({length:7},(_,i)=>{const day=new Date(d);day.setDate(d.getDate()+i);return day;});}
function toast(s,undoToken){$('#toast').replaceChildren(document.createTextNode(s));if(undoToken){const button=document.createElement('button');button.textContent='Undo';button.onclick=()=>action(async()=>{state=await api('undo',{token:undoToken});render();toast('Restored');});$('#toast').append(button);}$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),undoToken?12000:4500);}
async function api(path,body){const r=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok){const e=Error(data.error||'Something went wrong.');e.status=r.status;throw e;}return data;}
async function refresh(){try{state=await api('state');render();$('#sync').textContent='Shared with Jason & Wah';}catch{$('#sync').textContent='Can’t connect · try again';}}
async function action(fn){if(busy)return;busy=true;try{await fn();}catch(e){toast(e.message);}finally{busy=false;}}
function show(id){const d=$('#'+id);d.showModal();d.querySelector('h2')?.setAttribute('tabindex','-1');d.querySelector('h2')?.focus({preventScroll:true});}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
let currentTab='discover',discoverScroll=0,pickerTransfer=false;
function tab(name){if(currentTab==='discover'){discoverScroll=scrollY;persistDiscovery();}currentTab=name;if(name!=='discover')pickSlot=null;for(const id of ['discover','week','recipes'])$('#'+id).hidden=name!==id;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===name));requestAnimationFrame(()=>scrollTo({top:name==='discover'?discoverScroll:0,behavior:'instant'}));}
$('#picker').addEventListener('close',()=>{if(!pickerTransfer)pickSlot=null;pickerTransfer=false;});
$('#editor').addEventListener('close',()=>{pickSlot=null;});
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab(b.dataset.tab);if(b.dataset.tab==='discover'&&!$('#discover-query').value.trim()&&!FILTERS.some(key=>selectedFilterValues($('#discover-'+key)).length)){discoverScroll=0;discover('');}});
function render(){
  const days=dates();$('#week-title').textContent=`${days[0].toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${days[6].toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;
  $('#calendar').innerHTML=days.map(d=>{const date=localDate(d);return `<div class="day ${date===localDate(new Date())?'today':''}"><div class="date">${d.toLocaleDateString('en-GB',{weekday:'short'})}<b>${d.getDate()}</b></div><div class="slots">${['lunch','dinner'].map(type=>{const slot=date+':'+type,meal=state.meals.find(m=>m.slot===slot),r=state.recipes.find(r=>r.id===meal?.recipe);return `<button class="slot ${type} ${meal?'filled':'empty'} ${moving===slot?'moving':''}" data-slot="${slot}" aria-label="${esc(d.toLocaleDateString('en-GB',{weekday:'long'}))} ${type}${meal?': '+esc(r?.name||meal.name):': add meal'}"><small>${type}</small><b>${meal?esc(r?.name||meal.name):'+ Plan something'}</b>${r?`<em>${meal.servings} portions · ${(r.prep+r.cook)||(r.estimatedMinutes?'~'+r.estimatedMinutes:'—')} min</em>`:''}</button>`;}).join('')}</div></div>`;}).join('');
  $('#meal-actions').hidden=!moving;$('#calendar').classList.toggle('moving-active',!!moving);$('#move-hint').textContent=moving?'Tap a destination to move this meal (occupied meals swap). Tap the same meal to cancel.':'Hold a meal to move it. Tap to see the recipe.';
  const query=$('#search').value.toLowerCase();const recipes=state.recipes.filter(r=>r.name.toLowerCase().includes(query));
  $('#recipe-grid').innerHTML=recipes.length?recipes.map(r=>`<button class="recipe-card" data-recipe="${r.id}"><div class="recipe-cover">${r.image?`<img src="${esc(r.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'♨'}</div><div class="copy"><b>${esc(r.name)}</b><small>${r.prep+r.cook?r.prep+r.cook+' min · ':''}${r.servings} portions</small></div></button>`).join(''):`<div class="empty-state"><b>${query?'Nothing found just yet':'Your favourites live here'}</b>${query?'Try another name.':'Add a recipe you love, or import one from a link.<br>Saved for both of you.'}</div>`;
  document.querySelectorAll('.slot.filled').forEach(slot=>{const meal=state.meals.find(m=>m.slot===slot.dataset.slot),r=state.recipes.find(r=>r.id===meal?.recipe);if(r?.image){const img=document.createElement('img');img.src=r.image;img.alt='';img.className='meal-photo';img.referrerPolicy='no-referrer';slot.prepend(img);}});
  renderDiscovery();
}
$('#previous').onclick=()=>{offset--;moving=null;render();};$('#next').onclick=()=>{offset++;moving=null;render();};$('#today').onclick=()=>{offset=0;moving=null;render();};$('#search').oninput=render;
function renderPicker(){const query=$('#picker-query').value.trim().toLowerCase();const matches=state.recipes.filter(r=>r.name.toLowerCase().includes(query));const shown=matches.slice(0,8);$('#picker-count').textContent=matches.length>8?`Showing 8 of ${matches.length} · type to narrow it down`:`${matches.length} saved recipe${matches.length===1?'':'s'}`;$('#picker-list').innerHTML=shown.length?shown.map(r=>`<button class="picker-recipe" data-pick="${r.id}">${r.image?`<img src="${esc(r.image)}" alt="" referrerpolicy="no-referrer">`:''}<span>${esc(r.name)}</span></button>`).join(''):'<p class="hint">No saved recipes match. Search for a new recipe below.</p>';}
function picker(slot){pickSlot=slot;$('#quick-meal-name').value='';$('#picker-query').value='';renderPicker();show('picker');}
$('#picker-query').oninput=renderPicker;
let hold=null,suppress=false,drag=null;
function dragFeedback(x,y){document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));const target=document.elementFromPoint(x,y)?.closest('[data-slot]');if(target&&target.dataset.slot!==moving)target.classList.add('drop-target');}
function clearDragFeedback(){document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));}
document.addEventListener('pointermove',e=>{if(moving&&suppress)dragFeedback(e.clientX,e.clientY);});
document.addEventListener('touchmove',e=>{if(moving&&suppress&&e.touches.length===1)dragFeedback(e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
for(const event of ['pointerup','touchend','pointercancel'])document.addEventListener(event,clearDragFeedback);
$('#calendar').addEventListener('contextmenu',e=>{if(e.target.closest('[data-slot]'))e.preventDefault();});
$('#calendar').addEventListener('pointerdown',e=>{const slot=e.target.closest('[data-slot]');if(!slot)return;suppress=false;const meal=state.meals.find(m=>m.slot===slot.dataset.slot);if(!meal)return;hold={x:e.clientX,y:e.clientY,timer:setTimeout(()=>{moving=slot.dataset.slot;suppress=true;navigator.vibrate?.(15);render();},450)};});
document.addEventListener('pointermove',e=>{if(hold&&(Math.abs(e.clientX-hold.x)>10||Math.abs(e.clientY-hold.y)>10)){clearTimeout(hold.timer);hold=null;}if(moving&&suppress)drag={x:e.clientX,y:e.clientY};});
document.addEventListener('pointerup',()=>{if(hold)clearTimeout(hold.timer);hold=null;if(moving&&drag){const dest=document.elementFromPoint(drag.x,drag.y)?.closest('[data-slot]');if(dest&&dest.dataset.slot!==moving)moveTo(dest.dataset.slot);drag=null;}});
document.addEventListener('pointercancel',()=>{if(hold)clearTimeout(hold.timer);hold=null;drag=null;});
document.addEventListener('touchmove',e=>{if(moving&&suppress&&e.touches.length===1){e.preventDefault();drag={x:e.touches[0].clientX,y:e.touches[0].clientY};}},{passive:false});
document.addEventListener('touchend',()=>{if(moving&&drag){const dest=document.elementFromPoint(drag.x,drag.y)?.closest('[data-slot]');if(dest&&dest.dataset.slot!==moving)moveTo(dest.dataset.slot);drag=null;}},{passive:true});
async function moveTo(to){await action(async()=>{state=await api('meal/move',{from:moving,to});moving=null;render();toast('Meal moved');});}
$('#calendar').onclick=e=>{const slot=e.target.closest('[data-slot]');if(!slot)return;if(suppress){suppress=false;return;}if(moving){if(slot.dataset.slot===moving){moving=null;render();}else moveTo(slot.dataset.slot);return;}const meal=state.meals.find(m=>m.slot===slot.dataset.slot);if(meal?.recipe)openDetail(meal.recipe,meal.servings,meal.slot);else{picker(slot.dataset.slot);if(meal)$('#quick-meal-name').value=meal.name;}};
$('#picker-list').onclick=e=>{const b=e.target.closest('[data-pick]');if(b)action(async()=>{const r=state.recipes.find(r=>r.id===b.dataset.pick);await confirmPortions(r);state=await api('meal',{slot:pickSlot,recipe:b.dataset.pick,servings:2});$('#picker').close();render();});};
function editor(recipe={}){const f=$('#recipe-form');f.reset();for(const name of ['id','name','servings','prep','cook','instructions','image','source'])f.elements[name].value=recipe[name]??({servings:2,prep:0,cook:0}[name]??'');f.elements.ingredients.value=(recipe.ingredients??[]).join('\n');$('#editor-title').textContent=recipe.id?'Edit recipe':'New recipe';show('editor');}
$('#new-recipe').onclick=()=>{pickSlot=null;editor();};
$('#quick-meal-form').onsubmit=e=>{e.preventDefault();action(async()=>{state=await api('meal',{slot:pickSlot,name:$('#quick-meal-name').value,servings:2});$('#picker').close();render();toast('Meal planned');});};
$('#meal-cancel').onclick=()=>{moving=null;render();};
$('#meal-delete').onclick=()=>action(async()=>{state=await api('meal/remove',{slot:moving});moving=null;render();toast('Meal removed',state.undoToken);});
$('#meal-edit').onclick=()=>{const meal=state.meals.find(m=>m.slot===moving);moving=null;render();if(meal?.recipe)openDetail(meal.recipe,meal.servings,meal.slot);else if(meal){picker(meal.slot);$('#quick-meal-name').value=meal.name;}};
$('#picker-search').onclick=()=>{pickerTransfer=true;$('#picker').close();tab('discover');toast('Choose a recipe, then tap Add to our week.');};
$('#recipe-form').onsubmit=e=>{e.preventDefault();action(async()=>{const body=Object.fromEntries(new FormData(e.target));const prior=state.recipes.find(r=>r.id===body.id);if(prior?.providerId)Object.assign(body,{providerId:prior.providerId,yieldUnverified:prior.yieldUnverified&&Number(body.servings)===prior.servings});body.ingredients=body.ingredients.split('\n').filter(s=>s.trim());const recipe=await api('recipe',body);if(pickSlot){await api('meal',{slot:pickSlot,recipe:recipe.id,servings:2});pickSlot=null;}$('#editor').close();await refresh();toast('Recipe saved for both of you');});};
$('#import-form').onsubmit=e=>{e.preventDefault();action(async()=>{const button=e.target.querySelector('button');button.disabled=true;button.textContent='Importing…';try{const recipe=await api('import',{url:$('#import-url').value});pickSlot=null;editor(recipe);toast('Imported · check the recipe before saving');}finally{button.disabled=false;button.textContent='Import ↗';}});};
$('#recipe-grid').onclick=e=>{const card=e.target.closest('[data-recipe]');if(card)openDetail(card.dataset.recipe);};
let detailSlot=null;
let detailExcluded=new Set();
function openDetail(id,servings=2,slot=null){detailRecipe=state.recipes.find(r=>r.id===id);detailServings=servings;detailSlot=slot;detailExcluded=new Set();if(!detailRecipe)return;renderDetail();show('detail');}
let portionPending=null;
function confirmPortions(recipe){if(!recipe?.yieldUnverified)return Promise.resolve();$('#original-portions').value=recipe.servings||2;show('portion-confirm');return new Promise((resolve,reject)=>{portionPending={recipe,resolve,reject};});}
$('#portion-form').onsubmit=async e=>{e.preventDefault();const pending=portionPending;if(!pending)return;try{const n=Number($('#original-portions').value);if(n<1||n>100||!Number.isFinite(n))throw Error('Choose 1–100 portions.');const r=pending.recipe.id?await api('recipe/portions',{id:pending.recipe.id,servings:n}):{...pending.recipe,servings:n,yieldUnverified:false};Object.assign(pending.recipe,r);portionPending=null;$('#portion-confirm').close();pending.resolve();await refresh();if($('#detail').open)renderDetail();}catch(e){toast(e.message);}};
$('#portion-confirm').addEventListener('close',()=>{if(portionPending){portionPending.reject(Error('Portion confirmation cancelled. Nothing was sent or planned.'));portionPending=null;}});
function renderDetail(){
  const r=detailRecipe;$('#detail-title').textContent=r.name;
  let remove=$('#remove-catalogue-recipe');if(!remove){remove=document.createElement('button');remove.id='remove-catalogue-recipe';remove.className='icon-button';remove.setAttribute('aria-label','Remove recipe from collection');remove.title='Remove recipe';remove.innerHTML='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg>';$('#plan-recipe').after(remove);remove.onclick=()=>{if(!confirm('Remove this recipe from the shared collection for both of you? Saved copies and planned meals will be kept.'))return;action(async()=>{await api('discover/remove',{providerId:detailRecipe.providerId});discovery=discovery.filter(x=>x.providerId!==detailRecipe.providerId);$('#detail').close();renderDiscovery();persistDiscovery();await discover($('#discover-query').value);catalogueCount=-1;await refreshCatalogue();toast('Recipe removed from the shared collection');});};}remove.hidden=!r.providerId||currentTab!=='discover';
  $('#save-discovered').hidden=!!r.id;$('#edit-recipe').hidden=!r.id;$('#delete-recipe').hidden=!r.id;
  const ingredients=r.yieldUnverified?r.ingredients.map(parse):scaled(r.ingredients,r.servings,detailServings);
  $('#detail-body').innerHTML=`${r.image?`<img class="detail-image" src="${esc(r.image)}" alt="${esc(r.name)}" referrerpolicy="no-referrer">`:''}
    ${r.prep||r.cook?`<p class="recipe-meta">${r.prep?'Prep '+r.prep+' min':''}${r.prep&&r.cook?' · ':''}${r.cook?'Cook '+r.cook+' min':''}</p>`:r.estimatedMinutes?`<p class="recipe-meta">About ${r.estimatedMinutes} min · estimated from the method</p>`:''}
    ${instructionSteps(r.instructions).length?'<button class="primary wide" data-cook>Start cooking ▶</button>':''}
    ${r.yieldUnverified?'<button class="secondary wide" data-confirm-portions>Confirm original portions</button>':`<div class="portions"><button data-portion="-1" aria-label="Fewer portions" ${detailServings<=1?'disabled':''}>−</button><b>${detailServings} portions</b><button data-portion="1" aria-label="More portions" ${detailServings>=100?'disabled':''}>+</button></div>`}
    <h3>Ingredients</h3><p class="hint">Remove what you already have · just for this shop.</p>
    <ul class="ingredient-list">${ingredients.map((i,index)=>detailExcluded.has(index)?'':`<li><span><b>${esc(quantity(i))}</b> ${esc(i.name)}</span><button class="remove-ingredient" data-remove-ingredient="${index}" aria-label="Remove ${esc(i.name)} from this shop">×</button></li>`).join('')}</ul>
    ${detailExcluded.size?`<button class="text-button" data-restore-ingredients>Restore ${detailExcluded.size} removed ingredient${detailExcluded.size===1?'':'s'}</button>`:''}
    <details class="instructions-section"><summary>Let’s make it <span>${instructionSteps(r.instructions).length} steps</span></summary>${r.instructions?`<ol class="instructions">${instructionSteps(r.instructions).map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`:'<p class="hint">No instructions added yet.</p>'}</details>
    ${r.source?`<a class="source" href="${esc(r.source)}" target="_blank" rel="noopener noreferrer">${r.provider==='Epicurious'?'Visit Epicurious ↗':'Original recipe ↗'}</a>`:''}${r.provider?`<p class="provider-credit">${r.provider==='Epicurious'?'Recipe and photo: Epicurious · imported from your image dataset':r.provider==='RecipeNLG'?'RecipeNLG':'Recipe and photo: '+esc(r.provider)}</p>`:''}${detailSlot?'<button class="secondary wide" id="remove-meal">Remove from this meal</button>':''}`;
}
$('#detail-body').onclick=e=>{if(e.target.closest('[data-confirm-portions]'))return action(async()=>{await confirmPortions(detailRecipe);renderDetail();});const button=e.target.closest('[data-portion]');if(button){detailServings=Math.max(1,Math.min(100,detailServings+Number(button.dataset.portion)));renderDetail();if(detailSlot)action(async()=>{state=await api('meal',{slot:detailSlot,recipe:detailRecipe.id,servings:detailServings});render();});}if(e.target.closest('#remove-meal'))action(async()=>{state=await api('meal/remove',{slot:detailSlot});$('#detail').close();render();toast('Meal removed',state.undoToken);});};
$('#detail-body').addEventListener('click',e=>{if(e.target.closest('[data-cook]')){const list=(detailRecipe.yieldUnverified?detailRecipe.ingredients.map(parse):scaled(detailRecipe.ingredients,detailRecipe.servings,detailServings)).filter((_,i)=>!detailExcluded.has(i)).map(i=>[quantity(i),i.name].filter(Boolean).join(' '));cook.open(detailRecipe,list);}const remove=e.target.closest('[data-remove-ingredient]');if(remove){detailExcluded.add(Number(remove.dataset.removeIngredient));renderDetail();}if(e.target.closest('[data-restore-ingredients]')){detailExcluded.clear();renderDetail();}});
$('#edit-recipe').onclick=()=>{$('#detail').close();pickSlot=null;editor(detailRecipe);};$('#delete-recipe').onclick=()=>{if(confirm('Delete this saved recipe and remove it from planned meals?'))action(async()=>{state=await api('recipe/delete',{id:detailRecipe.id});$('#detail').close();render();toast('Recipe deleted',state.undoToken);});};
async function saveSelected(){await confirmPortions(detailRecipe);if(!detailRecipe.id){detailRecipe=await api('recipe',detailRecipe);await refresh();renderDetail();}return detailRecipe;}
$('#save-discovered').onclick=()=>action(async()=>{await saveSelected();toast('Saved for both of you');});
$('#plan-recipe').onclick=()=>action(async()=>{await saveSelected();$('#detail').close();if(pickSlot){const slot=pickSlot;pickSlot=null;state=await api('meal',{slot,recipe:detailRecipe.id,servings:detailServings});tab('week');render();toast('Meal added to our week');return;}$('#plan-slots').innerHTML=dates().map(d=>{const date=localDate(d);return `<div class="plan-day"><b>${esc(d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}))}</b>${['lunch','dinner'].map(type=>{const slot=date+':'+type,meal=state.meals.find(m=>m.slot===slot);return `<button class="secondary" data-plan-slot="${slot}">${type}${meal?' · replace':''}</button>`;}).join('')}</div>`;}).join('');show('plan-picker');});
$('#plan-slots').onclick=e=>{const b=e.target.closest('[data-plan-slot]');if(b)action(async()=>{const existing=state.meals.find(m=>m.slot===b.dataset.planSlot);if(existing&&!confirm('Replace the meal already planned here?'))return;state=await api('meal',{slot:b.dataset.planSlot,recipe:detailRecipe.id,servings:detailServings});$('#plan-picker').close();tab('week');render();toast('Meal added to our week');});};
$('#shop-recipe').onclick=()=>action(async()=>{await saveSelected();$('#detail').close();await openShopping([{recipe:detailRecipe.id,servings:detailServings,label:detailRecipe.name,selected:true,excludedIndices:[...detailExcluded]}],detailRecipe.name);});

const failedPhotos=new Set();let discovery=[],searchSequence=0,searchWatch,discoverMore=null,discoverSeed='',discoverTotal=0,discoverMode='search',discoverQuery='',pantryItems=[],loadingMore=false;
$('#discover-form').insertAdjacentHTML('afterend','<div class="search-filters"><label>Main ingredient<select id="discover-category"><option value="">Any ingredient</option></select></label><label>Cuisine<select id="discover-cuisine"><option value="">Any cuisine</option></select></label><label>Dish type<select id="discover-style"><option value="">Any dish type</option></select></label><label>Effort<select id="discover-effort"><option value="">Any effort</option><option value="5">≤ 5 ingredients</option></select></label><label>Time<select id="discover-time"><option value="">Any time</option></select></label></div><button type="button" class="text-button" id="clear-filters">Clear filters</button>');
$('#discover-query').required=false;
const filterPickers=setupFilterPickers(),cook=setupCookMode({esc,toast});
let popularCuisines=new Set(['American','Italian','French','Mexican','British','Chinese','Indian','Japanese','Spanish','Thai']);
function applyFilters(filters){
 if(!filters)return;
 if(filters.popularCuisines?.length)popularCuisines=new Set(filters.popularCuisines);const common=popularCuisines;
 for(const [field,id,label]of [['categories','category','Any ingredient'],['cuisines','cuisine','Any cuisine'],['styles','style','Any dish type']]){
  const select=$('#discover-'+id),selected=selectedFilterValues(select);select.replaceChildren(new Option(label,''));
  const popularIngredients=['Chicken','Pork','Beef','Fish','Lamb','Seafood','Turkey'];
  const values=[...(filters[field]??[])];
  if(field==='categories')values.sort((a,b)=>{const rank=value=>{const index=popularIngredients.indexOf(value);return index<0?popularIngredients.length:index;};return rank(a)-rank(b)||a.localeCompare(b);});
  const groups=field==='cuisines'?[['Popular cuisines',values.filter(x=>common.has(x))],['More to explore',values.filter(x=>!common.has(x))]]:[[null,values]];
  for(const [name,items]of groups){if(!items.length)continue;const group=name?document.createElement('optgroup'):select;if(name)group.label=name;for(const value of items)group.append(new Option(value+' · '+(filters.counts?.[field]?.[value]??0).toLocaleString(),value));if(name)select.append(group);}
  for(const value of selected)if(!values.includes(value))select.add(new Option(value+' · 0 local matches',value));setFilterValues(select,selected);
 }
 const effort=$('#discover-effort'),selected=selectedFilterValues(effort);effort.replaceChildren(new Option('Any ingredient count',''),...Object.entries({'5':'≤ 5 ingredients','6-10':'6–10 ingredients','11+':'11+ ingredients'}).map(([value,label])=>new Option(label+' · '+(filters.efforts?.[value]??0).toLocaleString(),value)));setFilterValues(effort,selected);
 const time=$('#discover-time'),times=selectedFilterValues(time);time.replaceChildren(new Option('Any time',''),...Object.entries({'30':'Under 30 min','30-60':'30–60 min','60+':'Over 1 hour'}).map(([value,label])=>new Option(label+' · '+(filters.times?.[value]??0).toLocaleString(),value)));setFilterValues(time,times);
 filterPickers.sync();
}
$('#clear-filters').onclick=()=>{for(const key of FILTERS)$('#discover-'+key).value='';filterPickers.sync();discover($('#discover-query').value);};
function persistDiscovery(){try{sessionStorage.setItem('simmer-discovery',JSON.stringify({version:'filters-v3',query:$('#discover-query').value,more:discoverMore,seed:discoverSeed,total:discoverTotal,mode:discoverMode,searched:discoverQuery,pantry:pantryItems,status:$('#discover-status').textContent,time:selectedFilterValues($('#discover-time')),category:selectedFilterValues($('#discover-category')),cuisine:selectedFilterValues($('#discover-cuisine')),style:selectedFilterValues($('#discover-style')),effort:selectedFilterValues($('#discover-effort')),recipes:discovery,scroll:discoverScroll}));}catch{}}
function renderDiscovery(){
  $('#discover-results').innerHTML=discovery.filter(r=>!failedPhotos.has(r.providerId)).map(r=>{const saved=state.recipes.some(s=>s.providerId===r.providerId);const about=discoverMode==='pantry'?(r.missingCount?`Missing ${r.missingCount}: ${r.missing.join(', ')}${r.missingCount>r.missing.length?'…':''}`:'✓ You have everything'):[r.cuisine,r.style||r.category].filter(Boolean).join(' · ');const meta=[about,r.ingredientCount?r.ingredientCount+' ingredients':''].filter(Boolean).join(' · ');return `<button class="recipe-card" data-discover="${r.providerId}"><div class="recipe-cover">${r.image?`<img src="${esc(r.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'♨'}${saved?'<span class="saved-badge">✓ Already saved</span>':''}</div><div class="copy"><b>${esc(r.name)}</b><small>${esc(meta||'See recipe →')}</small></div></button>`;}).join('');
  $('#discover-more').textContent=discoverMore!=null?'Loading more recipes…':discovery.length>12?'That’s everything for this search.':'';
}
let scrollTimer;addEventListener('scroll',()=>{if(currentTab==='discover'){clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{discoverScroll=scrollY;persistDiscovery();},100);}},{passive:true});
$('#detail').addEventListener('close',()=>{if(currentTab==='discover')requestAnimationFrame(()=>scrollTo({top:discoverScroll,behavior:'instant'}));});
let savedDiscovery;try{savedDiscovery=JSON.parse(sessionStorage.getItem('simmer-discovery')||'null');}catch{}
if(savedDiscovery?.version!=='filters-v3')savedDiscovery=null;
if(savedDiscovery){discovery=savedDiscovery.recipes??[];({more:discoverMore=null,seed:discoverSeed='',total:discoverTotal=0,mode:discoverMode='search',searched:discoverQuery='',pantry:pantryItems=[]}=savedDiscovery);$('#discover-status').textContent=savedDiscovery.status??'';$('#discover-query').value=savedDiscovery.query??'';discoverScroll=savedDiscovery.scroll??0;renderDiscovery();requestAnimationFrame(()=>scrollTo({top:discoverScroll,behavior:'instant'}));}
api('discover/filters').then(filters=>{for(const key of FILTERS){const select=$('#discover-'+key);for(const value of [].concat(savedDiscovery?.[key]??[]))if(value)select.add(new Option(value,value,true,true));}applyFilters(filters);}).catch(()=>toast('Search filters could not load.'));
for(const id of FILTERS.map(key=>'discover-'+key))$('#'+id).onchange=()=>{filterPickers.sync();discover($('#discover-query').value);};
const currentFilters=()=>Object.fromEntries(FILTERS.map(key=>[key,selectedFilterValues($('#discover-'+key))]));
function searchParams(q,extra={},filters=currentFilters()){const params=new URLSearchParams({q,...extra});for(const [key,values]of Object.entries(filters))for(const value of values)params.append(key,value);return params;}
const pantryParams=offset=>{const params=new URLSearchParams({offset,staples:$('#pantry-staples').checked?'1':'0'});for(const item of pantryItems)params.append('have',item);return params;};
function describeResults(result){
  if(!discovery.length)return discoverMode==='pantry'?'No recipes use those ingredients. Try fewer or more common ones.':'No recipes match. Try another search or clear the filters.';
  const count=`${result.total.toLocaleString()} recipe${result.total===1?'':'s'}`;
  if(discoverMode==='pantry')return `${count} use what you have · fewest extra ingredients first`;
  return count+(result.corrected?` · showing results for “${result.corrected}”`:'')+(result.relaxed?' · no exact match, showing recipes that match some of your words':'');
}
function keepFilling(){requestAnimationFrame(()=>{if(discoverMore!=null&&currentTab==='discover'&&$('#discover-more').getBoundingClientRect().top<innerHeight+800)loadMore();});}
async function discover(query,retry=0){
  clearTimeout(searchWatch);
  const sequence=++searchSequence;const q=query.trim();if(q.length===1)return toast('Enter at least two letters or clear the search to browse.');
  if(!retry){discoverSeed=Math.random().toString(36).slice(2,12);$('#surprise-banner').hidden=true;}discoverMode='search';discoverQuery=q;
  $('#discover-query').value=q;$('#discover-status').textContent='Looking for something delicious…';if(!retry)$('#discover-results').innerHTML='';$('#discover-form button').disabled=true;
  try{const result=await api('discover?'+searchParams(q,{seed:discoverSeed}));if(sequence!==searchSequence)return;discovery=result.recipes;discoverMore=result.nextOffset;discoverTotal=result.total;applyFilters(result.filters);
    $('#discover-status').textContent=describeResults(result);
    if(result.checking){$('#discover-status').textContent+=' · checking more source recipes for photos…';if(retry<8)searchWatch=setTimeout(()=>{if(currentTab==='discover')discover(q,retry+1);},8000);}else if(result.warning)$('#discover-status').textContent+=' · online search unavailable; showing your server catalogue.';
    if(!retry)discoverScroll=0;renderDiscovery();persistDiscovery();keepFilling();
  }catch(e){if(sequence===searchSequence)$('#discover-status').textContent=e.message;}finally{if(sequence===searchSequence)$('#discover-form button').disabled=false;}
}
async function loadMore(){
  if(loadingMore||discoverMore==null)return;loadingMore=true;const sequence=searchSequence;
  try{const result=await api(discoverMode==='pantry'?'discover/pantry?'+pantryParams(discoverMore):'discover?'+searchParams(discoverQuery,{seed:discoverSeed,offset:discoverMore}));if(sequence!==searchSequence)return;
    const seen=new Set(discovery.map(r=>r.providerId));discovery.push(...result.recipes.filter(r=>!seen.has(r.providerId)));discoverMore=result.nextOffset;renderDiscovery();persistDiscovery();
  }catch(e){toast(e.message);}finally{loadingMore=false;}
  keepFilling();
}
new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&currentTab==='discover')loadMore();},{rootMargin:'800px'}).observe($('#discover-more'));
async function findWithPantry(items){
  const sequence=++searchSequence;pantryItems=items;discoverMode='pantry';discoverQuery='';$('#discover-query').value='';$('#surprise-banner').hidden=true;
  try{localStorage.setItem('simmer-pantry',JSON.stringify({items,staples:$('#pantry-staples').checked}));}catch{}
  $('#discover-status').textContent='Checking what you can make…';$('#discover-results').innerHTML='';
  try{const result=await api('discover/pantry?'+pantryParams(0));if(sequence!==searchSequence)return;discovery=result.recipes;discoverMore=result.nextOffset;discoverTotal=result.total;$('#discover-status').textContent=describeResults(result);discoverScroll=0;scrollTo({top:0});renderDiscovery();persistDiscovery();keepFilling();}
  catch(e){if(sequence===searchSequence)$('#discover-status').textContent=e.message;}
}
$('#pantry-form').onsubmit=e=>{e.preventDefault();const items=$('#pantry-items').value.split(/[,\n]+/).map(s=>s.trim()).filter(Boolean).slice(0,30);if(!items.length)return;$('#pantry').close();findWithPantry(items);};
function openPantry(){try{const saved=JSON.parse(localStorage.getItem('simmer-pantry')||'null');if(saved&&!$('#pantry-items').value){$('#pantry-items').value=saved.items.join(', ');$('#pantry-staples').checked=saved.staples!==false;}}catch{}show('pantry');}
// Surprise picks among the filters the person chose; "Try another" ignores the previous surprise's own picks.
let surpriseBase=null;
async function surpriseMe(button){
  button.disabled=true;
  try{
    let recent=[];try{recent=JSON.parse(sessionStorage.getItem('simmer-surprise-recent')||'[]');}catch{}
    if($('#surprise-banner').hidden||!surpriseBase)surpriseBase=currentFilters();
    const params=searchParams('',{},surpriseBase);params.delete('q');for(const value of recent)params.append('avoid',value);
    const pick=await api('discover/surprise?'+params);if(!pick.filters)return toast('No recipe combinations match your filters. Clear some and try again.');
    recent=[pick.filters.cuisine,pick.filters.category,...recent].slice(0,6);try{sessionStorage.setItem('simmer-surprise-recent',JSON.stringify(recent));}catch{}
    for(const key of ['category','cuisine','style']){const select=$('#discover-'+key),value=pick.filters[key];if(![...select.options].some(option=>option.value===value))select.add(new Option(value,value));setFilterValues(select,[value]);}
    filterPickers.sync();const base=surpriseBase;await discover('');surpriseBase=base;
    const banner=$('#surprise-banner');banner.innerHTML=`<span>🎲 Surprise: <b>${esc(pick.filters.cuisine)} · ${esc(pick.filters.category)} · ${esc(pick.filters.style)}</b> · ${pick.count} recipe${pick.count===1?'':'s'}</span><button type="button" data-surprise>Try another</button>`;banner.hidden=false;
  }finally{button.disabled=false;}
}
$('#surprise-banner').onclick=e=>{const b=e.target.closest('[data-surprise]');if(b)action(()=>surpriseMe(b));};
$('#discover-form').onsubmit=e=>{e.preventDefault();discover($('#discover-query').value);};
$('#discover-query').addEventListener('input',e=>{if(!e.target.value)discover('');});
let ideaPool=[];
function rotateIdeas(){const previous=new Set([...document.querySelectorAll('.search-chips [data-query]')].map(b=>b.dataset.query));const choices=ideaPool.filter(x=>!previous.has(x));for(let i=choices.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]];}$('.search-chips').innerHTML=choices.slice(0,4).map(x=>`<button data-query="${esc(x)}">${esc(x)}</button>`).join('')+'<button data-more-ideas aria-label="Show more adventurous recipe ideas">↻ More ideas</button><button data-surprise>Surprise us</button><button data-pantry>What can I make?</button>';}
api('discover/ideas').then(({ideas})=>{ideaPool=ideas;rotateIdeas();}).catch(()=>{$('.search-chips').innerHTML='';});
$('.search-chips').onclick=e=>{const b=e.target.closest('[data-query]');if(b){for(const key of FILTERS)setFilterValues($('#discover-'+key),[]);filterPickers.sync();discover(b.dataset.query);}if(e.target.closest('[data-pantry]'))openPantry();if(e.target.closest('[data-more-ideas]'))rotateIdeas();const surprise=e.target.closest('[data-surprise]');if(surprise)action(()=>surpriseMe(surprise));};
$('#discover-results').onclick=e=>{const card=e.target.closest('[data-discover]');if(card)action(async()=>{discoverScroll=scrollY;persistDiscovery();const saved=state.recipes.find(r=>r.providerId===card.dataset.discover);detailRecipe=saved??await api('discover/recipe?id='+encodeURIComponent(card.dataset.discover));detailServings=2;detailSlot=null;detailExcluded=new Set();renderDetail();show('detail');});};
$('#shop-week').onclick=()=>action(async()=>{const week=new Set(dates().map(localDate));const meals=state.meals.filter(m=>m.recipe&&week.has(m.slot.slice(0,10))).sort((a,b)=>a.slot.localeCompare(b.slot));if(!meals.length)return toast('Choose a saved recipe to shop its ingredients. Name-only meals have no ingredients.');for(const id of new Set(meals.map(m=>m.recipe)))await confirmPortions(state.recipes.find(r=>r.id===id));await openShopping(meals.map(m=>({...m,label:`${new Date(m.slot.slice(0,10)+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short'})} ${m.slot.split(':')[1]} · ${state.recipes.find(r=>r.id===m.recipe)?.name}`,selected:true})),'Weekly meals');});
let shoppingOverrides=new Map();
async function openShopping(meals,name){shoppingMeals=meals;shoppingOverrides=new Map();requestId=crypto.randomUUID();$('#new-list-name').value=name;$('#send-preview').hidden=true;$('#confirm-send').hidden=true;$('#tally-list').innerHTML='<option value="">Create a new shared list</option>';$('#new-list-label').hidden=false;renderMealSelection();buildShopping();show('shopping');try{const lists=await api('tally/lists');$('#tally-list').innerHTML+='<optgroup label="Existing shared shopping lists">'+lists.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('')+'</optgroup>';}catch(e){toast(e.message);}}
function renderMealSelection(){$('#meal-selection').innerHTML=shoppingMeals.map((m,i)=>`<label class="meal-check"><input type="checkbox" data-meal="${i}" ${m.selected?'checked':''}><span>${esc(m.label)}</span><input class="shopping-portions" type="number" min="1" max="100" value="${m.servings}" data-meal-portions="${i}" aria-label="Portions for ${esc(m.label)}"></label>`).join('');}
function buildShopping(){shoppingRows=rebuildRows(shoppingMeals.filter(m=>m.selected).flatMap(m=>{const r=state.recipes.find(r=>r.id===m.recipe);return r?scaled(r.ingredients.filter((_,i)=>!m.excludedIndices?.includes(i)),r.servings,m.servings):[];}),shoppingOverrides);renderShopping();invalidate();}
function renderShopping(){$('#shopping-ingredients').innerHTML=shoppingRows.map((i,n)=>`<div class="shop-row ${i.selected?'':'unchecked'}"><input type="checkbox" data-include="${n}" ${i.selected?'checked':''} aria-label="Include ${esc(i.name)}"><input class="ingredient-name" data-name="${n}" value="${esc(i.name)}" aria-label="Ingredient name"><input class="amount" data-amount="${n}" value="${esc(quantity(i))}" aria-label="Quantity for ${esc(i.name)}" placeholder="As needed"></div>`).join('');}
function invalidate(){preview=null;$('#send-preview').hidden=true;$('#confirm-send').hidden=true;}
$('#meal-selection').onchange=e=>{if(e.target.dataset.meal!==undefined)shoppingMeals[Number(e.target.dataset.meal)].selected=e.target.checked;if(e.target.dataset.mealPortions!==undefined){const n=Number(e.target.value);if(n<1||n>100||!Number.isFinite(n)){e.target.value=2;return toast('Choose 1–100 portions.');}shoppingMeals[Number(e.target.dataset.mealPortions)].servings=n;}buildShopping();};
$('#shopping-ingredients').oninput=e=>{const d=e.target.dataset;const index=Number(d.include??d.name??d.amount);const row=shoppingRows[index];if(!row)return;const edit=shoppingOverrides.get(row.identity)??{};
  if(d.include!==undefined){row.selected=edit.selected=e.target.checked;e.target.closest('.shop-row').classList.toggle('unchecked',!e.target.checked);}
  if(d.name!==undefined)row.name=edit.name=e.target.value;
  if(d.amount!==undefined){const value=e.target.value.trim();const parsed=value?parse(value+' ingredient'):{amount:null,unit:'',needsReview:false,quantityText:''};const valid=!value||(!parsed.needsReview&&Number.isFinite(parsed.amount)&&parsed.amount>0&&parsed.name==='ingredient');e.target.setCustomValidity(valid?'':'Use one positive amount and recognised unit, e.g. 200 g. Resolve ranges first.');Object.assign(row,{amount:parsed.amount,unit:parsed.unit,needsReview:!valid,quantityText:parsed.quantityText??''});Object.assign(edit,{amount:row.amount,unit:row.unit,needsReview:row.needsReview,quantityText:row.quantityText});}
  shoppingOverrides.set(row.identity,edit);invalidate();};
$('#tally-list').onchange=()=>{$('#new-list-label').hidden=!!$('#tally-list').value;invalidate();};$('#new-list-name').oninput=invalidate;
function shoppingBody(){const selected=shoppingRows.filter(i=>i.selected);if(selected.some(i=>i.needsReview))throw Error('Resolve selected ingredient ranges before sending, or untick them.');if(![...$('#shopping-ingredients').querySelectorAll('.shop-row:not(.unchecked) input')].every(i=>i.reportValidity()))throw Error('Check the ingredient quantities.');return {ingredients:selected.map(({name,amount,unit,quantityText,needsReview})=>({name,amount,unit,quantityText,needsReview})),listId:$('#tally-list').value,name:$('#new-list-name').value};}
async function getPreview(){const body=shoppingBody();if(!body.ingredients.length)throw Error('Select at least one ingredient.');preview={...await api('tally/preview',body),body};$('#send-preview').hidden=false;$('#send-preview').innerHTML='<b>Review before sending</b>'+preview.rows.map(i=>`<div class="${i.action==='review'?'review-warning':''}">${esc(i.name)} · ${i.action==='merge'?`${esc(i.existing.qty)} → ${esc(i.merged)} (combined)`:i.action==='review'?'Matching ingredient · quantities need review':`${esc(i.qty)} · new item`}</div>`).join('');$('#confirm-send').hidden=preview.rows.some(i=>i.action==='review');if($('#confirm-send').hidden)$('#send-preview').innerHTML+='<p>Untick incompatible items above, or change their quantities in Tally, then review again. Nothing has been sent.</p>';}
$('#preview-send').onclick=()=>action(getPreview);
let pendingSend;try{pendingSend=JSON.parse(localStorage.getItem('simmer-pending-send')||'null');}catch{}
$('#retry-send').hidden=!pendingSend;
async function sendPending(){try{await api('tally/send',pendingSend);pendingSend=null;localStorage.removeItem('simmer-pending-send');$('#retry-send').hidden=true;$('#shopping').close();toast('Shopping sent to Tally ✓');}catch(e){if(e.status===409){pendingSend=null;localStorage.removeItem('simmer-pending-send');$('#retry-send').hidden=true;requestId=crypto.randomUUID();if($('#shopping').open)await getPreview();toast('Tally changed. Review again before sending.');}else{toast('Send not confirmed. Use Retry last Tally send; it won’t apply twice.');throw e;}}}
$('#retry-send').onclick=()=>action(sendPending);
$('#confirm-send').onclick=()=>action(async()=>{if(!preview)return;if(pendingSend)throw Error('Retry the previous Tally send before starting another.');const button=$('#confirm-send');button.disabled=true;try{pendingSend={...preview.body,version:preview.version,requestId};localStorage.setItem('simmer-pending-send',JSON.stringify(pendingSend));$('#retry-send').hidden=false;await sendPending();}finally{button.disabled=false;}});
let catalogueCount=-1;
async function refreshCatalogue(){try{const s=await api('catalogue/status');if(s.ready!==catalogueCount){catalogueCount=s.ready;if(!$('#discover-query').value&&!FILTERS.some(x=>$('#discover-'+x).value))await discover('');}}catch{}}
refreshCatalogue();setInterval(()=>{if(!document.hidden)refreshCatalogue();},15000);
$('#discover-results').addEventListener('error',e=>{const card=e.target.closest('[data-discover]');if(card){failedPhotos.add(card.dataset.discover);card.hidden=true;}},true);
await refresh();setInterval(()=>{if(!document.hidden&&!document.querySelector('dialog[open]')&&!moving&&!hold)refresh();},7000);
