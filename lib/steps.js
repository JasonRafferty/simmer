// Presentation only: keep every instruction, including temperatures and timings.
export function instructionSteps(text){
  return String(text??'').replace(/\r\n/g,'\n').split(/\n+/)
    .map(s=>s.replace(/^(?:step\s*\d+\s*[:.)]?\s*|\d+[.) :]\s*)/i,'').trim()).filter(Boolean)
    .flatMap(s=>s.length>260?s.split(/(?<=[.!?])\s+(?=[A-Z])/).map(t=>t.trim()).filter(Boolean):[s]);
}
