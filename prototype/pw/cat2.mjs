import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1500,height:1100}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
await p.goto(cible(),{waitUntil:'networkidle'});
const ok=(t,c,d='')=>console.log((c?'  ok  ':'ÉCHEC ')+t+(d?' — '+d:''));

let r = await p.evaluate(()=>({
  version:CATALOGUE_VERSION, n:CAT_PROCEDURES.length,
  cycles:[...new Set(CAT_PROCEDURES.map(x=>x.cycle))].length,
  sens:[...new Set(CAT_PROCEDURES.map(x=>x.sens))],
  inverse:CAT_PROCEDURES.filter(x=>x.sens==='piece_vers_gl').map(x=>x.code),
  sources:Object.keys(CAT_SOURCES).length,
  nonVerif:Object.values(CAT_SOURCES).filter(s=>!s.verifie).length,
}));
ok('le catalogue est chargé depuis les données', r.n>=50&&!!r.version, `v${r.version} · ${r.n} procédures · ${r.cycles} cycles`);
ok('les sept sens de test sont présents', r.sens.length===7, r.sens.join(' · '));
ok('le SENS INVERSE existe et porte de vraies procédures', r.inverse.length>=6, r.inverse.join(' · '));
ok('toutes les sources sont marquées non vérifiées', r.nonVerif===r.sources, `${r.nonVerif}/${r.sources}`);

// la recherche de passifs non enregistrés existe et s'exécute
r = await p.evaluate(()=>{
  const p0=postesCalcules().find(x=>x.code==='FOURN');
  const pr=proceduresRequises(p0).find(x=>x.code==='FOURN-SUL');
  if (!pr) return { absente:true };
  const e=echantillonProc(p0,pr);
  return { lib:pr.lib, sens:pr.sens, assertion:pr.a, unite:pr.unite,
    pop:e?e.pop.items.length:0, masse:e?e.pop.masse:0, retenus:e?e.retenus.length:0,
    source:e?e.pop.source:'', docs:docsAttendusProc(p0,pr) };
});
ok('la recherche de passifs non enregistrés est au programme du cycle fournisseurs', !r.absente, r.lib||'');
ok('elle va de la pièce vers le grand livre', r.sens==='piece_vers_gl'&&r.assertion==='exhaustivite',
   `${r.sens} · assertion ${r.assertion} · unité « ${r.unite} »`);
ok('elle s’exécute sur une population réelle', r.pop>0, `${r.pop} décaissements postérieurs · ${r.retenus} retenus · source : ${r.source}`);
ok('elle attend la facture ET le bon de réception', r.docs.length===2, r.docs.join(' + '));

// elle détecte les passifs omis
r = await p.evaluate(()=>{
  const p0=postesCalcules().find(x=>x.code==='FOURN');
  const pr=proceduresRequises(p0).find(x=>x.code==='FOURN-SUL');
  const e=echantillonProc(p0,pr);
  const omis=e.pop.items.filter(x=>x.post&&x.post.omis);
  const retOmis=e.retenus.filter(x=>x.post&&x.post.omis);
  // on « lit les pièces » et l'on regarde ce que le contrôle dit
  for (const c of controles(p0,pr)){
    const v=c.ch.val(c.ligne.x);
    c.ligne.champs[c.cle]=c.ch.type==='montant'?(v/100).toFixed(2).replace('.',','):c.ch.type==='bool'?(v?'oui':'non'):String(v);
  }
  const ec=ecartsProc(p0,pr);
  return { omis:omis.length, retOmis:retOmis.length, ecarts:ec.length,
    surOmis:ec.filter(c=>c.ligne.x.post&&c.ligne.x.post.omis).length,
    refs:[...new Set(ec.map(c=>c.ligne.cle))].slice(0,5) };
});
ok('des passifs omis sont dans la population', r.omis===3, `${r.omis} posés`);
ok('tous les passifs omis sont testés — aucun ne dépend du tirage', r.retOmis===3, `${r.retOmis}/3 retenus`);
ok('la procédure les relève comme écarts', r.surOmis===3,
   `${r.ecarts} écart(s) dont ${r.surOmis} sur un passif omis · ${r.refs.join(', ')}`);
ok('et ne relève RIEN d’autre — aucun faux positif sur 60 décaissements', r.ecarts===3,
   `${r.ecarts} écart(s) au total`);

// la sélection est imposée par le catalogue, pas choisie à l'écran
r = await p.evaluate(()=>{
  const p0=postesCalcules().find(x=>x.code==='FOURN');
  const pr=proceduresRequises(p0).find(x=>x.code==='FOURN-SUL');
  const e=echantillonProc(p0,pr);
  const st=proc(p0.code,pr.code); st.methode='sum';         // on essaie de la changer
  const e2=echantillonProc(p0,pr);
  const ctr=controles(p0,pr);
  const rs=ctr.filter(c=>c.ch.releveSeul);
  return { meth:e.methode, imposee:!!e.imposee, gardeFou:e.gardeFou,
    couverture:e.taux, apresTentative:e2.methode,
    releveSeul:rs.length, releveSeulEcarts:rs.filter(c=>c.saisi&&!c.conforme).length,
    repartition:statPost() };
});
ok('la sélection de la recherche de passifs est exhaustive et imposée',
   r.meth==='exhaustive'&&r.imposee&&r.couverture===1, `${r.meth} · couverture ${Math.round(r.couverture*100)} %`);
ok('elle ne peut pas être ramenée à un sondage depuis l’écran', r.apresTentative==='exhaustive', r.apresTentative);
ok('le garde-fou d’exhaustivité ne s’y applique pas — elle est décidée', r.gardeFou===false);
ok('des champs sont relevés sans être contrôlés', r.releveSeul>0, `${r.releveSeul} contrôle(s) « relevé seul »`);
ok('un champ relevé seul ne produit jamais d’écart', r.releveSeulEcarts===0, `${r.releveSeulEcarts}`);
ok('l’extrait postérieur mêle les trois natures de décaissement',
   r.repartition.regleDetteComptabilisee>10&&r.repartition.chargeExerciceSuivant>10&&r.repartition.omis===3,
   `${r.repartition.regleDetteComptabilisee} règlent une dette comptabilisée · `
  +`${r.repartition.chargeExerciceSuivant} charges de l’exercice suivant · ${r.repartition.omis} passifs omis`);

// la méthode est lisible à l'écran, sources comprises
r = await p.evaluate(()=>{
  const p0=postesCalcules().find(x=>x.code==='FOURN');
  const pr=proceduresRequises(p0).find(x=>x.code==='FOURN-SUL');
  const h=blocMethode(p0,pr);
  return { sens:h.includes('de la pièce vers le grand livre')||h.includes(libSens('piece_vers_gl')),
    objectif:h.includes('centrale du cycle'), controle:h.includes('RECHERCHER'),
    unverified:h.includes('UNVERIFIED'), version:h.includes(CATALOGUE_VERSION) };
});
ok('la méthode est affichée là où la procédure s’exécute',
   r.sens&&r.objectif&&r.controle, `sens ${r.sens} · objectif ${r.objectif} · contrôle ${r.controle}`);
ok('les sources y sont citées et marquées non vérifiées', r.unverified&&r.version);

// les procédures cataloguées mais non exécutables le disent
r = await p.evaluate(()=>{
  const ne=PROCEDURES.filter(x=>x.nonExecutable);
  const p0=postesCalcules().find(x=>x.code==='STOCKS');
  const inv=proceduresRequises(p0).find(x=>x.code==='STOCKS-INV');
  const menteuses=[], orphelins=[];
  for (const p1 of postesEnPerimetre()) for (const pr of proceduresRequises(p1)){
    if (pr.ech && !echantillonProc(p1,pr)) menteuses.push(p1.code+'/'+pr.code);
  }
  for (const pr of PROCEDURES){
    const nom = pr.predicat;
    if (nom!=='non_implemente' && !PREDICATS[nom] && !PREDICATS_ABSENTS[nom]) orphelins.push(pr.code);
  }
  return { n:ne.length, exemples:ne.slice(0,3).map(x=>x.code),
    sansRaison:ne.filter(x=>!x.pourquoi).length,
    menteuses:[...new Set(menteuses)], orphelins,
    inv:!!inv, invEch:inv?inv.ech:null, invNote:inv?!!inv.note:null,
    pop:inv?population(p0,inv):null };
});
ok('des procédures sont cataloguées sans être exécutables ici', r.n>=15, `${r.n} sur ${56}`);
ok('chacune porte la RAISON de sa non-exécution', r.sansRaison===0,
   r.sansRaison ? r.sansRaison+' sans raison' : 'toutes');
ok('aucune procédure ne se dit échantillonnée sans population calculable',
   r.menteuses.length===0, r.menteuses.join(', ')||'aucune');
ok('tout prédicat nommé par le catalogue est implémenté ou déclaré absent',
   r.orphelins.length===0, r.orphelins.join(', ')||'aucun');
ok('l’assistance à l’inventaire est au programme des stocks', r.inv);
ok('elle ne produit aucune sélection et porte sa raison', r.invEch===false&&r.invNote&&r.pop===null);

// les cycles portent bien des procédures propres
r = await p.evaluate(()=>{
  const out={};
  for (const p0 of postesCalcules()){
    const pr=proceduresRequises(p0).filter(x=>x.cycle!=='*');
    if (pr.length) out[p0.code]=pr.map(x=>x.code.replace(p0.code+'-','').replace(/^[A-Z_]+-/,''));
  }
  return out;
});
console.log('     procédures propres par cycle :');
for (const [k,v] of Object.entries(r)) console.log(`       ${k.padEnd(11)} ${v.join(' ')}`);
ok('au moins huit cycles portent des procédures propres', Object.keys(r).length>=8, Object.keys(r).length+' cycles');

console.log('erreurs :', errs.length?[...new Set(errs)].join(' | '):'aucune');
await b.close();
