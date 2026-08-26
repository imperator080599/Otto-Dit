import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1500,height:1100}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
await p.goto(cible(),{waitUntil:'networkidle'});
const ok=(t,c,d='')=>console.log((c?'  ok  ':'ÉCHEC ')+t+(d?' — '+d:''));

// 1. la coupure d'exhaustivité ne dépend plus du risque
let r = await p.evaluate(()=>{
  const out=[];
  for (const p0 of postesEnPerimetre()) for (const pr of proceduresRequises(p0)){
    if (!pr.ech) continue;
    const e = echantillonProc(p0, pr);
    out.push({ k:p0.code+'/'+pr.code, strate:e.strate, niv:e.niv, n:e.n });
  }
  return { out, PM:seuils().PM };
});
ok('la coupure d’exhaustivité vaut le seuil de planification partout',
   r.out.every(x=>x.strate===r.PM), `${new Set(r.out.map(x=>x.strate)).size} valeur(s) distincte(s), PM ${r.PM/100} €`);
ok('la taille du tirage, elle, suit toujours le risque',
   new Set(r.out.map(x=>x.n)).size>1, [...new Set(r.out.map(x=>x.niv+':'+x.n))].join(' · '));

// 2. le garde-fou se déclenche là où il doit
r = await p.evaluate(()=>{
  const l=[];
  for (const p0 of postesEnPerimetre()) for (const pr of proceduresRequises(p0)){
    if (!pr.ech) continue;
    const e = echantillonProc(p0, pr);
    l.push({ k:p0.code+'/'+pr.code, part:Math.round(e.partSig*1000)/10, garde:e.gardeFou,
             imposee:!!e.imposee,
             items:e.pop.items.length, sig:e.indivSig.length, ret:e.retenus.length });
  }
  return { l, seuil:GARDE_EXHAUSTIVE*100, n:l.filter(x=>x.garde).length };
});
console.log(`     garde-fou (> ${r.seuil} %) : ${r.n} procédure(s) sur ${r.l.length}`);
for (const x of r.l.filter(y=>y.garde).slice(0,8))
  console.log(`       ${x.k.padEnd(22)} ${String(x.sig).padStart(4)}/${String(x.items).padEnd(5)} = ${x.part} % individuellement significatifs · ${x.ret} retenus`);
// Le garde-fou dit : « vous testez presque tout SANS l'avoir décidé ». Là où
// le catalogue IMPOSE la sélection exhaustive, c'est décidé, écrit et motivé :
// le garde-fou n'a rien à signaler, et le taire serait le rendre insignifiant.
const imposees = r.l.filter(x=>x.imposee);
console.log(`     sélection exhaustive imposée par le catalogue : ${imposees.length} procédure(s)`
  + (imposees.length ? ' — ' + imposees.map(x=>`${x.k} (${x.part} %)`).join(', ') : ''));
ok('le garde-fou se déclenche exactement au-delà du seuil, sauf sélection imposée',
   r.l.every(x=>x.garde===(x.part>r.seuil && !x.imposee)),
   r.l.filter(x=>x.garde!==(x.part>r.seuil&&!x.imposee)).map(x=>x.k).join(', ')||'aucune divergence');
ok('une sélection imposée au-delà du seuil ne déclenche PAS le garde-fou',
   imposees.every(x=>!x.garde), imposees.map(x=>`${x.k} garde=${x.garde}`).join(', ')||'aucune');
ok('il se déclenche réellement sur ce jeu de données', r.n>0, `${r.n} procédure(s)`);

// Le chiffre d'affaires est la section du testing déroulé : sa méthode y a été
// portée au sondage en unités monétaires à l'intervalle adéquat. On la remet à
// la règle avant de comparer les deux méthodes, sinon on comparerait le SUM à
// lui-même.
await p.evaluate(()=>{ const st=proc('CA','DETAIL'); st.methode='strate'; st.taille=null;
  _echProcCache.clear(); });

// 3. le sondage en unités monétaires
r = await p.evaluate(()=>{
  const p0=postesCalcules().find(x=>x.code==='CA'), pr=PROCEDURES.find(x=>x.code==='DETAIL');
  const av = echantillonProc(p0,pr);
  proc('CA','DETAIL').methode='sum'; _echProcCache.clear();
  const ap = echantillonProc(p0,pr);
  return { av:{n:av.retenus.length, couv:av.taux, meth:av.methode},
    ap:{n:ap.retenus.length, couv:ap.taux, meth:ap.methode, interv:ap.intervalle,
        depart:ap.depart, unites:ap.unites.length, dOffice:ap.exhaustif.length},
    masse:ap.pop.masse, taille:ap.n, items:ap.pop.items.length };
});
console.log(`     CA/DETAIL : strate ${r.av.n} retenus (${(r.av.couv*100).toFixed(1)} % de la masse) → SUM ${r.ap.n} retenus (${(r.ap.couv*100).toFixed(1)} %)`);
ok('à la taille dictée par le risque, le SUM retient moins — mais l’intervalle est alors trop large',
   r.ap.n < r.av.n / 2, `${r.av.n} → ${r.ap.n} sur ${r.items} — voir sond2 : cet intervalle vaut 15,7 × le seuil`);
ok('l’intervalle vaut masse ÷ taille', Math.abs(r.ap.interv - Math.floor(r.masse/r.taille))<=1,
   `${(r.ap.interv/100).toFixed(2)} € = ${(r.masse/100).toFixed(0)} ÷ ${r.taille}`);
ok('le départ aléatoire est dans le premier intervalle', r.ap.depart>=0 && r.ap.depart<r.ap.interv,
   `${(r.ap.depart/100).toFixed(2)} €`);
ok('autant d’unités monétaires que la taille visée (à une près)',
   Math.abs(r.ap.unites - r.taille)<=1, `${r.ap.unites} unités pour une taille de ${r.taille}`);

// 4. tout élément supérieur à l'intervalle est retenu d'office
r = await p.evaluate(()=>{
  const p0=postesCalcules().find(x=>x.code==='CA'), pr=PROCEDURES.find(x=>x.code==='DETAIL');
  const e = echantillonProc(p0,pr);
  const gros = e.pop.items.filter(x=>x.montant>=e.intervalle);
  const cles = new Set(e.retenus.map(x=>x.cle));
  return { gros:gros.length, tousRetenus:gros.every(x=>cles.has(x.cle)), interv:e.intervalle };
});
ok('tout élément ≥ intervalle est retenu d’office', r.tousRetenus, `${r.gros} élément(s) ≥ ${(r.interv/100).toFixed(0)} €`);

// 5. la probabilité est proportionnelle à la valeur
r = await p.evaluate(()=>{
  const p0=postesCalcules().find(x=>x.code==='CA'), pr=PROCEDURES.find(x=>x.code==='DETAIL');
  const e = echantillonProc(p0,pr);
  const petits = e.pop.items.filter(x=>x.montant<e.intervalle);
  const cles = new Set(e.retenus.map(x=>x.cle));
  const ret = petits.filter(x=>cles.has(x.cle)), non = petits.filter(x=>!cles.has(x.cle));
  const moy = l => l.length ? l.reduce((a,x)=>a+x.montant,0)/l.length : 0;
  return { retMoy:Math.round(moy(ret)/100), nonMoy:Math.round(moy(non)/100), nRet:ret.length, nNon:non.length };
});
ok('parmi les petits, les retenus sont en moyenne plus gros — probabilité proportionnelle à la valeur',
   r.retMoy > r.nonMoy, `retenus ${r.retMoy} € (n=${r.nRet}) · non retenus ${r.nonMoy} € (n=${r.nNon})`);

// 6. déterminisme et rejouabilité
r = await p.evaluate(()=>{
  const p0=postesCalcules().find(x=>x.code==='CA'), pr=PROCEDURES.find(x=>x.code==='DETAIL');
  const a = echantillonProc(p0,pr).retenus.map(x=>x.cle).join(',');
  _echProcCache.clear();
  const b = echantillonProc(p0,pr).retenus.map(x=>x.cle).join(',');
  const seedAv = proc('CA','DETAIL').seed;
  proc('CA','DETAIL').seed = seedAv + '-x'; _echProcCache.clear();
  const c = echantillonProc(p0,pr).retenus.map(x=>x.cle).join(',');
  proc('CA','DETAIL').seed = seedAv; _echProcCache.clear();
  const d = echantillonProc(p0,pr).retenus.map(x=>x.cle).join(',');
  return { rejouable:a===b, germeChange:a!==c, retour:a===d };
});
ok('le tirage est rejouable à l’identique', r.rejouable && r.retour);
ok('changer le germe change le tirage', r.germeChange);

// 7. la méthode est affichée sur le papier, avec sa justification
await p.evaluate(()=>{ S.dest.CA='plan'; S.procOuverte='CA/DETAIL'; aller('fsli:CA','auditeur'); });
r = await p.evaluate(()=>{const h=document.querySelector('#main').innerHTML;
  return { meth:h.includes('Méthode retenue'), just:h.includes('probabilité proportionnelle à sa valeur'),
    interv:h.includes('Intervalle de sondage'), sel:!!document.querySelector('[data-pmeth]'),
    opts:[...document.querySelectorAll('[data-pmeth] option')].map(o=>o.value) };});
ok('le papier affiche la méthode et sa justification', r.meth&&r.just&&r.interv);
ok('la méthode est modifiable par procédure', r.sel&&r.opts.join()==='strate,sum');

// 8. le garde-fou apparaît à l'écran et propose la bascule
r = await p.evaluate(()=>{
  proc('CA','DETAIL').methode='strate'; _echProcCache.clear();
  S.procOuverte='CA/DETAIL'; renderMain();
  const h=document.querySelector('#main').innerHTML;
  const btn=document.querySelector('[data-psum="DETAIL"]');
  const av=echantillonProc(postesCalcules().find(x=>x.code==='CA'),PROCEDURES.find(x=>x.code==='DETAIL')).retenus.length;
  if (btn) btn.click();
  const ap=echantillonProc(postesCalcules().find(x=>x.code==='CA'),PROCEDURES.find(x=>x.code==='DETAIL')).retenus.length;
  return { visible:h.includes('sont individuellement')&&h.includes('n’est plus une strate'),
    bandes:h.includes('stratification en bandes'), btn:!!btn, av, ap,
    meth:proc('CA','DETAIL').methode };
});
ok('le garde-fou est dit à l’écran', r.visible);
ok('il nomme la stratification en bandes comme non implémentée', r.bandes);
ok('il propose la bascule, et la bascule agit', r.btn&&r.meth==='sum'&&r.ap<r.av, `${r.av} → ${r.ap} éléments`);

// 9. les trois alternatives d'approche sont nommées là où le garde-fou tombe
r = await p.evaluate(()=>{
  proc('CA','DETAIL').methode='strate'; proc('CA','DETAIL').taille=null; _echProcCache.clear();
  S.dest.CA='plan'; S.procOuverte='CA/DETAIL'; aller('fsli:CA','auditeur');
  const h=document.querySelector('#main').innerHTML;
  return { titre:h.includes('n’est pas économique sur ce poste'),
    alts:ALTERNATIVES_APPROCHE.map(x=>x.lib).filter(x=>h.includes(x)),
    exige:h.includes('qui n’est pas gratuit'),
    neFaitPas:h.includes('il ne la prend pas') };
});
ok('le garde-fou dit que l’approche substantive n’est pas économique', r.titre);
ok('les trois alternatives sont nommées', r.alts.length===3, r.alts.join(' · '));
ok('chacune porte ce qu’elle exige, pas seulement son nom', r.exige);
ok('la plateforme signale la décision sans la prendre', r.neFaitPas);

console.log('\nerreurs :', errs.length?[...new Set(errs)].join(' | '):'aucune');
await b.close();
