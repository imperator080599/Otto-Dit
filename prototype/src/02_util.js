function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Germe entier stable à partir d'une chaîne (FNV-1a 32 bits). */
function seedOf(str){
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

const NBSP = '\u00A0';
/** Format français : espace insécable pour les milliers, virgule décimale, € après. */
function eur(cents){
  const neg = cents < 0, v = Math.abs(Math.round(cents));
  const ent = String(Math.floor(v / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return (neg ? '-' : '') + ent + ',' + String(v % 100).padStart(2, '0') + NBSP + '€';
}
function eur0(cents){
  const neg = cents < 0, v = Math.abs(Math.round(cents / 100));
  return (neg ? '-' : '') + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) + NBSP + '€';
}
function pct(x, d){ return (x * 100).toFixed(d === undefined ? 1 : d).replace('.', ',') + NBSP + '%'; }
function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function el(html){ const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function frDate(iso){ return iso.slice(8,10) + '/' + iso.slice(5,7) + '/' + iso.slice(0,4); }
function isWeekend(iso){ const d = new Date(iso + 'T00:00:00Z').getUTCDay(); return d === 0 || d === 6; }
function addDays(iso, n){ const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0,10); }

/* ═══ 3. GRAND LIVRE ═══════════════════════════════════════════════════════
   Le grand livre n'est PAS saisi : il est engendré, à germe fixe, de façon à
   totaliser exactement la balance client compte par compte — moins l'écriture
   de situation volontairement absente (l'écart que le rapprochement doit
   trouver) et moins les écritures particulières créées nommément.
   Conséquences vérifiables à l'écran :
     · total des débits = total des crédits (chaque écriture est équilibrée) ;
     · solde du grand livre = solde de la balance sur tous les comptes sauf deux.
   ═══════════════════════════════════════════════════════════════════════ */

const CLIENTS = ['Groupe Immovance SA','Promoteurs du Forez SA','Bâtiplace SARL','Constructions Peyrelle SAS',
  'Tertiaire Bâtir SAS','Menuiseries Chartier SAS','Habitat Confluence SAS','Négoce Vitrages Réunis SARL',
  'Sogexim Façades SA','Atelier Lumière & Verre EURL'];
const FOURNISSEURS = ['Silices du Vercors SA','Intercalaires Rhodia SARL','Profilés Aluvin SAS','Énergie Rhône Sud',
  'Fours & Réfractaires SA','Assurances Belleville','Intérim Delorme','Transports Cabrol SAS'];
const AVOCATS = ['Cabinet Vasseur & Associés','SELARL Perrin Contentieux'];
const SAISIE = ['S. Marchand (comptabilité)','T. Girard (comptabilité)','M. Ferrand (direction)'];

/** Écriture de situation présente dans la balance client et absente du FEC.
 *  C'est l'anomalie A7 du jeu de données : 25 000 € en Dr 411000 / Cr 706000. */
const ECART_SITUATION = { debit: '411000', credit: '706000', montant: 2500000 };

function buildLedger(){
  const rnd = mulberry32(seedOf('otto-altiverre-fy2025-v1'));
  const label = Object.fromEntries(TB_2025.map(r => [r[0], r[1]]));

  // cibles = balance client, par compte et par sens
  const needD = new Map(), needC = new Map();
  for (const [c,, d, cr] of TB_2025){ if (d) needD.set(c, d); if (cr) needC.set(c, cr); }
  // on retire l'écriture de situation : le grand livre ne la contient pas
  needD.set(ECART_SITUATION.debit, needD.get(ECART_SITUATION.debit) - ECART_SITUATION.montant);
  needC.set(ECART_SITUATION.credit, needC.get(ECART_SITUATION.credit) - ECART_SITUATION.montant);

  const entries = [];
  let num = 0;
  function push(e){
    e.num = e.journal + '-2025-' + String(++num).padStart(4, '0');
    for (const l of e.lines){
      if (l.debit)  needD.set(l.compte, (needD.get(l.compte) || 0) - l.debit);
      if (l.credit) needC.set(l.compte, (needC.get(l.compte) || 0) - l.credit);
    }
    entries.push(e);
    return e;
  }
  function line(compte, debit, credit, auxLib){
    return { compte, libelleCompte: label[compte] || compte, debit: debit || 0, credit: credit || 0,
             auxNum: auxLib ? 'T' + String(seedOf(auxLib) % 900 + 100) : '', auxLib: auxLib || '' };
  }

  /* ── 3a. écritures particulières (les anomalies du scénario) ───────────── */
  const client = CLIENTS[0];
  // A1 — la même facture comptabilisée deux fois, juin puis juillet
  for (const [d, p] of [['2025-06-17','FA2025-0702'], ['2025-07-15','FA2025-0702']]){
    push({ journal:'VE', date:d, pieceRef:p, pieceDate:d, libelle:'Facture ' + p + ' — ' + client,
           saisiePar:SAISIE[0], validDate:addDays(d,3), tag:'A1',
           lines:[ line('411000', 3680000, 0, client), line('701000', 0, 3680000) ] });
  }
  // A5 — produit de janvier 2026 rattaché à 2025 (séparation des exercices)
  push({ journal:'VE', date:'2025-12-31', pieceRef:'FA2025-0706', pieceDate:'2026-01-06',
         libelle:'Facture FA2025-0706 — Promoteurs du Forez SA', saisiePar:SAISIE[1],
         validDate:'2026-01-08', tag:'A5',
         lines:[ line('411000', 3633000, 0, CLIENTS[1]), line('701000', 0, 3633000) ] });
  // A6 — écriture manuelle ronde, un samedi, saisie par la direction
  push({ journal:'OD', date:'2025-11-15', pieceRef:'OD-2025-089', pieceDate:'2025-11-15',
         libelle:'Régularisation contrat-cadre — décision de direction', saisiePar:SAISIE[2],
         validDate:'2025-11-17', tag:'A6',
         lines:[ line('411000', 5000000, 0, CLIENTS[0]), line('706000', 0, 5000000) ] });
  // honoraires juridiques : deux cabinets, dont un seul sera déclaré par le client
  {
    const tot = needD.get('622600') || 0;
    const part = Math.round(tot * 0.62);
    push({ journal:'AC', date:'2025-03-20', pieceRef:'FF2025-0311', pieceDate:'2025-03-18',
           libelle:'Honoraires — ' + AVOCATS[0], saisiePar:SAISIE[0], validDate:'2025-03-25',
           lines:[ line('622600', part, 0, AVOCATS[0]), line('401000', 0, part, AVOCATS[0]) ] });
    push({ journal:'AC', date:'2025-09-08', pieceRef:'FF2025-0742', pieceDate:'2025-09-04',
           libelle:'Honoraires contentieux — ' + AVOCATS[1], saisiePar:SAISIE[1], validDate:'2025-09-12',
           lines:[ line('622600', tot - part, 0, AVOCATS[1]), line('401000', 0, tot - part, AVOCATS[1]) ] });
  }

  /* ── 3b. table des contreparties plausibles ───────────────────────────── */
  const PREF = [
    { d:/^411/, c:/^(701|706|445710)/, j:'VE', lib:'Facture de vente' },
    { d:/^709/, c:/^411/,              j:'VE', lib:'Avoir accordé' },
    { d:/^512/, c:/^411/,              j:'BQ', lib:'Encaissement client' },
    { d:/^401/, c:/^512/,              j:'BQ', lib:'Règlement fournisseur' },
    { d:/^(60|61|62|624|606|615|616)/, c:/^401/, j:'AC', lib:'Facture fournisseur' },
    { d:/^445660/, c:/^401/,           j:'AC', lib:'TVA déductible sur achats' },
    { d:/^(641|645|621)/, c:/^(421|431|437)/, j:'PA', lib:'Paie du mois' },
    { d:/^(421|431|437)/, c:/^512/,    j:'BQ', lib:'Versement social / salaires' },
    { d:/^(661|164)/, c:/^512/,        j:'BQ', lib:'Échéance emprunt' },
    { d:/^445510/, c:/^512/,           j:'BQ', lib:'Paiement TVA' },
    { d:/^445710/, c:/^(445510|445660)/, j:'OD', lib:'Déclaration de TVA' },
    { d:/^681/, c:/^28/,               j:'OD', lib:'Dotation aux amortissements' },
    { d:/^(2|3)/, c:/^(401|512)/,      j:'AC', lib:'Acquisition' },
  ];
  const CAP = { VE:[300000,6500000], AC:[50000,3500000], BQ:[80000,9000000],
                PA:[1500000,18000000], OD:[100000,4000000], AN:[0,0] };

  function pickDate(){
    // dates réparties sur l'exercice, décalées au lundi suivant dans 9 cas sur 10
    // lorsqu'elles tombent un week-end : une comptabilité ne saisit presque jamais
    // le samedi, ce qui fait du critère « week-end » un vrai signal (~3 % ici).
    let d = addDays('2025-01-01', Math.floor(rnd() * 365));
    if (isWeekend(d) && rnd() < 0.9){
      d = addDays(d, new Date(d + 'T00:00:00Z').getUTCDay() === 6 ? 2 : 1);
      if (d > '2025-12-31') d = addDays(d, -3);
    }
    return d;
  }
  function mkEntry(dc, cc, amount, j, lib){
    const date = j === 'AN' ? '2025-01-01' : pickDate();
    const aux = dc.startsWith('411') ? CLIENTS[Math.floor(rnd()*CLIENTS.length)]
              : cc.startsWith('401') ? FOURNISSEURS[Math.floor(rnd()*FOURNISSEURS.length)]
              : cc.startsWith('411') ? CLIENTS[Math.floor(rnd()*CLIENTS.length)]
              : dc.startsWith('401') ? FOURNISSEURS[Math.floor(rnd()*FOURNISSEURS.length)] : '';
    const prefix = { VE:'FA', AC:'FF', BQ:'BQ', PA:'PA', OD:'OD', AN:'AN' }[j];
    const piece = prefix + '2025-' + String(1000 + Math.floor(rnd() * 8999));
    // validation : quelques écritures validées après la clôture (critère de test)
    const late = rnd() < 0.03;
    let pd = j === 'AN' ? date : addDays(date, -Math.floor(rnd() * 4));
    if (pd < '2025-01-01') pd = '2025-01-01';
    return { journal:j, date, pieceRef:piece, pieceDate:pd,
             libelle: lib + (aux ? ' — ' + aux : ''), saisiePar: SAISIE[rnd() < 0.04 ? 2 : (rnd() < .5 ? 0 : 1)],
             validDate: late ? addDays('2026-01-05', Math.floor(rnd()*20)) : addDays(date, 1 + Math.floor(rnd()*6)),
             lines: [ line(dc, amount, 0, aux), line(cc, 0, amount, aux) ] };
  }

  /* ── 3c. appariement glouton jusqu'à consommer toutes les cibles ───────── */
  const alive = m => [...m.entries()].filter(([, v]) => v > 0);
  let guard = 0;
  while (guard++ < 40000){
    const ds = alive(needD), cs = alive(needC);
    if (!ds.length || !cs.length) break;
    // on prend la cible débit la plus lourde : la boucle converge vite
    ds.sort((a, b) => b[1] - a[1]);
    const [dc, dRem] = ds[0];
    let rule = PREF.find(p => p.d.test(dc) && cs.some(([c]) => p.c.test(c) ));
    let cc, j, lib;
    if (rule){
      const cands = cs.filter(([c]) => rule.c.test(c));
      cc = cands[Math.floor(rnd() * cands.length)][0]; j = rule.j; lib = rule.lib;
    } else {
      // pas de contrepartie naturelle disponible : opération diverse
      const bs = c => /^[1-5]/.test(c);
      const cands = cs.filter(([c]) => bs(c) === bs(dc)).concat(cs);
      cc = cands[Math.floor(rnd() * cands.length)][0];
      j = (/^[1-3]/.test(dc) && /^[1-3]/.test(cc)) ? 'AN' : 'OD';
      lib = j === 'AN' ? 'À nouveau' : 'Opération diverse';
    }
    const cRem = needC.get(cc);
    const [lo, hi] = CAP[j];
    let amount;
    if (j === 'AN') amount = Math.min(dRem, cRem);
    else {
      // rnd()^2,6 : la masse des écritures est petite, la queue est longue
      amount = Math.min(dRem, cRem, lo + Math.floor(Math.pow(rnd(), 2.6) * (hi - lo)));
      // reliquat trop petit pour une écriture crédible : on le solde d'un coup
      if (dRem - amount < lo) amount = Math.min(dRem, cRem);
      // ~8 % des montants sont ronds au millier (critère « montant rond »)
      if (amount > 500000 && rnd() < 0.08) amount = Math.floor(amount / 100000) * 100000;
    }
    if (amount <= 0) { needD.set(dc, 0); continue; }
    push(mkEntry(dc, cc, amount, j, lib));
  }

  // numérotation par journal, comme dans un FEC réel
  const perJournal = {};
  for (const e of entries){
    perJournal[e.journal] = (perJournal[e.journal] || 0) + 1;
    e.num = e.journal + String(perJournal[e.journal]).padStart(5, '0');
  }
  entries.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.num < b.num ? -1 : 1));

  // aplatissement en lignes de FEC
  const rows = [];
  for (const e of entries){
    e.lines.forEach((l, i) => rows.push({
      JournalCode:e.journal, JournalLib:{VE:'Ventes',AC:'Achats',BQ:'Banque',PA:'Paie',OD:'Opérations diverses',AN:'À nouveaux'}[e.journal],
      EcritureNum:e.num, EcritureDate:e.date, CompteNum:l.compte, CompteLib:l.libelleCompte,
      CompAuxNum:l.auxNum, CompAuxLib:l.auxLib, PieceRef:e.pieceRef, PieceDate:e.pieceDate,
      EcritureLib:e.libelle, Debit:l.debit, Credit:l.credit, EcritureLet:'', DateLet:'',
      ValidDate:e.validDate, Montantdevise:'', Idevise:'', saisiePar:e.saisiePar, tag:e.tag || '', ligne:i + 1
    }));
  }
  return { entries, rows };
}

/** Le grand livre d'origine — la version 1. Les versions suivantes s'y
 *  AJOUTENT (voir ledgerVersion) : il n'est jamais régénéré. */
let _ledgerBase = null;
function ledgerBase(){ return _ledgerBase || (_ledgerBase = buildLedger()); }

/** Balance recalculée à partir des écritures — jamais saisie à côté. */
function balanceFromLedger(rows){
  const m = new Map();
  for (const r of rows){
    const a = m.get(r.CompteNum) || { compte:r.CompteNum, lib:r.CompteLib, debit:0, credit:0 };
    a.debit += r.Debit; a.credit += r.Credit; m.set(r.CompteNum, a);
  }
  return [...m.values()].sort((a, b) => a.compte < b.compte ? -1 : 1);
}

/* ═══ 4. ÉTAT ══════════════════════════════════════════════════════════════
   Un seul objet d'état. Tout module lit les seuils ici : c'est la source
   unique de vérité que la démonstration doit rendre visible.
   ═══════════════════════════════════════════════════════════════════════ */