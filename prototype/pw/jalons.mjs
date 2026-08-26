import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1600,height:1200}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
await p.goto(cible(),{waitUntil:'networkidle'});
const ok=(t,c,d='')=>console.log((c?'  ok  ':'ÉCHEC ')+t+(d?' — '+d:''));
await p.evaluate(()=>aller('plan.programme','auditeur'));

// 1. quatre jalons, dont un déduit
let r = await p.evaluate(()=>({
  n:JALONS.length, ids:JALONS.map(j=>j.id),
  derive:JALONS.filter(j=>j.derive).map(j=>j.id),
  saisieRefusee:fixerJalon('assemblage','2026-12-31'),
  assemblage:jalon('assemblage'), rapport:jalon('rapport'), delai:DELAI_ASSEMBLAGE,
  ecrites:travaux().filter(t=>trav(t.code).echeance).length, total:travaux().length,
}));
ok('quatre jalons de mission', r.n===4, r.ids.join(' · '));
ok('l’échéance d’assemblage se déduit, elle ne se saisit pas',
   r.derive.join()==='assemblage' && !r.saisieRefusee.ok, r.saisieRefusee.why);
ok('et elle vaut le délai légal après la date du rapport',
   Math.round((Date.parse(r.assemblage)-Date.parse(r.rapport))/86400000)===r.delai,
   `${r.rapport} + ${r.delai} j = ${r.assemblage}`);
ok('aucune échéance n’est saisie au départ : elles se déduisent toutes',
   r.ecrites===0, `${r.ecrites} écrite(s) sur ${r.total}`);

// 2. déplacer un jalon déplace les échéances qui en dépendent
r = await p.evaluate(()=>{
  const av = travaux().map(t=>t.code+':'+t.echeance);
  fixerJalon('final','2026-04-02');
  const ap = travaux().map(t=>t.code+':'+t.echeance);
  const bouge = ap.filter((x,i)=>x!==av[i]).length;
  const sect = travaux().filter(t=>t.phase==='bilan'||t.phase==='resultat');
  const autres = travaux().filter(t=>t.phase==='planification');
  fixerJalon('final','2026-03-23');
  return { bouge, sect:[...new Set(sect.map(t=>t.echeance))], autres:[...new Set(autres.map(t=>t.echeance))],
           n:travaux().length };
});
ok('déplacer l’intervention finale déplace les seules procédures de section',
   r.bouge>0 && r.sect.length===1 && r.autres.length===1, `${r.bouge} échéance(s) sur ${r.n}`);

// 3. une échéance écrite le reste quand le jalon bouge
r = await p.evaluate(()=>{
  const t0 = travaux().find(t=>t.phase==='bilan');
  fixerEcheance(t0.code,'2026-05-05');
  const ecrit1 = travaux().find(t=>t.code===t0.code).echeance;
  fixerJalon('final','2026-04-02');
  const ecrit2 = travaux().find(t=>t.code===t0.code).echeance;
  const voisin = travaux().find(t=>t.phase==='bilan'&&t.code!==t0.code).echeance;
  fixerEcheance(t0.code,'');          // retour à la règle
  const rendu = travaux().find(t=>t.code===t0.code).echeance;
  fixerJalon('final','2026-03-23');
  return { code:t0.code, ecrit1, ecrit2, voisin, rendu };
});
ok('une échéance écrite à la main ne bouge pas avec le jalon',
   r.ecrit1==='2026-05-05' && r.ecrit2==='2026-05-05', `${r.code} : ${r.ecrit1} → ${r.ecrit2} (voisin ${r.voisin})`);
ok('et elle se rend à la règle quand on l’efface', r.rendu==='2026-04-02', r.rendu);

// 4. échéance en lot sur la sélection
r = await p.evaluate(()=>{
  const vus = travaux().filter(t=>t.phase==='achevement');
  S.selTrav = vus.map(t=>t.code);
  const res = fixerEcheanceEnLot(S.selTrav,'2026-04-10');
  const ap = travaux().filter(t=>t.phase==='achevement').map(t=>t.echeance);
  fixerEcheanceEnLot(S.selTrav,'');
  const rendu = [...new Set(travaux().filter(t=>t.phase==='achevement').map(t=>t.echeance))];
  S.selTrav=[];
  return { n:res.n, sel:vus.length, distinctes:[...new Set(ap)], rendu };
});
ok('l’échéance se pose en lot sur la sélection',
   r.n===r.sel && r.distinctes.length===1 && r.distinctes[0]==='2026-04-10', `${r.n}/${r.sel} · ${r.distinctes.join()}`);
ok('et le lot se rend à la règle', r.rendu.length===2, r.rendu.join(' · '));

// 5. heures budgétées modifiables, et la correction survit au barème
r = await p.evaluate(()=>{
  const t = travaux().find(x=>x.nature==='section'&&x.ech);
  const bareme = t.budgetBareme;
  trav(t.code).heuresBudget = 12.5;
  const apres = budget(travaux().find(x=>x.code===t.code));
  trav(t.code).heuresBudget = null;
  return { bareme, apres, rendu:budget(travaux().find(x=>x.code===t.code)) };
});
ok('les heures budgétées se corrigent', r.apres===12.5, `barème ${r.bareme} h → ${r.apres} h`);
ok('effacer la correction rend le barème', r.rendu===r.bareme);

// 6. ajouter un travail à la main
r = await p.evaluate(()=>{
  const av = travaux().length;
  const vide = ajouterTravail('','planification','');
  const add = ajouterTravail('Entretien avec le directeur des systèmes d’information','planification','');
  const surSection = ajouterTravail('Circularisation de l’avocat du dossier prud’homal','bilan','PROV');
  const l = travaux();
  const t = l.find(x=>x.code===add.code);
  const jetable = ajouterTravail('Travail d’essai, jamais engagé','planification','');
  const del = retirerTravailManuel(jetable.code);      // jamais engagé : il part
  const aff = affecter(add.code,'preparateur','karim');
  const delApresAff = retirerTravailManuel(add.code);  // engagé : il ne part plus
  const fixe = retirerTravailManuel('PLAN-01');        // pas ajouté à la main
  return { av, vide, add, surSection, n:l.length, ech:t.echeance, budget:budget(t),
    nature:t.nature, obstPROV:obstaclesTravaux('PROV').length, aff, del, delApresAff, fixe };
});
ok('un travail sans intitulé n’est pas un travail', !r.vide.ok, r.vide.why);
ok('un travail s’ajoute à la main et porte les mêmes règles',
   r.add.ok && r.n===r.av+2 && !!r.ech && r.budget>0, `${r.add.code} · échéance ${r.ech} · budget ${r.budget} h`);
ok('il s’attribue comme les autres', r.aff.ok);
ok('un travail ajouté et jamais engagé se retire', r.del.ok);
ok('une fois engagé, il ne s’efface plus : il se marque', !r.delApresAff.ok, r.delApresAff.why);
ok('un travail du catalogue ne s’efface pas non plus', !r.fixe.ok, r.fixe.why);
ok('rattaché à une section, il entre dans ses obstacles', r.obstPROV>0, `${r.obstPROV} obstacle(s)`);

// 7. « sans objet » plutôt que suppression
r = await p.evaluate(()=>{
  const t = travaux().find(x=>x.poste==='CA'&&x.nature==='section');
  const av = obstaclesTravaux('CA').join(' | ');
  const avN = travauxDe('CA').filter(x=>!x.sansObjet).length;
  const sansMotif = marquerSansObjet(t.code,'');
  const m = marquerSansObjet(t.code,'Procédure couverte par le test de détail : aucune circularisation client sur ce dossier.');
  const ap = obstaclesTravaux('CA').join(' | ');
  const apN = travauxDe('CA').filter(x=>!x.sansObjet).length;
  const tt = travaux().find(x=>x.code===t.code);
  const budgetHors = travaux().filter(x=>!x.sansObjet).reduce((a,x)=>a+budget(x),0);
  const budgetTout = travaux().reduce((a,x)=>a+budget(x),0);
  // un travail achevé n'est pas sans objet
  const t2 = travaux().find(x=>x.nature==='planification');
  trav(t2.code).preparateur='karim'; trav(t2.code).statut='acheve'; trav(t2.code).acheve={par:'karim',t:tick()};
  const refusAcheve = marquerSansObjet(t2.code,'motif quelconque');
  const rendu = annulerSansObjet(t.code);
  trav(t2.code).statut='a_faire'; trav(t2.code).acheve=null; trav(t2.code).preparateur=null;
  return { av, avN, sansMotif, m, ap, apN, motif:tt.sansObjet&&tt.sansObjet.motif, par:tt.sansObjet&&tt.sansObjet.par,
    budgetHors, budgetTout, refusAcheve, rendu, apRendu:obstaclesTravaux('CA') };
});
ok('« sans objet » exige un motif écrit', !r.sansMotif.ok, r.sansMotif.why);
ok('marqué, le travail sort du décompte des obstacles',
   r.m.ok && r.apN===r.avN-1 && r.ap!==r.av, `${r.avN} → ${r.apN} travaux comptés · « ${r.ap.slice(0,70)}… »`);
ok('la marque porte son motif et son auteur', !!r.motif && !!r.par, `${r.par} : ${String(r.motif).slice(0,60)}…`);
ok('un travail sans objet ne consomme pas de budget', r.budgetHors<r.budgetTout,
   `${r.budgetHors} h hors sans-objet contre ${r.budgetTout} h au total`);
ok('un travail déjà achevé n’est pas « sans objet »', !r.refusAcheve.ok, r.refusAcheve.why);
ok('la marque se retire et les obstacles reviennent',
   r.rendu.ok && r.apRendu.join(' | ')===r.av, r.rendu.ok ? 'rétabli' : r.rendu.why);

/* 8. deux écrans, et non plus un. Les jalons sont un RÉGLAGE de la mission —
      quatre dates dont tout le reste se déduit ; le programme est le roster des
      travaux. Les empiler faisait ouvrir un tableau de 60 lignes pour changer
      une date. */
r = await p.evaluate(()=>{
  aller('plan.jalons','auditeur');
  document.querySelectorAll('#main details.pan').forEach(d=>d.open=true);
  const j=document.getElementById('main');
  const vj={ titre:j.querySelector('.hd h1').textContent.trim(),
    blocs:[...j.querySelectorAll('h2')].map(x=>x.textContent.trim()),
    jalonInputs:j.querySelectorAll('[data-jalon]').length,
    fuite:j.querySelectorAll('[data-tso]').length };
  aller('plan.programme','auditeur');
  document.querySelectorAll('#main details.pan').forEach(d=>d.open=true);
  const h=document.getElementById('main');
  return { ...vj,
    blocsProg:[...h.querySelectorAll('h2')].map(x=>x.textContent.trim()),
    jalonsDansProg:h.querySelectorAll('[data-jalon]').length,
    echInputs:h.querySelectorAll('[data-tech]').length,
    lot:!!h.querySelector('#tv-lotech'), add:!!h.querySelector('#tv-add'),
    so:h.querySelectorAll('[data-tso]').length };
});
ok('« Jalons et échéances » est une destination à part, et ne porte QUE les jalons',
   r.titre==='Jalons et échéances' && r.jalonInputs===4 && r.fuite===0,
   `${r.titre} · ${r.jalonInputs} jalons · ${r.fuite} bouton(s) de programme`);
ok('le programme porte les échéances, le lot, l’ajout et « sans objet », plus les jalons',
   r.jalonsDansProg===0 && r.echInputs>50 && r.lot && r.add && r.so>50,
   `${r.jalonsDansProg} jalon(s) · ${r.echInputs} échéances · ${r.so} boutons « sans objet »`);

console.log('erreurs :', errs.length?errs:'aucune');
await b.close();
process.exit(0);
