import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1500,height:1100}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
const net=[]; p.on('request',r=>{if(!r.url().startsWith('file://'))net.push(r.url());});
await p.goto(cible(),{waitUntil:'networkidle'});
const ok = (t,c,d='') => console.log((c?'  ok  ':'ÉCHEC ')+t+(d?' — '+d:''));

// 1. le bloc dupliqué a disparu, l'avancement dérivé est là
await p.evaluate(()=>aller('fsli:FOURN'));
let r = await p.evaluate(()=>{
  const h = document.querySelector('#main').innerHTML;
  return { resp:h.includes('Responsabilités et heures'), av:h.includes('Avancement des justificatifs'),
           lien:h.includes('data-vue="trav.programme"') };
});
ok('bloc « Responsabilités et heures » retiré de la section', !r.resp);
ok('bloc « Avancement des justificatifs » présent', r.av);
ok('renvoi au programme de travail présent', r.lien);

// 2. état initial : tout en attente, rien de reçu, aucune case à cocher
r = await p.evaluate(()=>{
  const p0 = postesCalcules().find(x=>x.code==='FOURN'), pr = PROCEDURES.find(x=>x.code==='DETAIL');
  return { t:avancementSection(p0), n:comptesEtats(controles(p0,pr)) };
});
ok('aucune pièce reçue avant dépôt', r.t.recus===0, `${r.t.recus} / ${r.t.elements}`);
ok('tous les contrôles en « attente »', r.n.recue===0&&r.n.traitee===0&&r.n.attente===r.n.attente&&r.t.attente===r.t.total,
   `${r.t.attente} / ${r.t.total}`);

// 3. le testing ne peut pas être déclaré terminé sans préparateur
await p.evaluate(()=>{ S.procOuverte='FOURN/DETAIL'; renderMain(); });
r = await p.evaluate(()=>document.querySelector('#main').innerHTML.includes('Aucun préparateur affecté'));
ok('sans préparateur, le bouton est refusé et renvoie au programme', r);

// 4. affectation au programme, puis réception DÉRIVÉE du dépôt
r = await p.evaluate(()=>{
  S.moi='karim';
  affecter('SEC-FOURN-DETAIL','preparateur','karim');
  // Le réviseur est choisi par la règle, pas écrit en dur : si la section
  // passe en risque élevé, le travail exige une revue de second niveau et
  // seule l'associée peut la porter. Le harnais suit la règle.
  const revOK = Object.keys(USERS).find(k=>k!=='karim'&&peutRecevoirTravail(k)
    &&peutReviser(k,travailDe('SEC-FOURN-DETAIL')));
  affecter('SEC-FOURN-DETAIL','reviseur',revOK);
  window.__rev = revOK;
  const p0 = postesCalcules().find(x=>x.code==='FOURN'), pr = PROCEDURES.find(x=>x.code==='DETAIL');
  requeteJustificatifsProc(p0,pr);
  const av1 = avancementSection(p0);
  const req = S.requetes.filter(x=>x.section==='FOURN'&&x.proc==='DETAIL');
  const docs = docsAttendusProc(p0,pr).length;
  for (const q of req) for (const it of q.items) for (let k=0;k<docs;k++) deposer(q.id,it.id);
  const av2 = avancementSection(p0);
  const ligneSansDrapeau = !Object.prototype.hasOwnProperty.call(wpProc(p0,pr)[0],'recu');
  const n = comptesEtats(controles(p0,pr));
  n.total = Object.values(n).reduce((a,x)=>a+x,0);
  return { av1, av2, ligneSansDrapeau, docs, nDet:n };
});
ok('requête émise : toujours rien de reçu', r.av1.recus===0);
ok('après dépôt, réception dérivée sans aucune saisie', r.av2.recus>0, `${r.av2.recus} élément(s)`);
ok('la ligne de papier ne porte AUCUN drapeau « recu »', r.ligneSansDrapeau);
ok('les contrôles de la procédure servie passent en « reçue »', r.nDet.recue===r.nDet.total && r.nDet.attente===0,
   `${r.nDet.recue} / ${r.nDet.total} sur DETAIL`);
ok('les procédures sans requête restent en attente', r.av2.attente===r.av2.total-r.nDet.total,
   `${r.av2.attente} contrôle(s) encore en attente sur la section`);

// 5. saisie des valeurs relevées → traitée / écart
r = await p.evaluate(()=>{
  const p0 = postesCalcules().find(x=>x.code==='FOURN'), pr = PROCEDURES.find(x=>x.code==='DETAIL');
  for (const c of controles(p0,pr)){
    if (etatControle(c)!=='recue') continue;
    const v = c.ch.val(c.ligne.x);
    c.ligne.champs[c.cle] = c.ch.type==='montant' ? (v/100).toFixed(2).replace('.',',')
      : c.ch.type==='bool' ? (v?'oui':'non') : String(v);
  }
  return comptesEtats(controles(p0,pr));
});
ok('contrôles saisis : plus rien en reçue sur la procédure', r.recue===0&&r.attente===0);
ok('des écarts sont relevés', r.ecart>0, `${r.ecart} écart(s), ${r.traitee} traités`);

// 6. la résolution incomplète ne retire RIEN du cumul
r = await p.evaluate(()=>{
  const s0 = seuils();
  /* Depuis que la coupure d'exhaustivité vaut le seuil de planification, la
     sélection de FOURN/DETAIL ne porte plus forcément un écart chiffré : le
     harnais cherche celle qui en porte un plutôt que de le supposer. */
  const p0 = postesCalcules().find(x=>x.code==='FOURN'), pr = PROCEDURES.find(x=>x.code==='DETAIL');
  const c = ecartsProc(p0,pr).filter(x=>constateDe(x)!==0)
    .sort((a,b)=>Math.abs(constateDe(b))-Math.abs(constateDe(a)))[0]
    || (()=>{ /* sélection élargie au sondage en unités monétaires, à l'intervalle
                 adéquat : on redemande les pièces de la NOUVELLE sélection. */
              proc('FOURN','DETAIL').methode='sum';
              proc('FOURN','DETAIL').taille=echantillonProc(p0,pr).nAdequate;
              _echProcCache.clear();
              requeteJustificatifsProc(p0,pr);
              const docs=docsAttendusProc(p0,pr).length||1;
              for (const q of S.requetes.filter(x=>x.section==='FOURN'&&x.proc==='DETAIL'))
                for (const it of q.items) for (let k=0;k<docs;k++) deposer(q.id,it.id);
              for (const x of controles(p0,pr)){
                if (etatControle(x)!=='recue') continue;
                const v=x.ch.val(x.ligne.x);
                x.ligne.champs[x.cle]=x.ch.type==='montant'?(v/100).toFixed(2).replace('.',','):x.ch.type==='bool'?(v?'oui':'non'):String(v);
              }
              return ecartsProc(p0,pr).filter(y=>constateDe(y)!==0)
                .sort((a,b)=>Math.abs(constateDe(b))-Math.abs(constateDe(a)))[0]; })();
  const av = residuel(c).constate;
  const r0 = resol(c);
  r0.expl = 'Un avoir de fin d’exercice a été accordé et n’a pas été comptabilisé.';
  r0.explique = av;                                   // part expliquée : la totalité
  const d1 = residuel(c);
  const t1 = conclureResolution(r0, av, 'test');      // doit être refusé
  r0.concl = 'Avoir retrouvé et rapproché de la facture ; l’écart est intégralement expliqué.';
  r0.disposition = 'corrigee';
  const t2 = conclureResolution(r0, av, 'test');      // encore refusé : pas de lien
  r0.corrobEcriture = 'ÉCRITURE-QUI-N-EXISTE-PAS';
  const t3 = conclureResolution(r0, av, 'test');      // refusé : le lien ne pointe sur rien
  r0.corrobEcriture = lg().entries[10].num;
  const t4 = conclureResolution(r0, av, 'test');      // accepté
  const d2 = residuel(c);
  return { cle:c.cle, constate:av, ctt:s0.CTT, d1, t1, t2, t3, t4, d2, par:r0.par, t:r0.t };
});
ok('explication seule : rien retiré du cumul', r.d1.explique===0 && r.d1.residuel===r.d1.constate,
   `résiduel ${(r.d1.residuel/100).toFixed(2)} = constaté ${(r.d1.constate/100).toFixed(2)}`);
ok('conclusion refusée sans conclusion de l’auditeur', !r.t1.ok, r.t1.why);
ok('conclusion refusée sans lien corroborant', !r.t2.ok, r.t2.why);
ok('conclusion refusée si l’écriture citée n’existe pas', !r.t3.ok, r.t3.why);
ok('conclusion acceptée une fois les six éléments réunis', r.t4.ok);
ok('auteur et date enregistrés par la conclusion elle-même', !!r.par && !!r.t, r.par+' '+r.t);
ok('la part expliquée quitte le cumul', r.d2.residuel===0 && r.d2.explique===r.d2.constate);
ok('l’écart choisi dépasse bien le seuil de remontée', Math.abs(r.constate)>=r.ctt,
   `${(Math.abs(r.constate)/100).toFixed(2)} ≥ ${(r.ctt/100).toFixed(2)}`);

// 7. bornage : on ne peut pas expliquer plus que l'écart, ni en inverser le sens
r = await p.evaluate(()=>{
  const p0 = postesCalcules().find(x=>x.code==='FOURN'), pr = PROCEDURES.find(x=>x.code==='DETAIL');
  const c = ecartsProc(p0,pr).filter(x=>constateDe(x)!==0)
    .sort((a,b)=>Math.abs(constateDe(b))-Math.abs(constateDe(a)))[0];
  const r0 = resol(c), av = residuel(c).constate, sauv = r0.explique;
  r0.explique = av * 3; const a = residuel(c);
  r0.explique = -av;    const b = residuel(c);
  r0.explique = sauv;
  return { av, a, b };
});
ok('part expliquée bornée à l’écart constaté', r.a.retenu===r.av && r.a.borne);
ok('part expliquée de sens contraire ramenée à zéro', r.b.retenu===0);

// 8. la synthèse ne montre plus d'explication non corroborée comme une résolution
r = await p.evaluate(()=>{
  const a = anomalies();
  const hors = a.filter(x=>x.objet!=='papier');
  return { n:a.length, hors:hors.length, horsAcquis:hors.filter(x=>x.acquis).length,
           horsExpl:hors.filter(x=>x.res && x.res.expl).length, ctt:seuils().CTT,
           papierRetenus:a.filter(x=>x.objet==='papier'&&!x.souSeuil).length,
           cumul:a.filter(x=>!x.souSeuil).reduce((t,x)=>t+x.montant,0),
           constate:a.filter(x=>!x.souSeuil).reduce((t,x)=>t+x.constate,0) };
});
ok('les écarts hors papier portent une explication reçue', r.horsExpl===r.hors, `${r.horsExpl} / ${r.hors}`);
ok('aucun d’eux n’est traité comme résolu', r.horsAcquis===0);
ok('le cumul est inférieur au constaté du fait de la résolution', Math.abs(r.cumul)<Math.abs(r.constate),
   `cumul ${(r.cumul/100).toFixed(2)} · constaté ${(r.constate/100).toFixed(2)}`);
ok('des écarts de papier de travail atteignent le seuil de remontée', r.papierRetenus>0,
   `${r.papierRetenus} écart(s) de papier au-dessus de ${(r.ctt/100).toFixed(2)}`);

// 9. plus de case « corrigée » dans la vue d'achèvement
await p.evaluate(()=>aller('ach.anomalies'));
r = await p.evaluate(()=>{const h=document.querySelector('#main').innerHTML;
  return { chk:h.includes('data-corr='), qual:h.includes('Qualification') };});
ok('la case à cocher « corrigée » a disparu de l’achèvement', !r.chk);

// 10. le bouton « le testing est terminé »
r = await p.evaluate(()=>{
  const p0 = postesCalcules().find(x=>x.code==='FOURN'), pr = PROCEDURES.find(x=>x.code==='DETAIL');
  const o1 = obstaclesProcedure(p0,pr);
  // on résout tous les écarts chiffrés restants, puis on conclut la procédure
  let chiffres=0, nonChiffres=0;
  for (const c of ecartsProc(p0,pr)){
    const r0 = resol(c), av = constateDe(c);
    if (r0.par) continue;
    if (av) chiffres++; else nonChiffres++;
    r0.expl='Explication reçue du client.'; r0.concl='Corroborée par la pièce déposée.';
    r0.disposition='pas_anomalie'; r0.corrobEcriture=lg().entries[10].num; r0.explique=av;
    conclureResolution(r0, av, 'test');
  }
  const o2 = obstaclesProcedure(p0,pr);
  proc('FOURN','DETAIL').conclusion = 'Aucun écart résiduel après résolution documentée.';
  const o3 = obstaclesProcedure(p0,pr);
  aller('fsli:FOURN','auditeur'); S.procOuverte='FOURN/DETAIL'; renderMain();
  const html = document.querySelector('#main').innerHTML;
  return { o1, o2, o3, chiffres, nonChiffres, bouton:html.includes('le testing est terminé'),
           rev:window.__rev, revNom:USERS[window.__rev].nom,
           soumet:html.includes('soumettre à la revue de ' + USERS[window.__rev].nom) };
});
ok('obstacles listés tant que des écarts ne sont pas résolus', r.o1.length>0, r.o1.join(' ; '));
ok('un écart non chiffré se résout par le même casier', !r.o2.some(x=>x.includes('résolution')),
   `${r.chiffres} chiffré(s) et ${r.nonChiffres} non chiffré(s) résolus · ${r.o2.join(' ; ')}`);
ok('dernier obstacle : la conclusion de la procédure', r.o3.length===0, r.o3.join(' ; '));
ok('le bouton « le testing est terminé » nomme le réviseur', r.bouton&&r.soumet, r.revNom);

r = await p.evaluate(()=>{
  document.querySelector('[data-tstat="SEC-FOURN-DETAIL|acheve"]').click();
  const t = trav('SEC-FOURN-DETAIL');
  return { statut:t.statut, par:t.acheve&&t.acheve.par, html:document.querySelector('#main').innerHTML.includes('Testing déclaré terminé') };
});
ok('le clic porte le travail à « achevé »', r.statut==='acheve'&&r.par==='karim');
ok('la section affiche l’attente de revue', r.html);

// 11. seul le réviseur peut porter « revu »
r = await p.evaluate(()=>{
  const a = changerStatut('SEC-FOURN-DETAIL','revu');       // karim n'est pas réviseur
  S.moi=window.__rev;
  const b = changerStatut('SEC-FOURN-DETAIL','revu');
  return { a, b, statut:trav('SEC-FOURN-DETAIL').statut };
});
ok('le préparateur ne peut pas se revoir lui-même', !r.a.ok, r.a.why);
ok('le réviseur affecté porte « revu »', r.b.ok&&r.statut==='revu');

// 12. agrégation au tableau de bord
await p.evaluate(()=>aller('pil.avance','pilotage'));
r = await p.evaluate(()=>{const h=document.querySelector('#main').innerHTML;
  return ['Justificatifs reçus','Traités sans écart','Écarts à expliquer','Écarts expliqués'].filter(x=>h.includes(x));});
ok('les cinq états agrégés au tableau de bord', r.length===4, r.join(' · '));

console.log('\nerreurs :', errs.length?errs.join(' | '):'aucune');
console.log('réseau  :', net.length?net.join(','):'aucun');
await b.close();
