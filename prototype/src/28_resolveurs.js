
/* ═══ 44. RÉSOLVEURS DU CATALOGUE ══════════════════════════════════════════
   Le catalogue méthodologique (methodology/*.json) NOMME ce qu'il faut faire ;
   ce fichier sait le FAIRE. La frontière est celle-ci : une population se
   décrit en données jusqu'au moment où il faut lire le grand livre.

   Une procédure dont le prédicat vaut « non_implemente » est CATALOGUÉE et
   NON EXÉCUTABLE ici : elle apparaît au plan de travail avec sa raison, ne
   produit aucune sélection, et n'est jamais simulée. C'est la même règle que
   pour le critère « hors heures ouvrées » du test des écritures.
   ═══════════════════════════════════════════════════════════════════════ */

/* ── extrait de l'exercice suivant ────────────────────────────────────────
   La recherche de passifs non enregistrés part des décaissements POSTÉRIEURS
   à la clôture : sans extrait de l'exercice suivant, elle est incatalogable
   autrement qu'en « non exécutable ». Le client en transmet un — c'est la
   pratique — donc le jeu de données en contient un : soixante décaissements
   du 1er janvier au 31 mars 2026.

   Ces soixante décaissements ne sont pas de même nature, et c'est tout
   l'intérêt de la procédure :

     — la plupart RÈGLENT une dette déjà comptabilisée au bilan de clôture
       (fait générateur en 2025, dette au passif) : rien à relever ;
     — d'autres sont des charges de l'exercice SUIVANT (fait générateur en
       2026, aucune dette attendue à la clôture) : rien à relever non plus ;
     — TROIS règlent une dette née avant la clôture et JAMAIS comptabilisée.
       Ce sont les passifs non enregistrés, et ce sont les seuls écarts.

   Une version antérieure datait tous les faits générateurs normaux après la
   clôture : la date suffisait alors à trier, et le test ne prouvait rien
   qu'un tri de dates. Le contrôle réel n'est pas une date, c'est une
   RECHERCHE : la dette attendue figure-t-elle au bilan de clôture ?

   Les trois passifs omis portent des références FIXES posées à des rangs
   FIXES de l'extrait. Elles étaient auparavant laissées à la numérotation
   de la boucle, qui n'engendrait que des multiples de sept : FF2026-0117
   n'en est pas un et n'a jamais existé. Une donnée d'essai nommée doit être
   posée, pas espérée. */
const POST_DEB = '2026-01-01', POST_FIN = '2026-03-31';
const PASSIFS_OMIS = {
  'FF2026-0042':{ montant:1840000, faitLe:'2025-11-28', facture:'2026-01-14', why:'prestation de maintenance de novembre, facture reçue en janvier, aucune charge à payer comptabilisée' },
  'FF2026-0117':{ montant: 962000, faitLe:'2025-12-15', facture:'2026-01-03', why:'livraison de profilés du 15 décembre, facture datée du 3 janvier, non provisionnée' },
  'FF2026-0203':{ montant: 415000, faitLe:'2025-12-22', facture:'2026-02-09', why:'honoraires de conseil sur un dossier clos en décembre, facturés en février' },
};
/** Rang de l'extrait auquel chaque passif omis est posé. */
const RANGS_OMIS = { 7:'FF2026-0042', 23:'FF2026-0117', 46:'FF2026-0203' };

let _post = null;
function ledgerPost(){
  if (_post) return _post;
  const rnd = mulberry32(seedOf('otto-altiverre-post-2026'));
  const reserve = new Set(Object.values(RANGS_OMIS));
  const out = [];
  let n = 0;
  const refSuivante = () => {
    let r;
    do { r = 'FF2026-' + String(++n * 7).padStart(4, '0'); } while (reserve.has(r));
    return r;
  };
  const jour = i => addDays(POST_DEB, Math.floor(i * 89 / 60));
  for (let i = 0; i < 60; i++){
    const f = FOURNISSEURS[Math.floor(rnd() * FOURNISSEURS.length)];
    const ref = RANGS_OMIS[i] || refSuivante();
    const omis = PASSIFS_OMIS[ref];
    const tirage = rnd();
    const montant = omis ? omis.montant : Math.round((80000 + rnd() * 4200000) / 100) * 100;
    let faitLe, facture, comptabilisee;
    if (omis){
      /* dette née avant la clôture, jamais portée au passif */
      faitLe = omis.faitLe; facture = omis.facture; comptabilisee = false;
    } else if (tirage < 0.6){
      /* règlement d'une dette fournisseur déjà comptabilisée à la clôture */
      faitLe = addDays(CLOTURE, -(3 + Math.floor(rnd() * 85)));
      facture = addDays(faitLe, Math.floor(rnd() * 8));
      comptabilisee = true;
    } else {
      /* charge de l'exercice suivant : aucune dette attendue à la clôture */
      faitLe = addDays(jour(i), -Math.floor(rnd() * 20));
      if (faitLe <= CLOTURE) faitLe = addDays(CLOTURE, 1 + Math.floor(rnd() * 20));
      facture = addDays(faitLe, Math.floor(rnd() * 6));
      comptabilisee = false;
    }
    out.push({ num:'BQ2026-' + String(i + 1).padStart(4, '0'), date:jour(i), pieceRef:ref,
               tiers:f, montant, faitLe, facture, comptabilisee, omis:!!omis,
               libelle:'Règlement fournisseur — ' + f });
  }
  _post = out;
  return out;
}
/** Répartition de l'extrait, pour la vue « Jeu de données » et les harnais. */
function statPost(){
  const l = ledgerPost();
  return { total:l.length, omis:l.filter(d => d.omis).length,
           regleDetteComptabilisee:l.filter(d => d.comptabilisee).length,
           chargeExerciceSuivant:l.filter(d => !d.comptabilisee && !d.omis).length };
}

/* ── prédicats de population ──────────────────────────────────────────────
   Chacun reçoit (poste, procédure, paramètres) et rend la liste d'éléments.
   `null` signifie : non exécutable sur les données disponibles. */
/* ── prédicats NOMMÉS et NON IMPLÉMENTÉS ici ──────────────────────────────
   Le catalogue nomme la population qu'il faut ; le prototype dit quand il ne
   sait pas la calculer, et pourquoi. Les nommer plutôt que les taire est le
   contraire de les simuler — et cela évite le défaut qui a suivi : une
   procédure annoncée « avec sélection » dont la sélection valait null. */
const PREDICATS_ABSENTS = {
  tiers_sans_reponse:
    'la relance des tiers sans réponse suppose un suivi des circularisations envoyées : '
  + 'le prototype n’en tient pas le registre.',
  avoirs_apres_cloture:
    'les avoirs postérieurs à la clôture supposent un extrait des ventes de l’exercice suivant : '
  + 'le jeu de données n’en contient pas (il contient l’extrait des décaissements, côté fournisseurs).',
};

const PREDICATS = {
  non_implemente: () => null,

  comptes_du_poste: (p) => p.comptes.map(c => ({ cle:c, lib:bal().get(c).lib,
    montant:Math.abs(bal().get(c).solde) })),

  ecritures_du_poste: (p) => ecrituresDuPoste(p),

  ecritures_du_poste_periode: (p, pr, par) => {
    const deb = addDays(CLOTURE, -(par.jours_avant || 10));
    return ecrituresDuPoste(p).filter(x => x.e.date >= deb && x.e.date <= CLOTURE);
  },
  ecritures_du_poste_journal: (p, pr, par) =>
    ecrituresDuPoste(p).filter(x => x.e.journal === (par.journal || 'OD')),

  ecritures_manuelles: (p) =>
    ecrituresDuPoste(p).filter(x => x.e.journal === 'OD' || /direction/.test(x.e.saisiePar)),

  ecritures_du_poste_seuil: (p) => ecrituresDuPoste(p).filter(x => x.montant > seuils().CTT),

  ecritures_marqueurs_fraude: (p) => ecrituresDuPoste(p).filter(x => {
    const e = x.e, m = e.lines[0].debit || e.lines[0].credit;
    return isWeekend(e.date) || e.validDate > CLOTURE || /direction/.test(e.saisiePar)
        || (m >= 100000 && m % 100000 === 0);
  }),

  ecritures_comptes: (p, pr, par) => ecrituresComptes(par.comptes || []),
  ecritures_comptes_seuil: (p, pr, par) =>
    ecrituresComptes(par.comptes || []).filter(x => x.montant > seuils().CTT),

  mouvements_debiteurs_du_poste: (p) => ecrituresDuPoste(p)
    .filter(x => x.e.journal !== 'AN' && x.e.lines.some(l => p.re.test(l.compte) && l.debit > 0)),
  mouvements_crediteurs_du_poste: (p) => ecrituresDuPoste(p)
    .filter(x => x.e.journal !== 'AN' && x.e.lines.some(l => p.re.test(l.compte) && l.credit > 0)),

  sequence_pieces: (p) => ecrituresDuPoste(p).map(x => ({ ...x, cle:x.e.pieceRef })),

  tiers_du_poste: (p) => {
    const m = new Map();
    for (const e of lg().entries){
      const aux = e.lines.map(l => l.auxLib).find(Boolean);
      if (!aux || !e.lines.some(l => p.re.test(l.compte))) continue;
      const mv = e.lines.reduce((a, l) => a + (p.re.test(l.compte) ? Math.abs(l.debit - l.credit) : 0), 0);
      const cur = m.get(aux) || { cle:aux, lib:aux, montant:0, n:0, e:null };
      cur.montant += mv; cur.n++; cur.e = cur.e || e;
      m.set(aux, cur);
    }
    return [...m.values()].sort((a, b) => b.montant - a.montant);
  },

  tiers_honoraires_juridiques: () => {
    const m = new Map();
    for (const e of lg().entries){
      if (!e.lines.some(l => /^622/.test(l.compte) && l.debit > 0)) continue;
      const aux = e.lines.map(l => l.auxLib).find(Boolean) || e.libelle;
      const mv = e.lines.reduce((a, l) => a + (/^622/.test(l.compte) ? l.debit : 0), 0);
      const cur = m.get(aux) || { cle:aux, lib:aux, montant:0, n:0, e:null };
      cur.montant += mv; cur.n++; cur.e = cur.e || e;
      m.set(aux, cur);
    }
    return [...m.values()].sort((a, b) => b.montant - a.montant);
  },

  /* LA procédure du cycle fournisseurs : on part du décaissement postérieur
     et l'on cherche l'écriture qui aurait dû exister à la clôture.
     Le seuil de remontée est une DÉCISION portée par le catalogue, pas une
     constante d'ici : « signification_manifeste » retient tout ce qui peut
     entrer au cumul des anomalies, « planification » ne retient que ce qui
     est individuellement significatif — et laisse donc passer, par
     construction, l'accumulation de petites dettes omises. */
  decaissements_apres_cloture: (p, pr, par) => {
    const s = seuils();
    const seuil = par.seuil === 'planification' ? s.PM : s.CTT;
    return ledgerPost().filter(d => d.montant > seuil)
      .map(d => ({ cle:d.pieceRef, lib:d.libelle, montant:d.montant, post:d }));
  },

};
function ecrituresDuPoste(p){
  return lg().entries
    .filter(e => e.lines.some(l => p.re.test(l.compte)))
    .map(e => ({ cle:e.num, e, montant:e.lines.reduce((a, l) => a + (p.re.test(l.compte) ? Math.abs(l.debit - l.credit) : 0), 0) }))
    .filter(x => x.montant > 0);
}
function ecrituresComptes(prefixes){
  const re = new RegExp('^(' + prefixes.join('|') + ')');
  return lg().entries
    .filter(e => e.lines.some(l => re.test(l.compte)))
    .map(e => ({ cle:e.num, e, montant:e.lines.reduce((a, l) => a + (re.test(l.compte) ? Math.abs(l.debit - l.credit) : 0), 0) }))
    .filter(x => x.montant > 0);
}

/* ── résolveurs de référence ──────────────────────────────────────────────
   `ref(x)` : la donnée à laquelle on compare. `val(x)` : ce que porte la pièce
   dans ce jeu de données synthétique — c'est la simulation de lecture, elle
   appartient au prototype et non au catalogue. */
const RESOLVEURS = {
  montant_ligne:      { ref:x => x.montant,
                        val:x => x.e ? pieceSynth(x.e, x.montant).montant_ht : x.montant },
  date_ecriture:      { ref:x => x.e ? x.e.date : CLOTURE,
                        val:x => x.e ? pieceSynth(x.e, x.montant).date_piece : CLOTURE },
  tiers_ecriture:     { ref:x => (x.e ? x.e.lines.map(l => l.auxLib).find(Boolean) : x.lib) || '—',
                        val:x => x.e ? pieceSynth(x.e, x.montant).tiers : (x.lib || '—') },
  libelle_ecriture:   { ref:x => x.e ? x.e.libelle : (x.lib || '—'),
                        val:x => x.e ? (pieceSynth(x.e, x.montant).taux_contrat || x.e.libelle) : (x.lib || '—') },
  num_piece:          { ref:x => x.e ? x.e.pieceRef : x.cle,
                        val:x => x.e ? pieceSynth(x.e, x.montant).num_piece : x.cle },
  qte_facturee:       { ref:x => x.e ? pieceSynth(x.e, x.montant).qte_facturee : 0,
                        val:x => x.e ? pieceSynth(x.e, x.montant).qte_livree : 0 },
  date_cloture:       { ref:() => CLOTURE,
                        val:x => x.e ? pieceSynth(x.e, x.montant).date_livraison : CLOTURE },
  /* Le fait générateur ne se compare à rien : c'est LUI qui dit si une dette
     était attendue à la clôture. Il se relève, il ne se contrôle pas — d'où
     le champ « relevé seul » du catalogue. */
  date_fait_generateur:{ ref:() => null,
                        val:x => x.post ? x.post.faitLe
                              : (x.e ? pieceSynth(x.e, x.montant).date_livraison : CLOTURE) },
  date_piece_recue:   { ref:() => null,
                        val:x => x.post ? x.post.facture
                              : (x.e ? pieceSynth(x.e, x.montant).date_piece : CLOTURE) },
  /* LE contrôle de la recherche de passifs non enregistrés : la dette attendue
     au bilan de clôture y figure-t-elle ? Référence : elle est attendue si le
     fait générateur est antérieur ou égal à la clôture. Valeur relevée : elle
     y figure, ou non. L'écart est le passif non enregistré. */
  dette_attendue_cloture:{ ref:x => x.post ? x.post.faitLe <= CLOTURE : false,
                        val:x => x.post ? !!x.post.comptabilisee : false },
  signature_exigee:   { ref:() => true,
                        val:x => x.e ? pieceSynth(x.e, x.montant).signature : true },
  bareme_remuneration:{ ref:() => 'barème 2025 applicable',
                        val:x => x.e ? pieceSynth(x.e, x.montant).taux_contrat : 'barème 2025 applicable' },
  solde_tiers:        { ref:x => x.montant, val:x => x.montant },
  non_implemente:     { ref:() => '—', val:() => '—' },
};
