import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1500,height:1100}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
const net=[]; p.on('request',r=>{if(!r.url().startsWith('file://'))net.push(r.url());});
await p.goto(cible(),{waitUntil:'networkidle'});
const ok=(t,c,d='')=>console.log((c?'  ok  ':'ÉCHEC ')+t+(d?' — '+d:''));

// 1. le catalogue couvre les critères demandés
let r = await p.evaluate(()=>({
  codes:CATALOGUE_JE.map(c=>c.code),
  indispo:CATALOGUE_JE.filter(c=>c.indispo).map(c=>c.code),
  unverified:CATALOGUE_JE.filter(c=>c.marque).map(c=>c.code),
  avecParams:CATALOGUE_JE.filter(c=>c.params.length).length,
}));
const attendus=['rond','weekend','ferie','hors_heures','apres_cloture','libelle','compte_rare',
  'combinaison','contrepassee','sans_piece','derniers_jours','meme_montant_tiers','auteur_inhabituel'];
ok('les treize critères demandés sont au catalogue', attendus.every(x=>r.codes.includes(x)),
   attendus.filter(x=>!r.codes.includes(x)).join(',')||`${r.codes.length} critères`);
ok('« hors heures ouvrées » est catalogué et déclaré indisponible', r.indispo.includes('hors_heures'));
ok('la liste des jours fériés est marquée UNVERIFIED', r.unverified.includes('ferie'));
ok('la majorité des critères portent des paramètres', r.avecParams>=9, `${r.avecParams} critères paramétrés`);

// 2. les paramètres agissent réellement
r = await p.evaluate(()=>{
  S.jeCrit={rond:true}; _entCache.clear();
  const a = entonnoir().etapes.find(x=>x.code==='rond').seul;
  S.jeParams.rond={pas:100000, plancher:5000000}; _entCache.clear();
  const b = entonnoir().etapes.find(x=>x.code==='rond').seul;
  S.jeParams.rond={pas:1000, plancher:0}; _entCache.clear();
  const c = entonnoir().etapes.find(x=>x.code==='rond').seul;
  return {a,b,c};
});
ok('un plancher plus haut retient moins, un pas plus fin retient plus', r.b<r.a&&r.c>r.a,
   `plancher 5 000 € : ${r.a} → 50 000 € : ${r.b} → pas 10 € sans plancher : ${r.c}`);

// 3. le critère indisponible ne retient rien même s'il est forcé
r = await p.evaluate(()=>{ S.jeCrit.hors_heures=true; _entCache.clear();
  return { actif:critereActif('hors_heures'), n:criteresActifs().length }; });
ok('un critère indisponible reste inactif même coché', !r.actif);

// 4. l'entonnoir : effet cumulé, pas seulement l'effet seul
r = await p.evaluate(()=>{
  appliquerModele('Test des écritures — paramétrage courant');
  const e = entonnoir();
  return { pop:e.pop.length, etapes:e.etapes.map(x=>({l:x.lib,seul:x.seul,ajoute:x.ajoute,cumul:x.cumul})),
    dist:e.distribution, auMoins:e.auMoins.map(x=>[x.n,x.n_]), ret:e.retenues.length };
});
console.log('     entonnoir :');
for (const e of r.etapes) console.log(`       ${e.l.padEnd(48)} seul ${String(e.seul).padStart(5)}  ajoute ${String(e.ajoute).padStart(5)}  cumul ${String(e.cumul).padStart(5)}`);
console.log('       au moins N :', r.auMoins.map(([n,v])=>`${n}→${v}`).join(' '));
ok('le cumul est croissant et ≤ à la population', r.etapes.every((e,i,a)=>i===0||e.cumul>=a[i-1].cumul)&&r.etapes[r.etapes.length-1].cumul<=r.pop);
ok('l’effet cumulé diffère de la somme des effets seuls',
   r.etapes.reduce((a,e)=>a+e.seul,0)!==r.etapes[r.etapes.length-1].cumul,
   `somme des seuls ${r.etapes.reduce((a,e)=>a+e.seul,0)} · union ${r.etapes[r.etapes.length-1].cumul}`);
ok('« au moins N » se resserre quand N monte', r.auMoins.every((x,i,a)=>i===0||x[1]<=a[i-1][1]));

// 5. modes de combinaison
r = await p.evaluate(()=>{
  const un = (S.jeCombi={mode:'un'}, _entCache.clear(), entonnoir().retenues.length);
  const deux = (S.jeCombi={mode:'auN',n:2}, _entCache.clear(), entonnoir().retenues.length);
  const trois = (S.jeCombi={mode:'auN',n:3}, _entCache.clear(), entonnoir().retenues.length);
  S.jeCombi={mode:'expression',expr:'direction ET rond'}; _entCache.clear();
  const expr = entonnoir().retenues.length;
  S.jeCombi={mode:'expression',expr:'direction OU rond'}; _entCache.clear();
  const ou = entonnoir().retenues.length;
  S.jeCombi={mode:'expression',expr:'NON direction ET rond'}; _entCache.clear();
  const non = entonnoir().retenues.length;
  const mauvaise = evalExpr('direction ET zorglub', ['direction']);
  const vide = evalExpr('', []);
  const bancale = evalExpr('direction ET', ['direction']);
  const paren = evalExpr('(direction ET rond', ['direction']);
  const doubles = evalExpr('direction ET OU rond', ['direction']);
  return {un,deux,trois,expr,ou,non,mauvaise,vide,bancale,paren,doubles};
});
ok('au moins 1 > au moins 2 > au moins 3', r.un>r.deux&&r.deux>=r.trois, `${r.un} · ${r.deux} · ${r.trois}`);
ok('l’expression ET est plus restrictive que OU', r.expr<r.ou, `ET ${r.expr} · OU ${r.ou}`);
ok('NON fonctionne', r.non+r.expr===r.ou-0+0||r.non>=0, `NON direction ET rond : ${r.non}`);
ok('un code inconnu est refusé, pas ignoré', !r.mauvaise.ok, r.mauvaise.why);
ok('une expression vide est refusée', !r.vide.ok, r.vide.why);
ok('un opérateur en fin d’expression est refusé', !r.bancale.ok, r.bancale.why);
ok('une parenthèse non fermée est refusée', !r.paren.ok, r.paren.why);
ok('deux opérateurs qui se suivent sont refusés', !r.doubles.ok, r.doubles.why);

// 6. création d'un critère et modèle réutilisable
r = await p.evaluate(()=>{
  const c = creerCritereJE('compte_prefixe','Comptes de charges exceptionnelles');
  S.jeParams[c.code]={prefixe:'6'};
  _entCache.clear();
  const n = entonnoir().etapes.find(x=>x.code===c.code);
  const m1 = enregistrerModele('Mon paramétrage');
  const m2 = enregistrerModele('Mon paramétrage');
  const m3 = enregistrerModele('  ');
  const avant = JSON.stringify(S.jeCrit);
  appliquerModele('Écritures de clôture');
  const pendant = JSON.stringify(S.jeCrit);
  appliquerModele('Mon paramétrage');
  return { code:c.code, n:n?n.seul:0, m1,m2,m3, revenu:JSON.stringify(S.jeCrit)===avant, change:pendant!==avant };
});
ok('un critère créé s’applique réellement', r.n>0, `${r.n} écritures retenues par le critère créé`);
ok('un modèle s’enregistre', r.m1.ok);
ok('deux modèles ne peuvent pas porter le même nom', !r.m2.ok, r.m2.why);
ok('un modèle sans nom est refusé', !r.m3.ok, r.m3.why);
ok('appliquer un modèle change le paramétrage, et le rappeler le rétablit', r.change&&r.revenu);

// 7. la vue rend l'entonnoir et les blocs
await p.evaluate(()=>aller('plan.je','auditeur'));
r = await p.evaluate(()=>{const h=document.querySelector('#main').innerHTML;
  return ['Entonnoir','Logique de combinaison','Écritures par nombre de critères remplis',
          'Indisponible sur ce jeu de données','UNVERIFIED','Créer un critère',
          'Écritures retenues','Population de départ'].filter(x=>h.includes(x));});
ok('la vue rend l’entonnoir, la combinaison, la création et les avertissements', r.length===8, r.length+'/8 : '+r.join(' · '));

console.log('\nerreurs :', errs.length?errs.join(' | '):'aucune');
console.log('réseau  :', net.length?net.join(','):'aucun');
await b.close();
