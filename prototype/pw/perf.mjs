import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1500,height:1200}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(cible(),{waitUntil:'networkidle'});
await p.evaluate(()=>{ S.dest.CA='concl'; aller('fsli:CA'); }); await p.waitForTimeout(200);
const t0=Date.now(); await p.click('#sec-concl');
await p.keyboard.type('Les procédures requises ont été exécutées sur la sélection.',{delay:0});
const dt=Date.now()-t0;
await p.waitForTimeout(400);
const v = await p.evaluate(()=>document.getElementById('sec-concl').value);
console.log(`frappe : ${v.length} car. en ${dt} ms (${(dt/v.length).toFixed(1)} ms/touche) — texte intact : ${v==='Les procédures requises ont été exécutées sur la sélection.'}`);
console.log('obstacle levé après la frappe :', await p.evaluate(()=>{
  const o = obstaclesVisa(postesCalcules().find(x=>x.code==='CA'));
  return !o.some(x=>/conclusion de section non rédigée/.test(x));
}));
console.log('compteur de la destination mis à jour :', await p.evaluate(()=>{
  renderMain(); const b=[...document.querySelectorAll('.destnav .dest')].find(x=>/Conclusion/.test(x.textContent));
  return b ? b.textContent.trim() : 'absent';
}));
// latence d'un rendu complet
console.log(await p.evaluate(()=>{
  const t=performance.now(); for(let i=0;i<5;i++) renderMain(); const a=(performance.now()-t)/5;
  const t2=performance.now(); for(let i=0;i<5;i++) renderImpact(); const c=(performance.now()-t2)/5;
  return `rendu d'une section : ${a.toFixed(0)} ms · bandeau d'impact : ${c.toFixed(0)} ms`;}));
// le curseur reste fluide
const box = await p.evaluate(()=>{const r=document.getElementById('pm').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};});
await p.mouse.move(box.x+box.w*0.3,box.y+box.h/2); await p.mouse.down();
const t3=Date.now(); for(let i=0;i<12;i++) await p.mouse.move(box.x+box.w*(0.3+i*0.05), box.y+box.h/2);
await p.mouse.up();
console.log(`12 mouvements de curseur en ${Date.now()-t3} ms`);
console.log('erreurs :', errs.length?errs.join(' | '):'aucune');
await b.close();
