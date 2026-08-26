import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1500,height:1100}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
const net=[]; p.on('request',r=>{if(!r.url().startsWith('file://'))net.push(r.url());});
await p.goto(cible(),{waitUntil:'networkidle'});
console.log('chargement :', errs.length?errs.join(' | '):'aucune erreur');
for (const esp of ['auditeur','achevement','client','pilotage']){
  await p.evaluate(x=>{const b=document.querySelector(`#spaces button[data-espace="${x}"]`); if(b) b.click();}, esp);
  await p.waitForTimeout(80);
  const vs = await p.evaluate(()=>toutesDestinations());
  console.log(`\n── ${esp} (${vs.length} vues) ──`);
  for (const v of vs){
    await p.evaluate(x=>aller(x), v); await p.waitForTimeout(50);
    const h = await p.evaluate(()=>document.querySelector('#main .hd h1')?.textContent||'∅');
    console.log(`  ${v.padEnd(18)} → ${h}`);
  }
}
console.log('\nerreurs :', errs.length?errs.join(' | '):'aucune');
console.log('réseau :', net.length?net.join(','):'aucun');
await b.close();
