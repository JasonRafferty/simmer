import {instructionSteps} from '/steps.js';

// Full-screen, one step at a time, screen kept awake, and tap-to-start timers read from the method.
const durationPattern=/(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi;
export function stepTimers(step){
 const timers=[];
 for(const m of String(step).matchAll(durationPattern)){
  const unit=m[3].toLowerCase(),scale=unit.startsWith('h')?3600:unit.startsWith('s')?1:60,seconds=Math.round(Number(m[1])*scale);
  if(seconds>0&&seconds<=86400)timers.push({seconds,label:m[2]?`${m[1]}–${m[2]} ${unit.startsWith('h')?'hr':unit.startsWith('s')?'sec':'min'}`:`${m[1]} ${unit.startsWith('h')?'hr':unit.startsWith('s')?'sec':'min'}`});
 }
 return timers;
}
const clock=s=>{s=Math.max(0,Math.ceil(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=String(s%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${sec}`:`${m}:${sec}`;};

export function setupCookMode({esc,toast}){
 const dialog=document.createElement('dialog');dialog.id='cook';dialog.className='cook-mode';dialog.setAttribute('aria-labelledby','cook-title');
 dialog.innerHTML='<div class="cook-head"><div><p class="eyebrow">Cook mode</p><h2 id="cook-title" tabindex="-1"></h2></div><button type="button" class="secondary" id="cook-ingredients-toggle" aria-expanded="false">Ingredients</button><button type="button" class="cook-close" aria-label="Exit cook mode">×</button></div><div id="cook-timers" aria-live="polite"></div><ul id="cook-ingredients" hidden></ul><p id="cook-progress" class="hint"></p><div id="cook-step" class="cook-step"></div><div id="cook-step-timers"></div><div class="cook-nav"><button type="button" class="secondary" id="cook-prev">← Back</button><button type="button" class="primary" id="cook-next">Next →</button></div>';
 document.body.append(dialog);
 const $=s=>dialog.querySelector(s);let steps=[],index=0,wakeLock=null,timers=[],ticker=null,audio=null;
 const keepAwake=async()=>{try{if(dialog.open&&navigator.wakeLock&&!wakeLock){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;});}}catch{}};
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')keepAwake();});
 function beep(){try{audio??=new AudioContext();for(let i=0;i<3;i++){const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+i*0.45;o.frequency.value=880;g.gain.setValueAtTime(0.25,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.35);o.connect(g).connect(audio.destination);o.start(t);o.stop(t+0.36);}}catch{}navigator.vibrate?.([300,150,300,150,300]);}
 function renderTimers(){
  const now=Date.now();
  for(const t of timers)if(!t.done&&t.end<=now){t.done=true;beep();toast(`⏱ ${t.label} timer done`);}
  $('#cook-timers').innerHTML=timers.map((t,i)=>`<div class="cook-timer ${t.done?'done':''}"><span>${esc(t.label)}</span><b>${t.done?'Done!':clock((t.end-now)/1000)}</b><button type="button" data-cancel-timer="${i}" aria-label="${t.done?'Dismiss':'Cancel'} ${esc(t.label)} timer">×</button></div>`).join('');
  if(!timers.length){clearInterval(ticker);ticker=null;}
 }
 function startTimer(seconds,label){timers.push({end:Date.now()+seconds*1000,label,done:false});audio??=new AudioContext();if(!ticker)ticker=setInterval(renderTimers,500);renderTimers();}
 function render(){
  $('#cook-progress').textContent=`Step ${index+1} of ${steps.length}`;$('#cook-step').textContent=steps[index]??'';
  $('#cook-step-timers').innerHTML=stepTimers(steps[index]).map(t=>`<button type="button" class="cook-start-timer" data-seconds="${t.seconds}" data-label="${esc(t.label)}">⏱ Start ${esc(t.label)} timer</button>`).join('');
  $('#cook-prev').disabled=index===0;$('#cook-next').textContent=index===steps.length-1?'Finish ✓':'Next →';
 }
 dialog.addEventListener('click',e=>{
  const start=e.target.closest('[data-seconds]');if(start)startTimer(Number(start.dataset.seconds),start.dataset.label);
  const cancel=e.target.closest('[data-cancel-timer]');if(cancel){timers.splice(Number(cancel.dataset.cancelTimer),1);renderTimers();}
  const item=e.target.closest('[data-cook-ingredient]');if(item)item.classList.toggle('done');
 });
 $('#cook-prev').onclick=()=>{if(index>0){index--;render();}};
 $('#cook-next').onclick=()=>{if(index<steps.length-1){index++;render();}else dialog.close();};
 $('.cook-close').onclick=()=>dialog.close();
 $('#cook-ingredients-toggle').onclick=e=>{const list=$('#cook-ingredients');list.hidden=!list.hidden;e.target.setAttribute('aria-expanded',String(!list.hidden));};
 dialog.addEventListener('keydown',e=>{if(e.key==='ArrowRight')$('#cook-next').click();if(e.key==='ArrowLeft')$('#cook-prev').click();});
 dialog.addEventListener('close',()=>{wakeLock?.release().catch(()=>{});wakeLock=null;if(timers.some(t=>!t.done))toast('Cook mode closed · your timers are still running');});
 return {open(recipe,ingredients){
  steps=instructionSteps(recipe.instructions);if(!steps.length)return toast('This recipe has no method steps to cook from.');index=0;
  $('#cook-title').textContent=recipe.name;$('#cook-ingredients').innerHTML=ingredients.map(i=>`<li><button type="button" data-cook-ingredient>${esc(i)}</button></li>`).join('');$('#cook-ingredients').hidden=true;$('#cook-ingredients-toggle').setAttribute('aria-expanded','false');
  render();renderTimers();if(timers.length&&!ticker)ticker=setInterval(renderTimers,500);dialog.showModal();$('#cook-title').focus();keepAwake();
 }};
}
