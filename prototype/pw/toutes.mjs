import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();
await p.goto(cible(),{waitUntil:'networkidle'});
const out=[];
for (const esp of ['auditeur','client','pilotage']){
  await p.evaluate(x=>{S.espace=x; render();}, esp);
  const vs = await p.evaluate(()=>toutesDestinations());
  for (const v of vs){
    if (v.startsWith('fsli:') && v!=='fsli:CA') continue;
    await p.evaluate(x=>aller(x), v); await p.waitForTimeout(60);
    const r = await p.evaluate(()=>({m:document.getElementById('main').scrollHeight,
      blks:document.querySelectorAll('#main > .blk, #main > details.blk').length}));
    out.push({v, ecrans:Math.round(r.m/844*10)/10, blks:r.blks});
  }
}
out.sort((a,b)=>b.ecrans-a.ecrans);
for (const x of out) console.log(`${String(x.ecrans).padStart(5)} écrans  ${String(x.blks).padStart(2)} blocs  ${x.v}`);
await b.close();
