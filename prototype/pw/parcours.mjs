/* LE PARCOURS DE DÉMONSTRATION, joué pas à pas sur le fichier livré.
   Ce harnais n'est pas un test de plus : c'est la garantie que DEMO.md dit
   vrai. Chaque étape porte le numéro de l'étape du document. Si une phrase
   promet un chiffre, ce harnais le relève et le compare. */
import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
let ko=0; const ok=(c,m,d='')=>{ console.log((c?'  ok  ':'ÉCHEC ')+m+(d?' — '+d:'')); if(!c) ko++; };
const errs=[], net=[];
const p = await (await b.newContext({viewport:{width:1500,height:1000}})).newPage();
p.on('pageerror',e=>errs.push(e.message));
p.on('request',r=>{ if(!r.url().startsWith('file://')) net.push(r.url()); });
await p.goto(cible(),{waitUntil:'networkidle'});

// ── 1. l'outil s'ouvre sur le PILOTAGE
let r = await p.evaluate(()=>({
  espace:S.espace, vue:S.vue, titre:document.querySelector('#main .hd h1').textContent.trim(),
  svg:document.querySelectorAll('#main svg').length,
}));
ok(r.espace==='pilotage' && r.svg>=5, '1 · l’outil s’ouvre sur le pilotage, avec ses lectures graphiques',
   `${r.titre} · ${r.svg} graphiques`);

// ── 2. « Mes travaux » : la liste de Karim, et ce qui la bloque
r = await p.evaluate(()=>{
  aller('plan.moi','auditeur');
  const t=[...document.querySelectorAll('#main table tbody tr')];
  return { titre:document.querySelector('#main .hd h1').textContent.trim(),
    lignes:t.length, papier:document.querySelectorAll('#main [data-gopapier]').length,
    bloque:document.querySelector('#main table tbody tr').innerText.includes('justificatif') };
});
ok(/Karim Benali/.test(r.titre) && r.lignes>0 && r.papier>0,
   '2 · « Mes travaux » ouvre la liste de Karim avec le lien direct vers le papier',
   `${r.lignes} travaux · ${r.papier} liens`);

// ── 3. le papier du test de détail, ouvert d'un clic
r = await p.evaluate(()=>{
  const btn=[...document.querySelectorAll('#main [data-gopapier]')]
    .find(x=>x.dataset.gopapier==='CA|DETAIL') || document.querySelector('#main [data-gopapier]');
  btn.click();
  return { vue:S.vue, dest:S.dest.CA, proc:S.procOuverte };
});
ok(r.vue==='fsli:CA' && r.dest==='plan', '3 · le lien ouvre la section sur ses procédures d’audit',
   `${r.vue} · ${r.dest} · ${r.proc}`);

// ── 4. le testing déroulé : sondage en unités monétaires, 167 éléments, 2 anomalies
r = await p.evaluate(()=>{
  const pp=postesCalcules().find(x=>x.code==='CA');
  const pr=proceduresRequises(pp).find(x=>x.code==='DETAIL');
  const e=echantillonProc(pp,pr), st=proc('CA','DETAIL'), wp=wpProc(pp,pr)||[];
  const ec=controles(pp,pr).filter(c=>c.ecart);
  return { methode:st.methode, retenus:e.retenus.length, population:e.pop?e.pop.length:null,
    lignes:wp.length, ecarts:ec.length,
    statut:trav('SEC-CA-DETAIL').statut,
    montants:ec.map(c=>Math.round(Math.abs(c.ecart)/100)).filter(x=>x>=100) };
});
console.log('     testing :', JSON.stringify(r));
ok(r.methode==='sum' && r.retenus===167 && r.lignes===167,
   '4 · sondage en unités monétaires : 167 éléments retenus, 167 lignes de papier',
   `méthode ${r.methode} · ${r.retenus} éléments`);
ok(r.statut==='revu', '4 · le travail est achevé par son préparateur ET revu par sa réviseuse', r.statut);
ok(r.montants.includes(4850) && r.montants.includes(620),
   '4 · les deux anomalies de montant sont rencontrées (620 € et 4 850 €)', r.montants.join(' · ') + ' €');

// ── 5. le visa reste IMPOSSIBLE : la section n'est pas visée
r = await p.evaluate(()=>{
  const pp=postesCalcules().find(x=>x.code==='CA');
  return { obstacles:obstaclesVisa(pp), visa:sec('CA').visa };
});
console.log('     obstacles CA :', JSON.stringify(r.obstacles));
ok(!r.visa && r.obstacles.length===10, '5 · travail revu, et pourtant la section n’est PAS visée — DIX obstacles',
   r.obstacles.length + ' obstacle(s)');
/* DEMO.md cite ces chiffres : le harnais les tient. */
r = await p.evaluate(()=>({ notes:S.notes.length, closes:S.notes.filter(n=>n.clos).length,
  requetes:S.requetes.length }));
ok(r.notes===1 && r.closes===1, '5 · une note de revue a été posée PUIS close pendant le déroulé',
   `${r.closes}/${r.notes}`);
ok(r.requetes===5, '5 · cinq demandes au portail', String(r.requetes));

// ── 6. une constatation circule : le registre des facteurs
r = await p.evaluate(()=>{
  aller('plan.facteurs','auditeur');
  const reg=registre();
  const auto=reg.filter(f=>f.source!=='manuel');
  const cibles=new Set(reg.flatMap(f=>(f.cibles||[]).map(c=>c.fsli)));
  return { total:reg.length, derives:auto.length, sections:cibles.size,
    regles:[...new Set(reg.map(f=>f.regle))].length,
    exemple:auto[0]?{ regle:auto[0].regle, cibles:(auto[0].cibles||[]).length }:null };
});
console.log('     registre :', JSON.stringify(r));
ok(r.total===16 && r.sections===11, '6 · seize constatations se posent seules sur onze sections',
   `${r.total} facteurs · ${r.regles} règles · ${r.sections} sections visées`);

// ── 7. l'indépendance REFUSE
r = await p.evaluate(()=>{
  const a=affecter('SEC-CLIENTS-RAPPRO','preparateur','hugo');
  return { ok:a.ok, why:a.why||'' };
});
ok(!r.ok && /indépendance/.test(r.why), '7 · le système REFUSE d’affecter un travail à qui n’a pas signé',
   r.why.slice(0,80));

// ── 8. la version 4 fait basculer les anomalies, sans aucune saisie
r = await p.evaluate(()=>{
  aller('plan.ajust','auditeur');
  const av=cumulAnomalies();
  const prevu=cumulAuVersion(4);
  prendreEnCompte(4);
  const ap=cumulAnomalies();
  return { version:S.version,
    avant:{ n:av.n, corrigees:av.nCorrigees, residuel:Math.round(av.residuel/100) },
    prevu:{ corrigees:prevu.nCorrigees, residuel:Math.round(prevu.residuel/100) },
    apres:{ n:ap.n, corrigees:ap.nCorrigees, residuel:Math.round(ap.residuel/100) } };
});
console.log('     bascule v4 :', JSON.stringify(r));
ok(r.version===4 && r.apres.corrigees>r.avant.corrigees,
   '8 · prendre la version 4 fait basculer des anomalies en « corrigée », sans une saisie',
   `${r.avant.corrigees} → ${r.apres.corrigees} corrigées · résiduel ${r.avant.residuel} € → ${r.apres.residuel} €`);
ok(r.prevu.corrigees===r.apres.corrigees && r.prevu.residuel===r.apres.residuel,
   '8 · l’écran ANNONÇAIT exactement la bascule qu’il a produite',
   `annoncé ${r.prevu.corrigees}/${r.prevu.residuel} € · obtenu ${r.apres.corrigees}/${r.apres.residuel} €`);

// ── 9. le portail client : la dette d'abord
r = await p.evaluate(()=>{
  aller('cli.vue','client');
  const rangs=[...document.querySelectorAll('#main .rangc')].map(x=>x.querySelector('b').textContent.trim());
  const dus=S.requetes.filter(x=>!requeteSoldee(x)).reduce((a,x)=>a+elementsDus(x),0);
  return { rangs, dus, premier:document.querySelector('#main section.blk .num').textContent.trim(),
    seuils:!!document.querySelector('.seuilbox') };
});
console.log('     portail :', JSON.stringify(r));
ok(r.rangs[0]==='En retard' && r.dus===9 && r.rangs.length===4,
   '9 · le portail s’ouvre sur ce que le client doit MAINTENANT — 9 documents, 4 rangs',
   `${r.dus} documents dus · rangs : ${r.rangs.join(' → ')}`);
ok(!r.seuils, '9 · le client ne voit AUCUN seuil — le bandeau n’est pas construit chez lui');

// ── 10. la piste d'audit répond aux trois questions
r = await p.evaluate(()=>{
  aller('plan.piste','pilotage');
  const txt=document.getElementById('main').innerText;
  return { evenements:S.events.length, quoi:S.events.map(e=>e.quoi),
    lu:S.events.every(e=>txt.includes(e.quoi)),
    qui:S.events.every(e=>txt.includes(e.qui)) };
});
ok(r.evenements>0 && r.lu && r.qui,
   '10 · chaque geste de la séance est au journal, avec son auteur',
   r.evenements + ' événement(s) : ' + r.quoi.join(' · '));

/* ── LE DOCUMENT LUI-MÊME ─────────────────────────────────────────────────
   Un script de démonstration qui déborde n'est pas un script : c'est un
   monologue. Le budget est ferme — sept minutes de démonstration sur vingt
   d'entretien — et il se vérifie ici, pas à la montre devant l'auditeur. */
{
  const fs = await import('node:fs');
  const path = await import('node:path');
  const doc = fs.readFileSync(path.resolve(process.argv[2], '..', '..', 'DEMO.md'), 'utf8');
  const par = doc.slice(doc.indexOf('## LE PARCOURS'), doc.indexOf('## Ce qu’il faut dire') + 1
                     || doc.indexOf("## Ce qu'il faut dire"));
  const sec = [...par.matchAll(/\*\((\d+)\s*s/g)].map(m=>+m[1]);
  const total = sec.reduce((a,x)=>a+x,0);
  console.log(`     DEMO.md : ${sec.length} segments chronométrés · ${total} s = ${Math.floor(total/60)} min ${total%60} s`);
  ok(total<=420, 'le parcours tient en sept minutes', `${total} s sur 420`);
  ok(sec.length>=13, 'chaque étape et chaque pause porte sa durée', sec.length + ' segments');

  const pauses = (par.match(/### ⏸ PAUSE \d/g)||[]).length;
  ok(pauses===3, 'trois moments où c’est l’auditeur qui parle', pauses + ' pause(s)');

  /* La feuille de capture doit couvrir les SIX questions de la falsification,
     et le dépouillement porter les cinq seuils de bascule. Un document qui les
     perdrait de vue redeviendrait une plaquette. */
  const q = [1,2,3,4,5,6].filter(n=>new RegExp('\\bQ'+n+'\\b').test(doc));
  ok(q.length===6, 'la feuille de capture couvre les six questions de docs/10_FALSIFICATION.md',
     'Q' + q.join(' · Q'));
  const seuils = ['≥ 6 / 12','≥ 5 / 12','≥ 9 / 12','≥ 8 / 12'].filter(x=>doc.includes(x));
  ok(seuils.length===4, 'le tableau de dépouillement porte les seuils de bascule', seuils.join(' · '));
  const demandes = (doc.match(/### Demande \d/g)||[]).length;
  ok(demandes===3, 'trois demandes de fin, par engagement croissant', demandes + ' demande(s)');
  ok(/spontanément/.test(doc), 'la règle du prix cité SPONTANÉMENT est écrite');
}

console.log('erreurs :', errs.length?errs.join(' | '):'aucune');
console.log('réseau :', net.length?net.join(','):'aucun');
if (errs.length){ ko++; console.log('ÉCHEC — erreurs page'); }
if (net.length){ ko++; console.log('ÉCHEC — requête réseau'); }
console.log(ko?ko+' échec(s)':'parcours : tout est vert');
await b.close();
process.exit(ko?1:0);
