import { chromium } from 'playwright';
import { NAV, cible } from './_nav.mjs';
const b = await chromium.launch(NAV);
const p = await (await b.newContext({viewport:{width:1600,height:1100}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(cible(),{waitUntil:'networkidle'});
const ok=(t,c,d='')=>console.log((c?'  ok  ':'ÉCHEC ')+t+(d?' — '+d:''));

/* Les libellés qui NAVIGUENT — rail des trois espaces + destinations d'une
   section — sont ceux qu'on lit hors contexte : ce sont eux qui doivent se
   distinguer les uns des autres. « Plan de travail » et « Programme de
   travail » partageaient un suffixe de deux mots pour désigner deux objets
   sans rapport ; c'est le défaut que ce harnais cherche. */
const nav = new Set(), vues = [];
for (const esp of ['auditeur','client','pilotage']){
  await p.evaluate(x=>{S.espace=x; render();}, esp);
  // le rail ne déploie qu'un groupe : les libellés se demandent au modèle
  for (const l of await p.evaluate(()=>railItems().flatMap(g=>g.items.map(i=>i.lib))
      .concat(S.espace==='client'?[]:['Mes travaux']))) nav.add(l);
  const vs = await p.evaluate(()=>toutesDestinations());
  for (const v of vs){
    await p.evaluate(x=>aller(x), v);
    vues.push({ v, ...await p.evaluate(()=>({
      blocs:[...document.querySelectorAll('#main h2')].map(h=>h.textContent.trim()),
      dest:[...document.querySelectorAll('#main .destnav a, #main .destnav button')]
        .map(a=>a.textContent.replace(/\s*\d+\s*$/,'').trim()),
    })) });
  }
}
const destSet = [...new Set(vues.flatMap(x=>x.dest))].filter(Boolean);
const navigants = [...new Set([...nav, ...destSet])].filter(Boolean);

/* 1. aucun titre de bloc en double DANS une même vue : la référence de papier
      en dérive, deux blocs de même titre partageraient la même référence. */
const dupIntra = vues.filter(x => new Set(x.blocs).size !== x.blocs.length)
  .map(x => x.v + ' : ' + x.blocs.filter((t,i)=>x.blocs.indexOf(t)!==i).join(', '));
ok('aucun titre de bloc en double dans une même vue', dupIntra.length===0, dupIntra.join(' | ')||'aucun');

/* 2. couples à risque de confusion */
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/[’']/g,"'").replace(/[^a-z0-9' ]/g,' ').replace(/\s+/g,' ').trim();
function lev(a,b){
  const m=a.length,n=b.length; if(Math.abs(m-n)>2) return 99;
  const d=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);
  for(let j=0;j<=n;j++) d[0][j]=j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  return d[m][n];
}
const affixe = (a,b,fin) => {                 // mots partagés en tête ou en queue
  const A=a.split(' '), B=b.split(' ');
  if (fin){ A.reverse(); B.reverse(); }
  let k=0; while(k<A.length&&k<B.length&&A[k]===B[k]) k++;
  return k;
};
/* Couples ADMIS, chacun avec sa raison écrite. Un couple qui n'y figure pas
   fait échouer le harnais : la liste est la décision, pas le silence. */
const ADMIS = {
  'notes de revue transverse | notes de revue':
    'même objet à deux portées : les notes d’une section, et toutes celles du dossier',
  'requetes toutes sections | requetes':
    'même objet à deux portées : les requêtes d’une section, et celles du dossier',
  'revue analytique preliminaire | revue analytique finale':
    'même procédure à deux moments du dossier ; le qualificatif EST la distinction, et c’est le vocabulaire de place',
  'contacts de la mission | vue globale de la mission':
    'suffixe commun, objets sans confusion possible : un carnet d’adresses et un tableau de bord',
  'facteurs de risque | risque':
    'même objet à deux portées : le registre transverse au rail, l’évaluation d’une section en destination',
  'clients et comptes rattaches | comptes':
    'un poste des comptes annuels et une destination de section : la destination n’existe qu’à l’intérieur d’un poste, jamais à côté de lui dans une liste',
  'immobilisations incorporelles | immobilisations corporelles':
    'ce sont les libellés du plan comptable, pas un choix de nommage : deux masses distinctes du bilan que tout comptable lit sans hésiter ; les renommer nous éloignerait du référentiel pour rapprocher deux objets déjà distincts',
  'provisions pour risques | risque':
    'un poste des comptes annuels et une destination de section, jamais lus au même niveau',
};
const cands = [];
for (let i=0;i<navigants.length;i++) for (let j=i+1;j<navigants.length;j++){
  const x=navigants[i], y=navigants[j], a=norm(x), c=norm(y);
  if (a.length<6||c.length<6) continue;
  const raisons=[];
  if (a.includes(c)||c.includes(a)) raisons.push('inclusion');
  if (lev(a,c)<=2) raisons.push('distance '+lev(a,c));
  if (affixe(a,c,false)>=2) raisons.push(affixe(a,c,false)+' mots en tête');
  if (affixe(a,c,true)>=2)  raisons.push(affixe(a,c,true)+' mots en queue');
  if (raisons.length) cands.push({ x, y, raisons, cle:[x,y].map(norm).join(' | ') });
}
console.log(`     ${navigants.length} libellés navigants · ${cands.length} couple(s) à risque de confusion`);
for (const c of cands){
  const admis = ADMIS[c.cle] || ADMIS[[c.y,c.x].map(norm).join(' | ')];
  console.log(`       « ${c.x} » / « ${c.y} » — ${c.raisons.join(', ')} · ${admis ? 'ADMIS : '+admis : 'NON ADMIS'}`);
}
const nonAdmis = cands.filter(c => !(ADMIS[c.cle] || ADMIS[[c.y,c.x].map(norm).join(' | ')]));
ok('tout couple à risque est admis avec sa raison écrite', nonAdmis.length===0,
   nonAdmis.map(c=>`« ${c.x} » / « ${c.y} »`).join(' | ')||'aucun couple non admis');

/* 2b. le harnais a-t-il des dents ? On réinjecte l'ancien libellé et l'on
       vérifie qu'il est relevé. Un contrôle qui ne sait pas retrouver le
       défaut qu'il a été écrit pour trouver ne prouve rien. */
const couple = (x,y) => {
  const a=norm(x), c=norm(y);
  return (a.includes(c)||c.includes(a)) || lev(a,c)<=2
      || affixe(a,c,false)>=2 || affixe(a,c,true)>=2;
};
ok('le harnais retrouve le défaut d’origine s’il revient',
   couple('Plan de travail','Programme de travail'),
   '« Plan de travail » / « Programme de travail » : ' + affixe(norm('Plan de travail'),norm('Programme de travail'),true) + ' mots en queue');
ok('et n’invente pas de collision entre le nouveau nom et l’ancien voisin',
   !couple('Procédures d’audit','Programme de travail'));

/* 3. le renommage demandé, des deux côtés */
const r3 = await p.evaluate(()=>{
  aller('fsli:CA','auditeur');
  return { dest:[...document.querySelectorAll('#main .destnav a, #main .destnav button')]
             .map(a=>a.textContent.replace(/\s*\d+\s*$/,'').trim()).join(' · '),
           ref:DESTINATIONS.find(x=>x.id==='plan').ref };
});
ok('la destination de section s’appelle « Procédures d’audit »',
   /Procédures d’audit/.test(r3.dest) && !/Plan de travail/.test(r3.dest), r3.dest);
ok('sa référence de papier suit le nom', r3.ref==='PRO-01', r3.ref);

/* 4. les deux blocs déplacés */
const r4 = await p.evaluate(()=>{
  aller('plan.programme','auditeur');
  const prog=[...document.querySelectorAll('#main h2')].map(h=>h.textContent.trim());
  aller('plan.principes','auditeur');
  const princ=[...document.querySelectorAll('#main h2')].map(h=>h.textContent.trim());
  return { prog, princ };
});
ok('le barème et les règles de revue ont quitté le programme de travail',
   !r4.prog.some(t=>/Barème|Règles de revue/.test(t)), r4.prog.join(' · '));
ok('ils sont dans les principes de conception',
   r4.princ.some(t=>/Barème de budget/.test(t)) && r4.princ.some(t=>/Niveau de revue/.test(t)));

console.log('erreurs :', errs.length?errs:'aucune');
await b.close();
process.exit(0);
