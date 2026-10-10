const chevron='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const check='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" aria-hidden="true"><path d="m5 12 4 4L19 5"/></svg>';
const optionNames={'discover-effort':{'5':'≤ 5 ingredients','6-10':'6–10 ingredients','11+':'11+ ingredients'},'discover-time':{'30':'Under 30 min','30-60':'30–60 min','60+':'Over 1 hour'}};
export const selectedFilterValues=select=>[...select.selectedOptions].map(o=>o.value).filter(Boolean);
export function setFilterValues(select,values){const selected=[].concat(values??[]).filter(Boolean);for(const option of select.options)option.selected=selected.includes(option.value);}

export function setupFilterPickers(){
 const selects=[...document.querySelectorAll('.search-filters select')],triggers=new Map();let active=null,opener=null,original=[],committed=false;
 const dialog=document.createElement('dialog');dialog.id='filter-picker';dialog.setAttribute('aria-labelledby','filter-picker-title');
 dialog.innerHTML='<div class="filter-picker-head"><h2 id="filter-picker-title" tabindex="-1"></h2><button type="button" class="filter-picker-close" aria-label="Close filter picker">×</button></div><div class="filter-picker-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input type="search" id="filter-picker-query" aria-label="Search cuisines" placeholder="Find a cuisine…" autocomplete="off"></div><div id="filter-picker-options"></div>';
 dialog.insertAdjacentHTML('beforeend','<div class="filter-picker-footer"><button type="button" class="filter-picker-reset">Clear selection</button><button type="button" class="primary filter-picker-done">Done</button></div>');
 document.body.append(dialog);const query=dialog.querySelector('input'),list=dialog.querySelector('#filter-picker-options'),search=dialog.querySelector('.filter-picker-search');
 const chips=document.createElement('div');chips.id='active-filters';chips.setAttribute('aria-label','Active filters');document.querySelector('.search-filters').after(chips);
 const titleOf=select=>select.closest('label').firstChild.textContent.trim();
 const labelOf=(select,value)=>optionNames[select.id]&&value?optionNames[select.id][value]:value||select.options[0]?.textContent||'Any';
 function choose(value){if(!active)return;const chosen=new Set(selectedFilterValues(active));if(!value)chosen.clear();else if(chosen.has(value))chosen.delete(value);else chosen.add(value);setFilterValues(active,[...chosen]);sync();renderOptions();[...list.querySelectorAll('button')].find(b=>b.dataset.value===value)?.focus();}
 function renderOptions(){
  list.replaceChildren();if(!active)return;const needle=query.value.trim().toLocaleLowerCase();let lastGroup=null,visible=0;
  for(const option of active.options){
   const label=labelOf(active,option.value);if(needle&&!label.toLocaleLowerCase().includes(needle))continue;
   const group=option.parentElement.tagName==='OPTGROUP'?option.parentElement.label:'';
   if(group&&group!==lastGroup){const heading=document.createElement('h3');heading.className='filter-option-group';heading.textContent=group;list.append(heading);}lastGroup=group;
   const isSelected=option.value?option.selected:!selectedFilterValues(active).length;
   const button=document.createElement('button');button.type='button';button.className='filter-option';button.dataset.value=option.value;button.setAttribute('aria-pressed',String(isSelected));button.disabled=option.disabled;
   const name=document.createElement('span');name.className='filter-option-name';name.textContent=label;button.append(name);
   const count=option.textContent.split(' · ')[1];if(count){const badge=document.createElement('span');badge.className='filter-option-count';badge.textContent=count;button.append(badge);}
   const mark=document.createElement('span');mark.className='filter-option-check';if(isSelected)mark.innerHTML=check;button.append(mark);button.onclick=()=>choose(option.value);list.append(button);visible++;
  }
  if(!visible){const empty=document.createElement('p');empty.className='filter-picker-empty';empty.textContent='No matching cuisines';list.append(empty);}
 }
 for(const select of selects){
  select.multiple=true;select.hidden=true;select.tabIndex=-1;
  const trigger=document.createElement('button');trigger.type='button';trigger.className='filter-trigger';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls','filter-picker');trigger.setAttribute('aria-expanded','false');select.after(trigger);triggers.set(select,trigger);
  trigger.onclick=()=>{active=select;opener=trigger;original=selectedFilterValues(select);committed=false;query.value='';search.hidden=select.id!=='discover-cuisine';dialog.querySelector('h2').textContent=titleOf(select);renderOptions();dialog.showModal();trigger.setAttribute('aria-expanded','true');dialog.querySelector('h2').focus();list.scrollTop=0;};
  trigger.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();trigger.click();list.querySelector('button')?.focus();}};
 }
 query.oninput=renderOptions;query.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();list.querySelector('button')?.focus();}};
 list.onkeydown=e=>{const buttons=[...list.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);if(index<0)return;let next;if(e.key==='ArrowDown')next=(index+1)%buttons.length;if(e.key==='ArrowUp')next=(index-1+buttons.length)%buttons.length;if(e.key==='Home')next=0;if(e.key==='End')next=buttons.length-1;if(next!==undefined){e.preventDefault();buttons[next].focus();}};
 dialog.querySelector('.filter-picker-close').onclick=()=>dialog.close();dialog.onclick=e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}};
 dialog.querySelector('.filter-picker-reset').onclick=()=>{setFilterValues(active,[]);sync();renderOptions();};
 dialog.querySelector('.filter-picker-done').onclick=()=>{const select=active;committed=true;dialog.close();select.dispatchEvent(new Event('change',{bubbles:true}));};
 dialog.addEventListener('close',()=>{if(active&&!committed){setFilterValues(active,original);sync();}opener?.setAttribute('aria-expanded','false');opener?.focus();active=null;});
 function sync(){
  chips.replaceChildren();for(const select of selects){const trigger=triggers.get(select),values=selectedFilterValues(select),label=values.length?labelOf(select,values[0])+(values.length>1?' +'+(values.length-1):''):labelOf(select,'');trigger.replaceChildren();const name=document.createElement('span');name.textContent=label;trigger.append(name);trigger.insertAdjacentHTML('beforeend',chevron);trigger.classList.toggle('selected',!!values.length);trigger.setAttribute('aria-label',titleOf(select)+': '+values.map(v=>labelOf(select,v)).join(', '));
   for(const value of values){const label=labelOf(select,value),chip=document.createElement('button');chip.type='button';chip.className='active-filter-chip';chip.setAttribute('aria-label','Remove '+titleOf(select)+' filter: '+label);const text=document.createElement('span');text.textContent=label;const x=document.createElement('span');x.textContent='×';x.setAttribute('aria-hidden','true');chip.append(text,x);chip.onclick=()=>{setFilterValues(select,selectedFilterValues(select).filter(v=>v!==value));sync();trigger.focus();select.dispatchEvent(new Event('change',{bubbles:true}));};chips.append(chip);}
  }
  document.querySelector('#clear-filters').hidden=!selects.some(s=>selectedFilterValues(s).length);
 }
 sync();return {sync};
}
