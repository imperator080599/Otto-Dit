import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(cible(),{waitUntil:'networkidle'});
const ok=(t,c,d='')=>console.log((c?'  ok  ':'ÉCHEC ')+t+(d?' — '+d:''));
const h = () => p.evaluate(()=>Math.round(document.querySelector('.top').getBoundingClientRect().height));
const etat = () => p.evaluate(()=>document.documentElement.dataset.bandeau||'plein');

await p.evaluate(()=>{ S.dest.CA='plan'; aller('fsli:CA','auditeur'); });
await p.waitForTimeout(200);
const plein = await h();
ok('au repos, le bandeau est complet', await etat()==='plein', `${plein} px`);

// on descend
await p.evaluate(()=>window.scrollBy(0,300)); await p.waitForTimeout(150);
const reduit = await h();
const part = Math.round(reduit/844*1000)/10;
ok('dès le premier défilement, il se réduit', await etat()==='reduit', `${plein} → ${reduit} px`);
ok('l’état réduit tient sous 15 % de l’écran', part<=15, `${part} % de 844 px — cible ≤ 15 %`);
console.log(`     hauteur réduite ${reduit} px · ${part} % de l’écran · ${844-reduit} px utiles (${Math.round((844-reduit)/844*1000)/10} %)`);

// ce qui reste visible
let r = await p.evaluate(()=>[...document.querySelectorAll('#impact .c')]
  .filter(e=>e.getBoundingClientRect().height>0).map(e=>e.querySelector('.v').textContent.trim()));
ok('seules les cellules essentielles restent', r.length===3, r.join(' · '));
r = await p.evaluate(()=>({ nom:!!document.querySelector('.brand b')?.getBoundingClientRect().height,
  curseurs:document.querySelector('.seuils')?.getBoundingClientRect().height||0,
  espaces:document.querySelector('.spaces')?.getBoundingClientRect().height||0 }));
ok('le nom de l’entité reste, les curseurs et les espaces disparaissent',
   r.nom&&r.curseurs===0&&r.espaces===0);

// on remonte : il se rétablit
await p.evaluate(()=>window.scrollBy(0,-120)); await p.waitForTimeout(200);
ok('en remontant, le bandeau se rétablit', await etat()==='plein', `${await h()} px`);

// pas de saut : le contenu sous les yeux reste le même
r = await p.evaluate(async ()=>{
  window.scrollTo(0,0); await new Promise(r=>setTimeout(r,120));
  window.scrollBy(0,400); await new Promise(r=>setTimeout(r,200));
  const cible = document.elementFromPoint(195, 500);
  const avant = cible ? cible.getBoundingClientRect().top : null;
  const txt = cible ? cible.textContent.slice(0,30) : '';
  window.scrollBy(0,120); await new Promise(r=>setTimeout(r,200));
  window.scrollBy(0,-120); await new Promise(r=>setTimeout(r,250));
  const apres = cible ? cible.getBoundingClientRect().top : null;
  return { avant:Math.round(avant), apres:Math.round(apres), txt };
});
ok('aller-retour sans dérive du contenu', Math.abs(r.avant-r.apres)<=8,
   `« ${r.txt.trim()} » : ${r.avant} px → ${r.apres} px`);

// la même règle sur les autres vues et les autres espaces
r = await p.evaluate(async ()=>{
  const out=[];
  for (const [esp,v] of [['auditeur','plan.je'],['auditeur','plan.versions'],['auditeur','plan.ajust'],['pilotage','pil.mission'],['client','cli.vue']]){
    S.espace=esp; aller(v);
    window.scrollTo(0,0); await new Promise(r=>setTimeout(r,80));
    const plein=Math.round(document.querySelector('.top').getBoundingClientRect().height);
    window.scrollBy(0,300); await new Promise(r=>setTimeout(r,150));
    const red=Math.round(document.querySelector('.top').getBoundingClientRect().height);
    out.push({ v, plein, red, part:Math.round(red/844*1000)/10 });
  }
  return out;
});
for (const x of r) console.log(`     ${x.v.padEnd(14)} ${x.plein} → ${x.red} px (${x.part} %)`);
ok('tous les bandeaux collants se réduisent sous 15 %', r.every(x=>x.part<=15));

console.log('erreurs :', errs.length?[...new Set(errs)].join(' | '):'aucune');
await b.close();
