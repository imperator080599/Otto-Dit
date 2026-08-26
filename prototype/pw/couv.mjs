import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext()).newPage();
await p.goto(cible(),{waitUntil:'networkidle'});
const r = await p.evaluate(()=>{
  const out=[];
  for (const [ref,a] of Object.entries(ANOMALIES_PIECES)){
    if (a.t!=='montant') continue;
    let dansPop=[], dansEch=[];
    for (const p0 of postesEnPerimetre()) for (const pr of proceduresRequises(p0)){
      if (!pr.ech) continue;
      const e = echantillonProc(p0,pr); if(!e) continue;
      if (e.pop.items.some(x=>x.e&&x.e.pieceRef===ref)) dansPop.push(p0.code+'/'+pr.code);
      if (e.retenus.some(x=>x.e&&x.e.pieceRef===ref)) dansEch.push(p0.code+'/'+pr.code);
    }
    out.push({ref, delta:a.delta/100, dansPop:dansPop.join(','), dansEch:dansEch.join(',')});
  }
  return out;
});
for (const x of r) console.log(x.ref.padEnd(14), String(x.delta.toFixed(2)).padStart(9),
  ' pop:', (x.dansPop||'—').padEnd(34), ' éch:', x.dansEch||'—');
await b.close();
