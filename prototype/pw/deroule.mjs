import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1600,height:1200}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
await p.goto(cible(),{waitUntil:'networkidle'});
const ok=(t,c,d='')=>console.log((c?'  ok  ':'ÉCHEC ')+t+(d?' — '+d:''));

let r = await p.evaluate(()=>{
  const p0=postesCalcules().find(x=>x.code==='CA');
  const pr=proceduresRequises(p0).find(x=>x.code==='DETAIL');
  const e=echantillonProc(p0,pr), ctr=controles(p0,pr), st=trav('SEC-CA-DETAIL');
  const req=S.requetes.filter(x=>x.section==='CA'&&x.proc==='DETAIL');
  const ec=ecartsProc(p0,pr);
  const anos=anomalies().filter(x=>x.section==='CA'&&!x.souSeuil);
  const notes=S.notes.filter(n=>n.ancre.section==='CA');
  return {
    methode:e.methode, taille:e.n, retenus:e.retenus.length, pop:e.pop.items.length,
    intervalleLarge:e.intervalleLarge, couverture:Math.round(e.taux*1000)/10,
    req:req.length, items:req[0]?req[0].items.length:0,
    deposes:req[0]?req[0].items.filter(i=>i.statut==='depose').length:0,
    etats:comptesEtats(ctr), ctr:ctr.length,
    ecarts:ec.length, resolus:ec.filter(c=>resolutionAcquise(c)).length,
    chiffres:ec.filter(c=>constateDe(c)!==0).map(c=>({cle:c.ligne.cle,c:constateDe(c),
      acquis:resolutionAcquise(c), disp:(resolLue(c)||{}).disposition})),
    cumul:anos.map(x=>({lib:x.lib.slice(0,42),c:x.constate,m:x.montant})),
    notes:notes.map(n=>({auteur:n.auteur,pour:n.pour,rep:n.reponses.length,clos:n.clos&&n.clos.par})),
    trav:{prep:st.preparateur,rev:st.reviseur,statut:st.statut,
          acheve:st.acheve&&st.acheve.par, revu:st.revu&&st.revu.par, heures:st.heuresReel},
    concl:proc('CA','DETAIL').conclusion,
  };
});
console.log(`     ${r.retenus} éléments sur ${r.pop} · ${r.ctr} contrôles · couverture ${r.couverture} %`);
ok('la sélection est tirée, et par la méthode que l’écran recommande',
   r.methode==='sum' && !r.intervalleLarge, `${r.methode}, taille ${r.taille}, intervalle au seuil`);
ok('la requête est émise depuis le catalogue de preuve', r.req===1 && r.items===r.retenus,
   `${r.items} éléments demandés`);
ok('les pièces sont déposées côté client', r.deposes===r.items, `${r.deposes}/${r.items} complets`);
ok('aucun élément ne reste « en attente » : l’état est DÉRIVÉ du dépôt',
   r.etats.attente===0, JSON.stringify(r.etats));
ok('les champs sont relevés selon le catalogue', r.etats.recue===0 && r.etats.traitee>0,
   `${r.etats.traitee} contrôle(s) traités sans écart`);

ok('deux écarts chiffrés sont rencontrés', r.chiffres.length===2,
   r.chiffres.map(x=>`${x.cle} ${x.c/100} €`).join(' · '));
const res = r.chiffres.filter(x=>x.acquis), open = r.chiffres.filter(x=>!x.acquis);
ok('l’un est expliqué, corroboré et résolu', res.length===1 && res[0].disp==='corrigee',
   res.length?`${res[0].cle} — ${res[0].c/100} € · ${res[0].disp}`:'aucun');
ok('l’autre reste non résolu', open.length===1, open.length?`${open[0].cle} — ${open[0].c/100} €`:'aucun');
ok('et c’est LUI qui remonte au cumul des anomalies', r.cumul.length===1 && r.cumul[0].m!==0,
   r.cumul.map(x=>`${x.lib} : constaté ${x.c/100} €, résiduel ${x.m/100} €`).join(' | '));
ok('le résolu, lui, n’y est plus', !r.cumul.some(x=>x.m===0&&x.c===res[0].c));

ok('une note de revue est posée, répondue et close', r.notes.length===1
   && r.notes[0].rep===1 && !!r.notes[0].clos,
   r.notes.length?`${r.notes[0].auteur} → ${r.notes[0].pour}, close par ${r.notes[0].clos}`:'aucune');
ok('elle n’est pas close par son auteur', r.notes.length&&r.notes[0].clos!==r.notes[0].auteur);

ok('le travail est achevé par son préparateur', r.trav.acheve===r.trav.prep, `${r.trav.acheve}`);
ok('et revu par son réviseur', r.trav.revu===r.trav.rev && r.trav.statut==='revu', `${r.trav.revu}`);
ok('les heures passées sont portées au programme', r.trav.heures>0, `${r.trav.heures} h`);
ok('la conclusion de la procédure est rédigée et cite la méthode',
   r.concl.length>200 && /unités monétaires/.test(r.concl), `${r.concl.length} caractères`);

// le papier est imprimable : rien ne reste replié à l'impression
await p.evaluate(()=>{ aller('fsli:CA','auditeur'); S.dest.CA='plan'; S.procOuverte='CA/DETAIL'; render(); });
// On replie délibérément un panneau, et l'on vérifie que son contenu SORT
// quand même au papier. Comparer les longueurs de texte ne dirait rien : les
// boutons disparaissent à l'impression, et c'est voulu.
const replie = await p.evaluate(()=>{
  const d=[...document.querySelectorAll('#main details')];
  const cible=d.find(x=>x.open) || d[0];
  cible.open=false;
  cible.dataset.essai='1';
  const c=cible.querySelector(':scope > *:not(summary)');
  // À l'écran, replié : le contenu n'a AUCUN texte rendu. C'est le défaut.
  return { avant:(c.innerText||'').length, brut:(c.textContent||'').length };
});
await p.emulateMedia({media:'print'});
// emulateMedia ne déclenche pas « beforeprint » : on appelle le même point
// d'entrée que le navigateur, c'est-à-dire le mécanisme réellement en place.
const ouverts = await p.evaluate(()=>ouvrirPourImpression());
r = await p.evaluate(()=>{
  const d=[...document.querySelectorAll('#main details')];
  return { fermes:d.filter(x=>!x.open).length,
    caches:d.filter(x=>!x.open).filter(x=>{const c=x.querySelector(':scope > *:not(summary)');
      return !c||getComputedStyle(c).display==='none';}).length,
    boutons:[...document.querySelectorAll('#main button')].filter(x=>getComputedStyle(x).display!=='none').length,
    texte:document.getElementById('main').innerText.length };
});
ok('à l’impression, aucun panneau replié ne reste caché', r.caches===0, `${r.fermes} replié(s), ${r.caches} caché(s)`);
ok('les boutons ne s’impriment pas', r.boutons===0);
const sorti = await p.evaluate(()=>{
  const c=document.querySelector('#main details[data-essai] > *:not(summary)');
  return c ? (c.innerText||'').length : -1;
});
ok('le contenu d’un panneau replié sort quand même au papier',
   replie.avant===0 && sorti > 200,
   `${ouverts} panneau(x) ouverts à l’impression · replié à l’écran : ${replie.avant} caractère(s) rendus `
   + `sur ${replie.brut} · au papier : ${sorti}`);
const referme = await p.evaluate(()=>{ refermerApresImpression();
  return document.querySelectorAll('#main details[data-essai]')[0].open; });
ok('et les panneaux se referment après l’impression', referme===false);
await p.emulateMedia({media:'screen'});
r = await p.evaluate(()=>document.querySelectorAll('#main [data-imprime]').length);
ok('un bouton d’impression est offert sur le papier', r>0, `${r} bouton(s)`);

console.log('erreurs :', errs.length?errs:'aucune');
await b.close();
process.exit(0);
