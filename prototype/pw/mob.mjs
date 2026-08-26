import { chromium, devices } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const ctx = await b.newContext({ ...devices['iPhone 13'], hasTouch:true, isMobile:true });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(cible(),{waitUntil:'networkidle'});
// Le bandeau de seuils n'existe QUE dans l'espace auditeur (ADR-027) : le
// pilotage étant désormais l'espace d'ouverture, on s'y rend explicitement —
// c'est ce bandeau-là que ce harnais mesure.
await p.evaluate(()=>aller('plan.programme','auditeur'));

console.log('barre collante :', await p.evaluate(()=>Math.round(document.querySelector('.top').getBoundingClientRect().height))+' px sur 844');
console.log('rail replié en menu ?', await p.evaluate(()=>getComputedStyle(document.querySelector('.rail')).display==='none' && !!document.getElementById('railm')));
console.log('seuils sans défilement :', await p.evaluate(()=>{const bx=document.querySelector('.seuilbox'),de=document.documentElement;
  return [...bx.querySelectorAll('.s')].filter(e=>getComputedStyle(e).display!=='none')
    .map(c=>c.querySelector('.v').textContent+(c.getBoundingClientRect().right<=de.clientWidth+1?' ✓':' ✗')).join(' | ');}));
console.log('bandeau d’impact :', await p.evaluate(()=>{const de=document.documentElement;
  const cs=[...document.querySelectorAll('#impact .c')];
  return cs.length+' cellules, '+cs.filter(c=>c.getBoundingClientRect().right<=de.clientWidth+1).length+' visibles sans défilement';}));
// glissement continu du curseur de matérialité
const box = await p.evaluate(()=>{const r=document.getElementById('pm').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};});
await p.mouse.move(box.x+box.w*0.5, box.y+box.h/2); await p.mouse.down();
const seq=[]; for (const f of [0.6,0.75,0.9,0.98]){ await p.mouse.move(box.x+box.w*f, box.y+box.h/2); seq.push(await p.evaluate(()=>document.getElementById('pm').value)); }
await p.mouse.up();
console.log('drag continu :', seq.join(' → '), '| croissant :', seq.every((v,i)=>i===0||+v>=+seq[i-1]) && +seq[3]>+seq[0]);
// navigation par le menu déroulant
await p.evaluate(()=>{const s=document.getElementById('railm'); s.value='fsli:CA'; s.dispatchEvent(new Event('change',{bubbles:true}));});
await p.waitForTimeout(200);
console.log('menu → section :', await p.evaluate(()=>{
  // l'identité de la section vit désormais dans le bandeau collant
  const c=[...document.querySelectorAll('#impact .c')].find(e=>/poste/.test(e.querySelector('.k')?.textContent||''));
  return c ? c.querySelector('.v').textContent.trim() : 'ABSENT';
}));
console.log('débordement page :', await p.evaluate(()=>{const de=document.documentElement;return de.scrollWidth+' / '+de.clientWidth+(de.scrollWidth>de.clientWidth?' ✗':' ✓');}));
console.log('tableaux confinés :', await p.evaluate(()=>{const de=document.documentElement;
  const t=[...document.querySelectorAll('#main table')]; const w=t.filter(x=>x.closest('.tw'));
  return w.length+'/'+t.length+' dans un cadre défilant';}));
// thèmes
for (const esp of ['auditeur','client','pilotage']){
  await p.evaluate(x=>{const b=document.querySelector(`#spaces button[data-espace="${x}"]`); b.click();}, esp);
  await p.waitForTimeout(120);
  const c = await p.evaluate(()=>({ accent:getComputedStyle(document.body).getPropertyValue('--accent').trim(),
    seuils:!!document.getElementById('seuilbox'), bord:getComputedStyle(document.querySelector('.top')).borderTopColor }));
  console.log(`espace ${esp.padEnd(9)} accent ${c.accent.padEnd(20)} bandeau de seuils : ${c.seuils}`);
}
/* L'identité de la personne connectée : entièrement DANS l'écran, sur une
   seule ligne, et sans faire grossir le bandeau collant. Les trois se tiennent
   — corriger l'un en cassant l'autre est le piège que ce bloc garde. */
for (const esp of ['auditeur','client','pilotage']){
  await p.evaluate(x=>{const b=document.querySelector(`#spaces button[data-espace="${x}"]`); b.click();}, esp);
  await p.waitForTimeout(120);
  const q = await p.evaluate(()=>{
    const s=document.querySelector('#spaces .qui select'), r=s.getBoundingClientRect();
    return { droite:Math.round(r.right), vp:innerWidth,
      barre:Math.round(document.getElementById('spaces').getBoundingClientRect().height),
      top:Math.round(document.querySelector('.top').getBoundingClientRect().height),
      page:document.documentElement.scrollWidth, choisi:s.options[s.selectedIndex].textContent.trim() };
  });
  const bon = q.droite<=q.vp && q.page<=q.vp && q.barre<=40 && q.top<=300;
  console.log((bon?'  ok  ':'ÉCHEC ')+`identité lisible à 390 px · ${esp} — `
    + `bord droit ${q.droite}/${q.vp} · barre ${q.barre} px · bandeau ${q.top} px · « ${q.choisi} »`);
}
await p.click('#themebtn',{timeout:4000}); await p.waitForTimeout(150);
console.log('thème sombre :', await p.evaluate(()=>getComputedStyle(document.body).backgroundColor));
console.log('erreurs :', errs.length?errs.join(' | '):'aucune');
await b.close();
