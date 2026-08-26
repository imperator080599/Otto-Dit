import { chromium, devices } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
for (const [nom, opts] of [['bureau',{viewport:{width:1440,height:1000}}],['téléphone',{...devices['iPhone 13'],hasTouch:true,isMobile:true}]]){
  const p = await (await b.newContext(opts)).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(cible(),{waitUntil:'networkidle'});
  const th = () => p.evaluate(()=>document.documentElement.dataset.theme || '(système)');
  const bg = () => p.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  const a=[await th(),await bg()];
  await p.click('#themebtn',{timeout:4000}); await p.waitForTimeout(150);
  const c=[await th(),await bg()];
  await p.click('#themebtn',{timeout:4000}); await p.waitForTimeout(150);
  const d=[await th(),await bg()];
  // le bouton ne doit recouvrir aucun texte de l'en-tête
  const chevauche = await p.evaluate(()=>{const r=document.getElementById('themebtn').getBoundingClientRect();
    return [...document.querySelectorAll('.top .id > *')].filter(e=>{const q=e.getBoundingClientRect();
      return getComputedStyle(e).display!=='none' && q.right>r.left && q.left<r.right && q.bottom>r.top && q.top<r.bottom;}).map(e=>e.textContent.slice(0,30));});
  console.log(`${nom} : ${a.join(' ')} → ${c.join(' ')} → ${d.join(' ')} | chevauchement en-tête : ${chevauche.length?chevauche.join(' / '):'aucun'} | erreurs : ${errs.length?errs.join('|'):'aucune'}`);
}
await b.close();
