import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1600,height:1200}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
await p.goto(cible(),{waitUntil:'networkidle'});
const ok=(t,c,d='')=>console.log((c?'  ok  ':'ÉCHEC ')+t+(d?' — '+d:''));
await p.evaluate(()=>aller('plan.equipe','auditeur'));

// a) l'équipe est une donnée, pas une liste figée
let r = await p.evaluate(()=>{
  const av = membres().length;
  const add = ajouterMembre('Théo Marchand','assistant','preparateur','t.marchand@revisia-audit.example');
  const ap = membres().length;
  const del = retirerMembre(add.id);
  const delKarim = retirerMembre('ines');   // 10 travaux à son nom
  const maj = majMembre('sonia','exercices','6');
  return { av, ap, apres:membres().length, add, del, delKarim, ex:USERS.sonia.exercices,
    champs:Object.keys(USERS.claire).sort() };
});
ok('un membre s’ajoute et se retire', r.ap===r.av+1 && r.del.ok && r.apres===r.av, `${r.av} → ${r.ap} → ${r.apres}`);
ok('on ne retire pas quelqu’un qui porte une trace au dossier', !r.delKarim.ok, r.delKarim.why);
ok('la fiche porte grade, rôle, courriel, dates et ancienneté',
   ['nom','grade','role','mail','entree','sortie','exercices'].every(c=>r.champs.includes(c)), r.champs.join(' · '));

// b) ancienneté et menaces
r = await p.evaluate(()=>({
  anc:membresActifs().map(m=>m.nom+':'+m.exercices),
  menaces:menacesIndependance().map(x=>({id:x.id,type:x.type,sauve:!!x.sauvegarde.trim()})),
  nonTraitees:menacesNonTraitees().length,
  seuils:{ rot:S.independance.rotationSignataire, fam:S.independance.seuilFamiliarite },
}));
ok('l’ancienneté sur le client est portée par chaque membre', r.anc.length>=6, r.anc.join(' · '));
ok('le dépassement de la durée de rotation du signataire est relevé',
   r.menaces.some(x=>x.type==='rotation'), r.menaces.map(x=>x.id+'/'+x.type).join(' · '));
ok('une menace sans sauvegarde écrite reste non traitée', r.nonTraitees>0, `${r.nonTraitees}`);

r = await p.evaluate(()=>{
  const m = menacesIndependance()[0];
  S.independance.sauvegardes[m.id] = 'Revue de second niveau confiée à un associé extérieur au mandat, et rotation programmée à la clôture 2026.';
  return { avant:1, apres:menacesNonTraitees().length };
});
ok('une sauvegarde décrite la traite', r.apres===0, `${r.apres} non traitée(s)`);

// c) LA règle
r = await p.evaluate(()=>({
  etats:Object.fromEntries(membres().map(m=>[m.id, etatDeclaration(m.id).cle])),
  rubriques:RUBRIQUES_INDEP.length,
  hugo:affecter('PLAN-01','preparateur','hugo'),
  ines:affecter('PLAN-01','preparateur','ines'),
  karim:affecter('PLAN-01','preparateur','karim'),
}));
ok('la déclaration couvre les sept rubriques exigées', r.rubriques===7, `${r.rubriques} rubriques`);
ok('AUCUN travail à qui n’a pas signé', !r.hugo.ok && !r.ines.ok, r.hugo.why);
ok('et le travail passe pour qui a signé', r.karim.ok);

r = await p.evaluate(()=>{
  const cl = postesEnPerimetre().find(x=>x.code==='CLIENTS');
  return { obst:obstaclesVisa(cl).filter(x=>/indépendance/.test(x)),
           n:travauxIndependanceSection('CLIENTS').length };
});
ok('un travail attribué à une déclaration devenue caduque bloque le visa',
   r.obst.length===1 && r.n>0, r.obst.join(' | '));

// une déclaration se signe soi-même, et pas à moitié
r = await p.evaluate(()=>{
  S.moi='hugo';
  const sansOuvrir = signerDeclaration('hugo');
  ouvrirDeclaration('hugo');
  const vide = signerDeclaration('hugo');
  const d = declarationCourante('hugo');
  for (const x of RUBRIQUES_INDEP) d.reponses[x.code]='non';
  d.reponses.familiaux='oui';
  const sansPrecision = signerDeclaration('hugo');
  d.precisions.familiaux='Cousin germain employé au service expédition, sans fonction comptable ni financière.';
  const signe = signerDeclaration('hugo');
  S.moi='karim';
  const pourAutrui = signerDeclaration('hugo');
  return { sansOuvrir, vide, sansPrecision, signe, pourAutrui,
    apres:affecter('PLAN-01','preparateur','hugo') };
});
ok('une déclaration incomplète ne se signe pas', !r.vide.ok, r.vide.why.slice(0,110));
ok('un « oui » sans précision écrite ne se signe pas', !r.sansPrecision.ok, r.sansPrecision.why.slice(0,90));
ok('signée, elle passe', r.signe.ok);
ok('personne ne signe pour un autre', !r.pourAutrui.ok, r.pourAutrui.why);
ok('et le travail devient attribuable', r.apres.ok);

// révision : elle empile, elle n'écrase pas
r = await p.evaluate(()=>{
  const av = declarations('karim').length;
  const sansMotif = reviserDeclaration('karim','');
  const rev = reviserDeclaration('karim','Le client a acquis en mars la société dont je détiens des parts.');
  const hist = declarations('karim');
  return { av, sansMotif, rev, n:hist.length,
    ancienneSignee:!!hist[0].signee, ancienneRemplacee:!!hist[0].remplacee,
    nouvelleSignee:!!hist[hist.length-1].signee,
    etat:etatDeclaration('karim').cle,
    aff:affecter('PLAN-02','preparateur','karim') };
});
ok('une révision sans motif écrit est refusée', !r.sansMotif.ok, r.sansMotif.why);
ok('la révision empile sans écraser : l’ancienne reste signée et lisible',
   r.n===r.av+1 && r.ancienneSignee && r.ancienneRemplacee && !r.nouvelleSignee, `${r.av} → ${r.n} version(s)`);
ok('tant qu’elle n’est pas signée, le membre redevient inattribuable',
   r.etat==='caduque' && !r.aff.ok, r.aff.why);

// confirmation de l'associé
r = await p.evaluate(()=>{
  const parUnAutre = confirmerEquipe();
  S.moi='claire';
  const avecManquants = confirmerEquipe();
  // on signe pour tout le monde
  for (const m of membresActifs()){
    S.moi = m.id;
    const d = declarationCourante(m.id);
    if (!d) ouvrirDeclaration(m.id);
    const dd = declarationCourante(m.id);
    if (!dd.signee){ for (const x of RUBRIQUES_INDEP) if (dd.reponses[x.code]===undefined) dd.reponses[x.code]='non';
      for (const x of RUBRIQUES_INDEP) if (dd.reponses[x.code]==='oui'&&!dd.precisions[x.code]) dd.precisions[x.code]='précision';
      signerDeclaration(m.id); }
  }
  S.moi='claire';
  const complet = confirmerEquipe();
  const cl = postesEnPerimetre().find(x=>x.code==='CLIENTS');
  return { parUnAutre, avecManquants, complet, conf:!!S.independance.confirmation,
    obstCLIENTS:obstaclesVisa(cl).filter(x=>/indépendance/.test(x)).length };
});
ok('seul l’associé signataire confirme pour l’équipe', !r.parUnAutre.ok, r.parUnAutre.why);
ok('il ne confirme pas au-dessus de déclarations manquantes', !r.avecManquants.ok, r.avecManquants.why.slice(0,110));
ok('toutes signées, il confirme', r.complet.ok && r.conf);
ok('et l’obstacle au visa de la section tombe de lui-même', r.obstCLIENTS===0);

// d) registre des SACC
r = await p.evaluate(()=>{
  const av = { n:S.sacc.length, ratio:ratioSacc(), int:saccInterdits().length };
  const bad = ajouterSacc('formation','', '1000','2025-05-05');
  const add = ajouterSacc('tenue','Reprise de la comptabilité auxiliaire fournisseurs','24000','2025-07-01');
  const ap = { n:S.sacc.length, ratio:ratioSacc(), int:saccInterdits().length };
  const obst = obstaclesIndependance();
  return { av, bad, add, ap, obst, natures:Object.keys(NATURES_SACC).length,
    plafond:S.plafondSacc, hon:S.honorairesMission };
});
ok('le registre des SACC est alimenté et typé', r.av.n===4 && r.natures>=10, `${r.av.n} services · ${r.natures} natures`);
ok('un service sans intitulé n’entre pas au registre', !r.bad.ok, r.bad.why);
ok('le ratio d’honoraires est calculé', r.av.ratio>0, `${Math.round(r.av.ratio*1000)/10} % de ${r.hon/100} €`);
ok('un service paramétré « interdit » est signalé', r.ap.int===r.av.int+1, `${r.av.int} → ${r.ap.int}`);
ok('les obstacles d’indépendance le portent', r.obst.some(x=>/interdit/.test(x)), r.obst.join(' | '));

// les paramètres sont déclarés et marqués UNVERIFIED à l'écran
r = await p.evaluate(()=>{
  aller('plan.equipe','auditeur');
  document.querySelectorAll('#main details.pan').forEach(d=>d.open=true);
  const h=document.getElementById('main').innerText;
  return { unv:(h.match(/UNVERIFIED/g)||[]).length,
    blocs:[...document.querySelectorAll('#main h2')].map(x=>x.textContent.trim()) };
});
ok('les paramètres portent [UNVERIFIED] à l’écran', r.unv>=2, `${r.unv} mention(s)`);
ok('les cinq blocs sont là', r.blocs.length===5, r.blocs.join(' · '));

console.log('erreurs :', errs.length?errs:'aucune');
await b.close();
process.exit(0);
