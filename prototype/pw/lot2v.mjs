import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1500,height:1100}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
const net=[]; p.on('request',r=>{if(!r.url().startsWith('file://'))net.push(r.url());});
await p.goto(cible(),{waitUntil:'networkidle'});
const ok=(t,c,d='')=>console.log((c?'  ok  ':'ÉCHEC ')+t+(d?' — '+d:''));

// 1. quatre versions, les 3 et 4 reçues et en attente
let r = await p.evaluate(()=>({ n:VERSIONS.length, active:S.version,
  attente:versionsEnAttente().map(v=>v.n), recues:versionsRecues().length,
  emp:VERSIONS.map(v=>empreinteVersion(v.n)) }));
ok('quatre versions, dossier à la v2, v3 et v4 reçues en attente',
   r.n===4&&r.active===2&&r.attente.join()==='3,4', `v${r.active} · en attente ${r.attente.join(',')}`);
ok('empreintes distinctes par version', new Set(r.emp).size===4, r.emp.join(' '));

// 2. une version n'est pas une régénération : le grand livre v1 est un préfixe de v2 puis v3
r = await p.evaluate(()=>{
  const a=ledgerVersion(1).entries, b=ledgerVersion(2).entries, c=ledgerVersion(3).entries;
  const prefixe=(x,y)=>x.every((e,i)=>y[i]&&y[i].num===e.num);
  return { n:[a.length,b.length,c.length], p12:prefixe(a,b), p23:prefixe(b,c),
    anciennes:a.filter((e,i)=>c[i].num!==e.num).length };
});
ok('le grand livre v1 reste intact dans v2 et v3', r.p12&&r.p23&&r.anciennes===0, r.n.join(' → '));

// 3. les seuils bougent avec la version, dans les deux sens
r = await p.evaluate(()=>[1,2,3].map(n=>auVersion(n,()=>{const s=seuils();return {n,M:s.M,PM:s.PM,CTT:s.CTT};})));
ok('les seuils baissent en v2 puis remontent en v3', r[1].M<r[0].M && r[2].M>r[1].M,
   r.map(x=>`v${x.n} M ${x.M/100}`).join(' · '));

// 3b. chaque version reste équilibrée, balance et grand livre
r = await p.evaluate(()=>[1,2,3].map(n=>{
  const T=tbVersion(n), L=ledgerVersion(n);
  const t=T.reduce((a,x)=>({d:a.d+x[2],c:a.c+x[3]}),{d:0,c:0});
  let d=0,c=0,unbal=0;
  for(const e of L.entries){let ed=0,ec=0;for(const l of e.lines){ed+=l.debit;ec+=l.credit;}if(ed!==ec)unbal++;d+=ed;c+=ec;}
  return { n, tbOk:t.d===t.c, glOk:d===c, unbal, tb:t.d/100, gl:d/100 };
}));
ok('chaque version : balance équilibrée', r.every(x=>x.tbOk), r.map(x=>`v${x.n} ${x.tb}`).join(' · '));
ok('chaque version : grand livre équilibré, 0 écriture déséquilibrée',
   r.every(x=>x.glOk&&x.unbal===0), r.map(x=>`v${x.n} ${x.gl}`).join(' · '));

// 4. le rapport d'impact répond aux six questions
r = await p.evaluate(()=>{
  const i12 = impact(1,2), i23 = impact(2,3);
  return {
    m12:i12.mouvements.length, m23:i23.mouvements.length,
    f12:i12.franchit.length, f23:i23.franchit.length,
    p12:i12.perimetre.map(x=>x.code+':'+x.sens), p23:i23.perimetre.map(x=>x.code+':'+x.sens),
    e12:i12.echantillons.length, e23:i23.echantillons.length,
    c12:i12.corrigees.map(x=>x.compte), n23:i23.nouvelles.map(x=>x.compte),
    seuils12:i12.seuilsBougent, sansBouger:i12.franchit.filter(x=>!x.bouge).length + i23.franchit.filter(x=>!x.bouge).length,
  };
});
ok('1. comptes qui ont bougé', r.m12>0&&r.m23>0, `v1→v2 : ${r.m12} · v2→v3 : ${r.m23}`);
ok('2. comptes qui franchissent le seuil de remontée', r.f12+r.f23>0, `${r.f12} + ${r.f23}`);
ok('… le cas « franchit sans avoir bougé » est vérifié, pas supposé', r.sansBouger===0,
   `${r.sansBouger} compte(s) — le rapport le dit explicitement quand il n’y en a pas`);
ok('3. postes qui entrent au périmètre', r.p23.includes('IMMO_INC:entre'), `v2→v3 : ${r.p23.join(' ')||'aucun'}`);
ok('4. sélections périmées', r.e12>0||r.e23>0, `v1→v2 : ${r.e12} · v2→v3 : ${r.e23}`);
ok('6. écart de rapprochement résorbé par la v2', r.c12.includes('411000')&&r.c12.includes('706000'), r.c12.join(' '));
ok('… et écart rouvert par la v3', r.n23.length===2, r.n23.join(' '));

// 5. rapprochement rejoué à chaque version, les écarts antérieurs restent lisibles
r = await p.evaluate(()=>[1,2,3].map(n=>rapprochement(n).filter(x=>x.ecart!==0).map(x=>x.compte+' '+(x.ecart/100))));
ok('rapprochement rejoué, écarts antérieurs consultables', r[0].length===2&&r[1].length===0&&r[2].length===2,
   `v1 ${r[0].join('/')} | v2 aucun | v3 ${r[2].join('/')}`);

// 6. un papier exécuté sur v2 devient périmé quand on prend en compte v3
r = await p.evaluate(()=>{
  S.moi='karim';
  affecter('SEC-CA-DETAIL','preparateur','karim'); affecter('SEC-CA-DETAIL','reviseur','lea');
  const p0=postesCalcules().find(x=>x.code==='CA'), pr=PROCEDURES.find(x=>x.code==='DETAIL');
  requeteJustificatifsProc(p0,pr);
  const docs=docsAttendusProc(p0,pr).length;
  for (const q of S.requetes.filter(x=>x.section==='CA'&&x.proc==='DETAIL'))
    for (const it of q.items) for (let k=0;k<docs;k++) deposer(q.id,it.id);
  for (const c of controles(p0,pr)){
    if (etatControle(c)!=='recue') continue;
    const v=c.ch.val(c.ligne.x);
    c.ligne.champs[c.cle]=c.ch.type==='montant'?(v/100).toFixed(2).replace('.',','):c.ch.type==='bool'?(v?'oui':'non'):String(v);
    marquerExecution(p0,pr);
  }
  proc('CA','DETAIL').conclusion='Testing exécuté.';
  for (const c of ecartsProc(p0,pr)){
    const r0=resol(c), av=constateDe(c);
    r0.expl='x'; r0.concl='y'; r0.disposition='pas_anomalie'; r0.corrobEcriture=lg().entries[10].num; r0.explique=av;
    conclureResolution(r0,av,'t');
  }
  const av = { exec:proc('CA','DETAIL').execVersion, per:peremption(p0,pr), obst:obstaclesProcedure(p0,pr) };
  changerStatut('SEC-CA-DETAIL','acheve');
  const statutAvant = trav('SEC-CA-DETAIL').statut;
  prendreEnCompte(3);
  const p1=postesCalcules().find(x=>x.code==='CA'), pr1=PROCEDURES.find(x=>x.code==='DETAIL');
  const per = peremption(p1,pr1);
  const t = travaux().find(x=>x.code==='SEC-CA-DETAIL');
  const rc = aReconfirmer(t);
  return { av, statutAvant, per, rc, statutStocke:trav('SEC-CA-DETAIL').statut,
    obstacles:obstaclesVisa(p1).filter(x=>x.includes('version')||x.includes('reconfirmer')) };
});
ok('le papier stampe la version sur laquelle il a été exécuté', r.av.exec===2, 'v'+r.av.exec);
ok('avant bascule : pas de péremption', r.av.per===null);
ok('le travail est achevé sur la v2', r.statutAvant==='acheve');
ok('après bascule en v3 : le papier est périmé', !!r.per, r.per?`v${r.per.de} → v${r.per.a}, population changée : ${r.per.populationChangee}`:'');
ok('le travail passe « à reconfirmer » avec son motif', !!r.rc, r.rc?r.rc.motif:'');
ok('le statut stocké n’est PAS modifié en silence', r.statutStocke==='acheve');
ok('le visa de la section est bloqué par la reconfirmation', r.obstacles.length>0, r.obstacles.join(' ; '));

// 7. revenir à la version d'exécution rend le travail à son état, sans écriture
r = await p.evaluate(()=>{
  prendreEnCompte(2);
  const t = travaux().find(x=>x.code==='SEC-CA-DETAIL');
  return { rc:aReconfirmer(t), statut:trav('SEC-CA-DETAIL').statut };
});
ok('retour en v2 : le travail redevient achevé, rien n’a été écrit', r.rc===null&&r.statut==='acheve');

// 8. reconfirmation
r = await p.evaluate(()=>{
  prendreEnCompte(3);
  S.moi='lea';
  const a = reconfirmer('SEC-CA-DETAIL');       // léa n'est pas préparatrice
  S.moi='karim';
  const b = reconfirmer('SEC-CA-DETAIL');
  const t = travaux().find(x=>x.code==='SEC-CA-DETAIL');
  return { a, b, rc:aReconfirmer(t), exec:proc('CA','DETAIL').execVersion };
});
ok('seul le préparateur affecté peut reconfirmer', !r.a.ok, r.a.why);
ok('la reconfirmation stampe la version courante', r.b.ok&&r.rc===null&&r.exec===3);

// 9. la vue rend les six sections et la balance multi-colonnes
await p.evaluate(()=>aller('plan.versions','auditeur'));
r = await p.evaluate(()=>{const h=document.querySelector('#main').innerHTML;
  return ['1. Comptes qui ont bougé','2. Comptes qui franchissent','3. Postes qui entrent',
          '4. Sélections périmées','5. Travaux achevés','6. Anomalies déjà corrigées',
          'Balance, une colonne par version','Rapprochement rejoué'].filter(x=>h.includes(x));});
ok('la vue rend les six réponses, la balance et le rapprochement', r.length===8, r.length+'/8');

console.log('\nerreurs :', errs.length?errs.join(' | '):'aucune');
console.log('réseau  :', net.length?net.join(','):'aucun');
await b.close();
