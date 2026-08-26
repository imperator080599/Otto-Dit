import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1500,height:1100}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
await p.goto(cible(),{waitUntil:'networkidle'});
const ok=(t,c,d='')=>console.log((c?'  ok  ':'ÉCHEC ')+t+(d?' — '+d:''));
await p.evaluate(()=>aller('plan.ajust','auditeur'));

// 1. la section existe, dérive des versions, et porte les trois natures
let r = await p.evaluate(()=>{
  const l=ajustements();
  return { n:l.length, nat:[...new Set(l.map(x=>x.nature))].sort(),
    sansJustif:l.filter(x=>!x.justif).length, sansAuteur:l.filter(x=>!x.par).length,
    sansMotif:l.filter(x=>!x.motif).length,
    titre:document.querySelector('#main h1')?.textContent.trim(),
    blocs:[...document.querySelectorAll('#main .blk h2')].map(h=>h.textContent.trim()) };
});
ok('la section est branchée sur le versionnement', r.n===11, `${r.n} écritures tirées des versions`);
ok('les trois natures sont portées par la donnée', r.nat.join()==='correction_audit,inventaire,retraitement', r.nat.join(' · '));
ok('chaque ajustement porte son justificatif et son auteur côté client',
   r.sansJustif===0&&r.sansAuteur===0, `${r.sansJustif} sans justificatif · ${r.sansAuteur} sans auteur`);
ok('chaque ajustement dit POURQUOI', r.sansMotif===0, `${r.sansMotif} sans motif`);
ok('les cinq blocs sont là', r.blocs.length===5, r.blocs.join(' · '));

// 2. impact par poste et par masse — et le contrôle de partie double
r = await p.evaluate(()=>{
  const l=ajustements().map(a=>({ref:a.ref, ...impactAjustement(a)}));
  const c=cumulAjustements();
  return { desequilibres:l.filter(x=>!x.equilibre).map(x=>x.ref),
    sansPoste:l.filter(x=>!x.postes.length&&!x.hors.length).map(x=>x.ref),
    masses:[...new Set(l.flatMap(x=>x.postes.map(p=>p.masse)))].sort(),
    hors:[...new Set(l.flatMap(x=>x.hors.map(h=>h.compte)))],
    res:c.resultat, cap:c.capitaux, net:c.nette, eq:c.equilibre, postes:c.parPoste.length };
});
ok('chaque écriture répond à elle-même : effet résultat = effet situation nette',
   r.desequilibres.length===0, r.desequilibres.join(', ')||'aucune divergence');
ok('chaque écriture est ventilée par poste', r.sansPoste.length===0, r.sansPoste.join(', ')||'toutes');
ok('les deux masses sont représentées', r.masses.join()==='bilan,resultat', r.masses.join(' · '));
ok('un compte hors cartographie est dit tel quel, pas rangé de force', r.hors.length>0, r.hors.join(', '));
ok('l’impact cumulé se calcule sur le résultat et les capitaux propres',
   r.eq && r.res!==0, `résultat ${r.res/100} € · capitaux ${r.cap/100} € · ${r.postes} postes`);

// 3. « reçue » n'est pas « prise en compte » : rien n'est corrigé tant que la version ne l'est pas
r = await p.evaluate(()=>{
  const rec=reconciliation(), c=cumulAnomalies();
  return { v:S.version, app:rec.appariees.length, ann:rec.annoncees.map(x=>x.ref),
    corrige:c.corrige, residuel:c.residuel, n:c.n };
});
ok('à la version 2, aucune correction n’est en vigueur', r.app===0&&r.corrige===0, `v${r.v} · ${r.corrige} corrigé`);
ok('les corrections annoncées sont nommées sans être comptées', r.ann.length===4, r.ann.join(', '));

// 4. la bascule est CALCULÉE, pas promise — et elle ne laisse pas de trace
r = await p.evaluate(()=>{
  const av=cumulAnomalies();
  const proj=cumulAuVersion(4);
  const ap=cumulAnomalies();
  return { av, proj, ap, v:S.version };
});
ok('le cumul projeté à la version 4 est réellement évalué',
   r.proj.corrige>0 && r.proj.residuel<r.av.residuel,
   `résiduel ${r.av.residuel/100} € → ${r.proj.residuel/100} € · corrigé ${r.proj.corrige/100} €`);
ok('la projection rétablit l’état — le dossier n’a pas bougé',
   r.v===2 && JSON.stringify(r.ap)===JSON.stringify(r.av));

// 5. prise en compte de la version 4 : la bascule automatique, sans saisie
r = await p.evaluate(()=>{
  prendreEnCompte(4); render();
  const rec=reconciliation(), c=cumulAnomalies();
  const anos=anomalies().filter(x=>!x.souSeuil);
  return { app:rec.appariees.map(x=>({ref:x.a.ref, aff:x.affecte, nonAff:x.nonAffecte, n:x.l.length})),
    sa:rec.sansAnomalie.map(x=>x.a.ref), se:rec.sansEcriture.length,
    c, corrigees:anos.filter(x=>(x.corrigePar||[]).length).map(x=>({lib:x.lib,cor:x.corrige,rest:x.montant})),
    partielle:anos.find(x=>(x.corrigePar||[]).length&&x.montant!==0) };
});
ok('trois corrections s’apparient à une anomalie', r.app.length===3, r.app.map(x=>x.ref).join(', '));
ok('trois anomalies passent de « non corrigée » à « corrigée » sans aucune saisie',
   r.c.nCorrigees===3, `${r.c.nCorrigees} sur ${r.c.n} · corrigé ${r.c.corrige/100} €`);
ok('une correction PARTIELLE laisse le reste au cumul', !!r.partielle,
   r.partielle ? `${r.partielle.lib} — corrigé ${r.partielle.corrige/100} €, reste ${r.partielle.montant/100} €` : 'aucune');
ok('SIGNAL 2 : une écriture de correction sans anomalie correspondante est signalée',
   r.sa.join()==='OD-V4-004', r.sa.join(', ')||'aucune');
ok('aucune correction n’excède l’anomalie qu’elle répond',
   r.app.every(x=>x.nonAff===0||x.ref==='OD-V4-004'), r.app.map(x=>`${x.ref}:${x.nonAff/100}`).join(' '));

// 6. la synthèse et l'achèvement portent le cumul DÉJÀ basculé, et la colonne
//    « corrigé » : sans elle le pied de table ne s'additionne pas à l'écran.
const chiffres = t => (t.match(/\d+(?:[\s  ]\d{3})*,\d{2}/g) || [])
  .map(x => Math.round(parseFloat(x.replace(/[\s  ]/g,'').replace(',','.')) * 100));
for (const [vue, nom] of [['ach.anomalies','achèvement'], ['plan.synth','synthèse']]){
  r = await p.evaluate((v) => {
    aller(v, 'auditeur');
    const c = cumulAnomalies();
    return { t:document.querySelector('#main tfoot')?.innerText || '',
             cons:c.constate, expl:c.explique, cor:c.corrige, res:c.residuel };
  }, vue);
  const n = chiffres(r.t);
  ok(`le pied de table de la ${nom} porte constaté, expliqué, corrigé et résiduel`,
     n.includes(r.cons) && n.includes(r.cor) && n.includes(r.res),
     r.t.replace(/\n+/g, ' | ').trim());
  ok(`et il s’additionne : constaté − expliqué − corrigé = résiduel (${nom})`,
     r.cons - r.expl - r.cor === r.res,
     `${r.cons/100} − ${r.expl/100} − ${r.cor/100} = ${(r.cons-r.expl-r.cor)/100} · résiduel ${r.res/100}`);
}

// 7. SIGNAL 1 : anomalie qualifiée « corrigée » sans écriture identifiée
r = await p.evaluate(()=>{
  // on qualifie « corrigée » un écart que AUCUNE écriture de correction ne porte
  // Un écart de PAPIER se résout dans sa ligne de papier, pas dans le casier
  // « hors papier ». On prend donc une anomalie née hors papier — c'est celle
  // dont la carte de résolution passe par resolHors.
  const x = anomalies().find(a=>!a.souSeuil && !(a.corrigePar||[]).length
    && a.ref && String(a.cleRes).startsWith('hors#'));
  if (!x) return { impossible:true };
  const res = resolHors(x.ref, 'explication reçue du client');
  res.expl='explication reçue du client, mot pour mot';
  res.concl='conclusion de l’auditeur';
  res.disposition='corrigee';
  res.corrobEcriture='OD-V3-003';
  res.explique = x.constate;      // signé : une part expliquée de signe inverse ne retire rien
  res.par = S.moi; res.t = tick();
  const rec = reconciliation();
  return { cible:x.lib, se:rec.sansEcriture.length, libs:rec.sansEcriture.map(y=>y.lib) };
});
ok('SIGNAL 1 : une anomalie dite corrigée sans écriture est signalée',
   !r.impossible && r.se>0, r.impossible?'aucune anomalie disponible':`${r.se} — ${r.libs.join(' · ')}`);

console.log('erreurs :', errs.length?errs:'aucune');
await b.close();
process.exit(0);
