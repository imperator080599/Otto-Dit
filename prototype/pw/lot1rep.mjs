import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1600,height:1100}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
const net=[]; p.on('request',r=>{if(!r.url().startsWith('file://'))net.push(r.url());});
await p.goto(cible(),{waitUntil:'networkidle'});
const ok=(t,c,d='')=>console.log((c?'  ok  ':'ÉCHEC ')+t+(d?' — '+d:''));

// 1. la proposition existe pour chaque travail, et rien n'est écrit
let r = await p.evaluate(()=>{
  const l = travaux(), prop = repartitionProposee();
  const amorce = new Set(codesAffectesAmorce());
  return { n:l.length, couverts:l.filter(t=>prop.get(t.code)&&prop.get(t.code).prep&&prop.get(t.code).rev).length,
    ecrits:l.filter(t=>t.preparateur||t.reviseur).map(t=>t.code),
    amorce:[...amorce], horsAmorce:l.filter(t=>(t.preparateur||t.reviseur)&&!amorce.has(t.code)).map(t=>t.code) };
});
ok('chaque travail a un préparateur ET un réviseur proposés', r.couverts===r.n, `${r.couverts}/${r.n}`);
// Le dossier ne part pas d'une feuille blanche : des affectations ont été
// faites avant qu'on ouvre l'outil. Elles sont NOMMÉES ; la proposition, elle,
// n'écrit toujours rien par-dessus.
ok('les seules affectations présentes sont celles de l’amorce, nommées',
   r.horsAmorce.length===0 && r.ecrits.length===r.amorce.length,
   `${r.ecrits.length} affecté(s), ${r.amorce.length} posé(s) à l’amorce, ${r.horsAmorce.length} hors amorce`);

// 2. la proposition respecte les règles du système
r = await p.evaluate(()=>{
  const prop = repartitionProposee();
  const mauvais = [], memePersonne = [], niv2 = [];
  for (const t of travaux()){
    const x = prop.get(t.code);
    if (x.prep === x.rev) memePersonne.push(t.code);
    if (!peutReviser(x.rev, t)) mauvais.push(t.code+':'+x.rev);
    if (t.niveauRevue===2 && USERS[x.rev].role!=='associe') niv2.push(t.code);
  }
  return { memePersonne, mauvais, niv2 };
});
ok('préparateur ≠ réviseur dans toute la proposition', r.memePersonne.length===0, r.memePersonne.slice(0,3).join(','));
ok('le réviseur proposé a toujours le droit de réviser', r.mauvais.length===0, r.mauvais.slice(0,3).join(','));
ok('un travail de niveau 2 est proposé à l’associée', r.niv2.length===0, r.niv2.slice(0,3).join(','));

// 3. la proposition est rejouable à l'identique
r = await p.evaluate(()=>{
  const a = [...repartitionProposee().entries()].map(([k,v])=>k+':'+v.prep+'/'+v.rev).join('|');
  _repCache.cle=''; _repCache.v=null;
  const b = [...repartitionProposee().entries()].map(([k,v])=>k+':'+v.prep+'/'+v.rev).join('|');
  return a===b;
});
ok('la proposition est rejouable à l’identique', r);

// 4. la charge est équilibrée à grade égal
r = await p.evaluate(()=>{
  const c = chargeParPersonne('proposee');
  const parGrade = {};
  for (const x of c){ (parGrade[x.u.grade]=parGrade[x.u.grade]||[]).push({n:x.u.nom,h:Math.round(x.h*4)/4,indispo:x.indispo}); }
  return parGrade;
});
console.log('     charge proposée par grade :');
for (const [g,l] of Object.entries(r)) console.log(`       ${g.padEnd(13)} ${l.map(x=>x.n+' '+x.h+' h'+(x.indispo?' ['+x.indispo+']':'')).join(' · ')}`);
// L'équilibre ne se mesure QUE sur les gens à qui l'on peut attribuer un
// travail : quelqu'un dont la déclaration d'indépendance n'est pas signée
// reçoit zéro, et c'est le comportement voulu, pas un déséquilibre.
const eq = Object.values(r).every(l=>{
  const h=l.filter(x=>!x.indispo).map(x=>x.h);
  return h.length<2 || Math.max(...h)-Math.min(...h) <= Math.max(...h)*0.25 + 4;});
ok('à grade égal, la charge est équilibrée entre les personnes disponibles', eq);
const indispo = Object.values(r).flat().filter(x=>x.indispo);
ok('les indisponibles reçoivent zéro, avec leur raison',
   indispo.every(x=>x.h===0), indispo.map(x=>`${x.n} (${x.indispo}) ${x.h} h`).join(' · ')||'aucun');

// 5. appliquer la proposition
r = await p.evaluate(()=>{
  const av = travaux().filter(t=>t.preparateur).length;
  const res = appliquerRepartition('vides');
  const ap = travaux().filter(t=>t.preparateur&&t.reviseur).length;
  const conformes = travaux().filter(t=>{const x=propositionDe(t.code);return t.preparateur===x.prep&&t.reviseur===x.rev;}).length;
  const amorce = new Set(codesAffectesAmorce());
  const horsAmorce = travaux().filter(t=>ecartProposition(t)&&!amorce.has(t.code)).map(t=>t.code);
  return { av, res, ap, n:travaux().length, conformes, amorce:amorce.size, horsAmorce,
           ecarts:travaux().map(ecartProposition).filter(Boolean).length };
});
ok('appliquer affecte tous les travaux non affectés', r.ap===r.n, `${r.ap}/${r.n}, ${r.res.n} affectations, ${r.res.refus} refus`);
// Les travaux posés à l'amorce ne sont pas conformes à la proposition, et
// c'est voulu : ce sont des affectations antérieures, pas des propositions.
// Tout écart à la proposition vient d'une affectation d'amorce — jamais
// d'appliquerRepartition, qui ne fait qu'écrire la proposition telle quelle.
// Une affectation d'amorce PEUT coïncider avec la proposition : ce n'est alors
// pas un écart, et c'est pour cela qu'on compare des ensembles, pas des nombres.
ok('appliquer n’écrit que la proposition : tout écart vient de l’amorce',
   r.horsAmorce.length===0 && r.conformes>=r.n-r.amorce,
   `${r.conformes}/${r.n} conformes · ${r.ecarts} écart(s), tous dans les ${r.amorce} d’amorce`);

// 6. la correction humaine est visible comme un écart
r = await p.evaluate(()=>{
  const amorce = new Set(codesAffectesAmorce());
  const avant = travaux().map(ecartProposition).filter(Boolean).length;
  const t = travaux().find(x=>x.nature==='section'&&!amorce.has(x.code));
  const autre = Object.keys(USERS).find(k=>k!==t.preparateur&&k!==t.reviseur&&peutRecevoirTravail(k));
  affecter(t.code,'preparateur',autre);
  const t2 = travaux().find(x=>x.code===t.code);
  return { ec:ecartProposition(t2), prop:propositionDe(t.code).prep, reel:t2.preparateur,
    avant, total:travaux().map(ecartProposition).filter(Boolean).length };
});
ok('corriger une ligne la marque « corrigé » sans changer la proposition',
   !!r.ec&&r.prop!==r.reel&&r.total===r.avant+1, `proposé ${r.prop}, retenu ${r.reel} · ${r.avant} → ${r.total} écart(s)`);

// 7. sélection multiple et attribution en lot
r = await p.evaluate(()=>{
  S.filtreTrav={phase:'bilan',nature:'',personne:'',statut:'',q:''};
  const vus = travaux().filter(x=>x.phase==='bilan');
  S.selTrav = vus.map(x=>x.code);
  const res = affecterEnLot(S.selTrav,'preparateur','karim');
  const n = travaux().filter(x=>x.phase==='bilan'&&x.preparateur==='karim').length;
  // et le lot refuse EN BLOC quelqu'un dont la déclaration ne vaut pas
  const bloque = affecterEnLot(S.selTrav,'preparateur','ines');
  return { sel:S.selTrav.length, res, n, vus:vus.length,
           bloque:{ n:bloque.n, refus:bloque.refus.length, why:(bloque.refus[0]||'') } };
});
ok('« tout sélectionner » puis affecter en lot applique à tout le résultat filtré',
   r.n===r.vus-r.res.refus.length, `${r.sel} sélectionnés, ${r.res.n} appliqués, ${r.res.refus.length} refusés`);
ok('le lot refuse ce que la règle interdit plutôt que de le forcer',
   r.res.refus.length===0||r.res.refus.every(x=>x.includes('différentes')||x.includes('exige')), r.res.refus.slice(0,2).join(' | '));
ok('le lot refuse EN BLOC une déclaration d’indépendance non valide',
   r.bloque.n===0 && r.bloque.refus===r.sel, `${r.bloque.n} appliqué(s), ${r.bloque.refus} refus · ${r.bloque.why}`);

// 8. un lot qui violerait la règle est refusé, travail par travail
r = await p.evaluate(()=>{
  const codes = travaux().filter(x=>x.niveauRevue===2).map(x=>x.code).slice(0,5);
  S.selTrav = codes;
  const res = affecterEnLot(codes,'reviseur','lea');   // léa est superviseur, pas associée
  return { codes:codes.length, res };
});
ok('affecter un réviseur non habilité en lot est refusé sur chaque travail',
   r.res.n===0&&r.res.refus.length===r.codes, r.res.refus[0]||'');

// 9. la vue rend la proposition, la charge et la barre de sélection
await p.evaluate(()=>{ S.filtreTrav={phase:'',nature:'',personne:'',statut:'',q:''}; S.selTrav=[]; aller('plan.programme','auditeur'); });
r = await p.evaluate(()=>{const h=document.querySelector('#main').innerHTML;
  return ['Répartition proposée','Charge — proposée et réelle','tout sélectionner',
          'Affecter en lot','appliquer la proposition','Proposé'].filter(x=>h.includes(x));});
ok('la vue rend la proposition, la charge et l’attribution en lot', r.length===6, r.length+'/6 : '+r.join(' · '));

console.log('\nerreurs :', errs.length?errs.join(' | '):'aucune');
console.log('réseau  :', net.length?net.join(','):'aucun');
await b.close();
