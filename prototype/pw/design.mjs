import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
import fs from 'fs';
const src = fs.readFileSync(process.argv[2],'utf8');
const css = src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
const cssNoFonts = css.replace(/@font-face\{[^}]*\}/g,'');

// ── compteurs statiques sur la feuille de style ──────────────────────────
const radii = [...new Set([...cssNoFonts.matchAll(/border-radius:\s*([^;}]+)/g)].flatMap(m=>m[1].split(/\s+/)))]
  .map(v=>v.trim()).filter(Boolean);
const radiiRes = [...new Set(radii.map(v=>/var\(--r\)/.test(v)?'var(--r) = 3px':/var\(--rond\)/.test(v)?'var(--rond) = 999px':v))];
const couleurs = [...new Set([...cssNoFonts.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m=>m[0]))];
const jetons = [...new Set([...cssNoFonts.matchAll(/--[a-z0-9-]+:\s*(#[0-9a-fA-F]{3,8})/g)].map(m=>m[1]))];
const horsJetons = couleurs.filter(c=>!jetons.includes(c));
const tailles = [...new Set([...cssNoFonts.matchAll(/font-size:\s*([^;}]+)/g)].map(m=>m[1].trim()))];
const taillesRes = [...new Set(tailles.map(v=>v.replace(/var\(--(t\d)\)/,'$1')))];
const ECHELLE = ['0','1px','2px','var(--s1)','var(--s2)','var(--s3)','var(--s4)','var(--s5)','var(--s6)','auto','inherit','0px'];
// les expressions calc() sont évaluées sur des jetons : on les retire avant de découper
// calc() contient des parenthèses imbriquées (var(--s6)) : on les retire en comptant
function sansCalc(v){
  let out='', i=0;
  while (i < v.length){
    const k = v.indexOf('calc(', i);
    if (k < 0){ out += v.slice(i); break; }
    out += v.slice(i, k) + 'CALC';
    let d = 1, j = k + 5;
    while (j < v.length && d > 0){ if (v[j] === '(') d++; else if (v[j] === ')') d--; j++; }
    i = j;
  }
  return out;
}
const esp = [...cssNoFonts.matchAll(/(?:padding|margin|gap)(?:-[a-z]+)?:\s*([^;}]+)/g)]
  .map(m=>sansCalc(m[1]))
  .flatMap(v=>v.split(/\s+/)).map(v=>v.trim()).filter(v=>v && v!=='CALC');
const horsEchelle = [...new Set(esp.filter(v=>!ECHELLE.includes(v) && !/^calc/.test(v) && !/^var\(--s/.test(v)))];

console.log('── COMPTEURS (feuille de style, hors @font-face) ────────────');
console.log(`  rayons de bordure distincts   : ${radiiRes.length}  (cible 2)   → ${radiiRes.join(' · ')}`);
console.log(`  couleurs littérales hors jeton: ${horsJetons.length}  (cible 0)   → ${horsJetons.join(' ') || '—'}`);
console.log(`  tailles de police distinctes  : ${taillesRes.length}  (cible ≤5)  → ${taillesRes.join(' · ')}`);
console.log(`  espacements hors échelle      : ${horsEchelle.length}  (cible 0)   → ${horsEchelle.join(' ') || '—'}`);
console.log(`  jetons de couleur définis     : ${jetons.length}`);

// ── vérifs dans le navigateur ────────────────────────────────────────────
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1600,height:1200}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const net=[]; p.on('request',r=>{if(!r.url().startsWith('file://')&&!r.url().startsWith('data:'))net.push(r.url());});
await p.goto(cible(),{waitUntil:'networkidle'});
console.log('\n── POLICES ──────────────────────────────────────────────────');
console.log(await p.evaluate(async ()=>{
  await document.fonts.ready;
  const f=[...document.fonts].map(x=>`${x.family} ${x.weight} ${x.status}`);
  const cv=document.createElement('canvas').getContext('2d');
  const w=(t,f)=>{cv.font='16px '+f;return cv.measureText(t).width;};
  const el=document.querySelector('.mono')||document.body;
  const fam=getComputedStyle(el).fontFamily;
  return `  faces chargées : ${f.join(' · ')}\n`
   + `  déclarée disponible : sans ${document.fonts.check('13px OttoSans')} · mono ${document.fonts.check('12px OttoMono')}\n`
   + `  appliquée au texte : ${getComputedStyle(document.body).fontFamily.split(',')[0]}\n`
   + `  appliquée aux chiffres : ${fam.split(',')[0]}\n`
   + `  chasse OttoMono vs Arial : ${(w('123456','OttoMono')/w('123456','Arial')).toFixed(3)} (≠ 1 ⇒ appliquée)`;}));

console.log('\n── COULEUR : uniquement les problèmes ───────────────────────');
console.log(await p.evaluate(()=>{
  aller('fsli:CA'); S.procOuverte='CA/DETAIL'; renderMain();
  const nonNeutre = [...document.querySelectorAll('#main *')].filter(e=>{
    const c=getComputedStyle(e).color, b=getComputedStyle(e).backgroundColor;
    const ok = /rgb\(20, 23, 26\)|rgb\(74, 83, 78\)|rgb\(121, 131, 125\)|rgb\(31, 77, 61\)/.test(c);
    return !ok && c!=='rgba(0, 0, 0, 0)' && !/rgb\(155, 44, 44\)|rgb\(138, 90, 0\)|rgb\(255, 255, 255\)/.test(c);
  });
  const teintes=[...new Set([...document.querySelectorAll('#main *')].map(e=>getComputedStyle(e).color))];
  return `  teintes d’encre employées : ${teintes.length}\n  ${teintes.join('\n  ')}`;}));
console.log('  élément(s) au gris du navigateur :', await p.evaluate(()=>
  [...document.querySelectorAll('#main *, .top *')].filter(e=>getComputedStyle(e).color==='rgb(128, 128, 128)')
    .map(e=>e.tagName.toLowerCase()+(e.className?'.'+String(e.className).split(' ')[0]:'')+(e.disabled?'[disabled]':''))
    .slice(0,6).join(' · ')||'aucun'));
console.log('  pastilles vertes / positives :', await p.evaluate(()=>document.querySelectorAll('#main .pill.ok').length));
console.log('  marques de pointage :', await p.evaluate(()=>{const m=[...document.querySelectorAll('#main .mk')];
  return m.length+' — '+[...new Set(m.map(x=>x.textContent))].join(' ')+' · légende : '+(document.querySelector('#main .legende')?'oui':'non');}));
console.log('  référence du papier en tête de panneau :', await p.evaluate(()=>
  [...document.querySelectorAll('#main .blk > header .why')].map(x=>x.textContent).filter(Boolean).slice(0,4).join(' · ')));
console.log('\n  accent par espace :', await p.evaluate(()=>ESPACES.map(e=>{S.espace=e.id;render();
  return e.lib+' '+getComputedStyle(document.body).getPropertyValue('--accent').trim();}).join(' | ')));
console.log('\nerreurs :', errs.length?errs.join(' | '):'aucune', '· réseau :', net.length?net.join(','):'aucun');
await b.close();
