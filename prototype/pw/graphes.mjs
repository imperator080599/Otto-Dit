import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const ok=(t,c,d='')=>console.log((c?'  ok  ':'ÉCHEC ')+t+(d?' — '+d:''));
const errs=[];
for (const theme of ['clair','sombre']){
  const p = await (await b.newContext({viewport:{width:1500,height:1200}})).newPage();
  p.on('pageerror',e=>errs.push(theme+': '+e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(theme+': '+m.text());});
  await p.goto(cible(),{waitUntil:'networkidle'});
  await p.evaluate(x=>document.documentElement.dataset.theme = x==='sombre'?'dark':'light', theme);

  if (theme==='clair'){
    // 1. le pilotage est le premier espace, et celui d'ouverture
    let r = await p.evaluate(()=>({ espace:S.espace, vue:S.vue, ordre:ESPACES.map(x=>x.id),
      premierBouton:(document.querySelector('.spaces button')||{}).textContent,
      actif:(document.querySelector('.spaces button.on, .spaces button[aria-current], .spaces button.actif')||{}).textContent }));
    ok('le pilotage est le premier espace', r.ordre[0]==='pilotage', r.ordre.join(' · '));
    ok('et c’est celui qui s’ouvre', r.espace==='pilotage'&&r.vue==='pil.mission', `${r.espace}/${r.vue}`);
    ok('le premier bouton d’espace est le pilotage', /Pilotage/.test(r.premierBouton||''), r.premierBouton);

    // 2. cinq représentations
    r = await p.evaluate(()=>({
      svg:document.querySelectorAll('#main svg').length,
      titres:[...document.querySelectorAll('#main svg')].map(s=>s.getAttribute('aria-label')),
      h3:[...document.querySelectorAll('#main h3')].map(h=>h.textContent.trim()).slice(0,5),
    }));
    ok('cinq représentations graphiques', r.svg===5, r.titres.join(' · '));
    ok('chacune porte un intitulé accessible', r.titres.every(Boolean));
    ok('les cinq lectures demandées sont là',
       ['Avancement par section','Budget contre réalisé','Travaux achevés dans le temps',
        'Charge par personne','Demandes clients en retard'].every(t=>r.h3.includes(t)), r.h3.join(' · '));
  }

  // 3. CONTRAINTE : aucune couleur hors jetons dans les graphiques
  const r = await p.evaluate(()=>{
    const jetons = ['--ink','--ink-2','--ink-3','--line','--anomalie','--attention','--panel','--panel-2','--accent','--bg'];
    const cs = getComputedStyle(document.documentElement);
    const admis = new Set(jetons.map(j=>cs.getPropertyValue(j).trim().toLowerCase()));
    const rgb = h => { h=h.trim(); if(!/^#/.test(h)) return h;
      const n=h.length===4 ? h.slice(1).split('').map(c=>c+c).join('') : h.slice(1);
      return `rgb(${parseInt(n.slice(0,2),16)}, ${parseInt(n.slice(2,4),16)}, ${parseInt(n.slice(4,6),16)})`; };
    const admisRgb = new Set([...admis].map(rgb));
    const trouve = new Set(), hors = [];
    for (const el of document.querySelectorAll('#main svg *')){
      for (const prop of ['fill','stroke','color']){
        const v = getComputedStyle(el)[prop];
        if (!v || v==='none' || v==='rgba(0, 0, 0, 0)') continue;
        trouve.add(v);
        if (!admisRgb.has(v.toLowerCase()) && !/^url\(/.test(v)) hors.push(el.tagName+'.'+prop+'='+v);
      }
    }
    // dégradés et filtres : interdits
    const deg = document.querySelectorAll('#main svg linearGradient, #main svg radialGradient, #main svg filter').length;
    return { trouve:[...trouve], hors:[...new Set(hors)], deg,
      anomalie:cs.getPropertyValue('--anomalie').trim(), attention:cs.getPropertyValue('--attention').trim() };
  });
  console.log(`     [${theme}] ${r.trouve.length} teinte(s) employée(s) dans les graphiques`);
  ok(`[${theme}] aucune couleur hors jetons du système`, r.hors.length===0, r.hors.slice(0,4).join(' | ')||'aucune');
  ok(`[${theme}] aucun dégradé, aucun filtre`, r.deg===0, `${r.deg}`);

  // 4. la couleur ne dit qu'un problème
  const c = await p.evaluate(()=>{
    const cs = getComputedStyle(document.documentElement);
    const rgb = h => { h=h.trim();
      const n=h.length===4 ? h.slice(1).split('').map(x=>x+x).join('') : h.slice(1);
      return `rgb(${parseInt(n.slice(0,2),16)}, ${parseInt(n.slice(2,4),16)}, ${parseInt(n.slice(4,6),16)})`; };
    const pb = new Set([rgb(cs.getPropertyValue('--anomalie')), rgb(cs.getPropertyValue('--attention'))]);
    const colores = [...document.querySelectorAll('#main svg *')].filter(el=>{
      const f=getComputedStyle(el).fill, s=getComputedStyle(el).stroke;
      return pb.has(f)||pb.has(s);
    });
    // ce qui est coloré doit correspondre à un problème réel du dossier
    return { n:colores.length,
      retards:S.requetes.filter(retard).length,
      depassements:PHASES.filter(ph=>{const t=travaux().filter(x=>x.phase===ph.id&&!x.sansObjet);
        return t.reduce((a,x)=>a+x.heuresReel,0) > t.reduce((a,x)=>a+budget(x),0);}).length,
      obstacles:postesEnPerimetre().filter(p=>obstaclesVisa(p).length).length,
      indispo:chargeParPersonne('reelle').filter(x=>x.indispo).length };
  });
  const problemes = c.retards + c.depassements + c.obstacles + c.indispo;
  ok(`[${theme}] la couleur n’apparaît que là où il y a un problème`,
     c.n>0 && c.n <= problemes*3,
     `${c.n} élément(s) coloré(s) pour ${problemes} problème(s) : ${c.retards} retards, `
     + `${c.depassements} dépassements, ${c.obstacles} sections à obstacle, ${c.indispo} indisponibles`);
  await p.close();
}

// 5. les graphiques ne débordent pas sur téléphone
const p2 = await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();
p2.on('pageerror',e=>errs.push('390: '+e.message));
await p2.goto(cible(),{waitUntil:'networkidle'});
const m = await p2.evaluate(()=>({
  deborde:document.documentElement.scrollWidth > window.innerWidth,
  svg:document.querySelectorAll('#main svg').length,
  larges:[...document.querySelectorAll('#main svg')]
    .filter(s=>s.getBoundingClientRect().width > window.innerWidth).length,
}));
ok('à 390 px, les graphiques ne débordent pas de la page', !m.deborde && m.larges===0,
   `${m.svg} graphiques · ${m.larges} plus larges que l’écran`);
await p2.close();

console.log('erreurs :', errs.length?errs:'aucune');
await b.close();
process.exit(0);
