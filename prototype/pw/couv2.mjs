import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext()).newPage();
await p.goto(cible(),{waitUntil:'networkidle'});
const r = await p.evaluate(()=>{
  const grosses = Object.entries(ANOMALIES_PIECES)
    .filter(([,a])=>a.t==='montant' && Math.abs(a.delta)>=seuils().CTT).map(([ref])=>ref);
  const bilan = (nom) => {
    const prises = new Set();
    for (const p0 of postesEnPerimetre()) for (const pr of proceduresRequises(p0)){
      if (!pr.ech) continue;
      const e = echantillonProc(p0,pr);
      for (const x of e.retenus) if (x.e && grosses.includes(x.e.pieceRef)) prises.add(x.e.pieceRef);
    }
    const elems = [...postesEnPerimetre()].flatMap(p0=>proceduresRequises(p0).filter(x=>x.ech)
      .map(pr=>echantillonProc(p0,pr).retenus.length)).reduce((a,x)=>a+x,0);
    return { nom, prises:[...prises].length, manquees:grosses.filter(x=>!prises.has(x)), elems };
  };
  const a = bilan('strate exhaustive au seuil, tirage à la taille de risque');
  // toutes les procédures en SUM, à la taille qui ramène l'intervalle au seuil
  for (const p0 of postesEnPerimetre()) for (const pr of proceduresRequises(p0)){
    if (!pr.ech) continue;
    const e = echantillonProc(p0,pr);
    const st = proc(p0.code, pr.code);
    st.methode='sum'; st.taille=e.nAdequate;
  }
  _echProcCache.clear();
  const c = bilan('unités monétaires, intervalle ramené au seuil');
  return { total:grosses.length, a, c };
});
for (const x of [r.a, r.c])
  console.log(`${x.nom.padEnd(52)} ${x.prises}/${r.total} anomalies ≥ seuil de remontée · ${x.elems} éléments à tester`
    + (x.manquees.length?`\n    manquées : ${x.manquees.join(', ')}`:''));
await b.close();
