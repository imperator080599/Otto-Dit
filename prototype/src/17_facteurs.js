/* ═══ 25. REGISTRE DES FACTEURS DE RISQUE ══════════════════════════════════
   Ce que doivent faire circuler les sections, ce ne sont pas des lignes de
   tableau : ce sont des CONSTATATIONS. Une constatation levée par une
   procédure — un écart de rapprochement, une écriture de direction, une
   pièce datée hors exercice — doit se poser SEULE sur les sections
   concernées, avec un lien vers sa source, sans ressaisie.

   Le facteur est un objet de première classe : source, nature, description,
   FSLI et assertions touchés, statut, effet retenu. Il n'est PAS un
   enregistrement figé : les candidats sont re-dérivés à chaque rendu par les
   règles ci-dessous (donc ils suivent la matérialité), tandis que la DÉCISION
   humaine — confirmé, écarté, effet retenu — est conservée par identifiant
   stable. Bouger un seuil ne perd jamais un arbitrage.

   GARDE-FOU. Trois cents alertes que personne ne lit, c'est le défaut
   classique de l'analyse de données en audit. Chaque règle porte donc un
   SEUIL DE PERTINENCE explicite et modifiable, le compteur de facteurs
   proposés est affiché en permanence, et la vue de triage alerte dès que le
   volume sort de l'ordre de la dizaine.
   ═══════════════════════════════════════════════════════════════════════ */

const CIBLE_VOLUME = 15;   // au-delà, le registre prévient qu'il devient du bruit

/** Postes touchés par un compte donné. */
function postesDuCompte(compte){
  return postesCalcules().filter(p => p.re.test(compte));
}

/* ── règles de levée ──────────────────────────────────────────────────────
   Chaque règle : un code, une source (procédure qui la lève et vue où la
   relire), un seuil de pertinence nommé, et une fonction qui rend des
   candidats. L'identifiant d'un candidat est stable : règle + clé métier.  */
const REGLES_FACTEUR = [
  {
    code:'RAPPRO', lib:'Écart de rapprochement balance ↔ grand livre non résolu',
    srcLib:'Rapprochement balance ↔ grand livre', srcVue:'plan.rappro',
    seuilLib:'écart minimal retenu', seuilUnite:'€', seuilDefaut:() => seuils().CTT / 100, pas:100,
    nature:'quantitatif',
    calc(seuil){
      const out = [];
      for (const r of rapprochement()){
        if (Math.abs(r.ecart) < seuil * 100) continue;
        const postes = postesDuCompte(r.compte);
        if (!postes.length) continue;
        out.push({
          id:'RAPPRO:' + r.compte,
          description:`Le compte ${r.compte} « ${r.lib} » présente un écart de ${eur(r.ecart)} entre la balance `
                    + `transmise et le fichier des écritures. Tant qu’il n’est pas expliqué, le détail du poste `
                    + `n’est pas rapproché de son solde.`,
          cibles:postes.map(p => ({ fsli:p.code, assertions:['exhaustivite'] })),
          pertinence:`écart ${eur(Math.abs(r.ecart))} ≥ seuil ${eur(seuil * 100)}`,
          srcRef:'compte ' + r.compte,
        });
      }
      return out;
    },
  },
  {
    /* Chemin parcouru sur cette règle, parce qu'il dit ce que vaut le garde-fou.
       « La direction a saisi des écritures » : 62 écritures sur 1 605, réparties
       sur tous les postes → treize facteurs, c'est-à-dire du bruit pur.
       « … et porteuses d'un second marqueur » : encore onze.
       En regardant la distribution : douze postes entre 11 k€ et 244 k€, aucune
       coupure naturelle. Il n'y a pas de seuil ABSOLU défendable — le générateur
       attribue la saisie par la direction au hasard, donc il n'y a AUCUNE
       concentration à trouver. Choisir un montant qui « donne trois facteurs »
       aurait été régler le nombre, pas le critère.
       Le critère qui a un sens est donc RELATIF : la direction pèse-t-elle sur ce
       poste une part anormale de sa masse ? Sur ce jeu de données la réponse est
       non, et la règle ne lève rien — c'est le bon résultat. Une règle qui
       trouverait quelque chose ici serait une règle qui trouve toujours quelque
       chose. Baissez le seuil dans la vue de triage pour la voir se déclencher :
       c'est le compromis, et il est sous votre main. */
    code:'DIRECTION', lib:'Poids anormal des écritures de direction sur le poste',
    srcLib:'Test des écritures', srcVue:'plan.je',
    seuilLib:'part minimale de la masse du poste', seuilUnite:'%', seuilDefaut:() => 5, pas:0.5,
    nature:'qualitatif',
    calc(seuil){
      const marqueurs = [
        { lib:'journal d’opérations diverses', f:e => e.journal === 'OD' },
        { lib:'comptabilisée un week-end',     f:e => isWeekend(e.date) },
        { lib:'montant rond au millier',       f:e => { const m = e.lines[0].debit || e.lines[0].credit; return m >= 100000 && m % 100000 === 0; } },
        { lib:'validée après la clôture',      f:e => e.validDate > '2025-12-31' },
      ];
      const out = [];
      for (const p of postesCalcules()){
        const masse = statsPoste(p).masse;
        if (!masse) continue;
        const ecr = lg().entries.filter(e => e.lines.some(l => p.re.test(l.compte))
          && /direction/.test(e.saisiePar) && marqueurs.some(m => m.f(e)));
        if (!ecr.length) continue;
        const m = ecr.reduce((a, e) => a + (e.lines[0].debit || e.lines[0].credit), 0);
        const part = m / masse;
        // plancher absolu : un poste minuscule ne devient pas un risque parce
        // qu'une écriture y pèse proportionnellement beaucoup
        if (part < seuil / 100 || m < seuils().CTT) continue;
        const quels = [...new Set(ecr.flatMap(e => marqueurs.filter(x => x.f(e)).map(x => x.lib)))];
        out.push({
          id:'DIRECTION:' + p.code,
          description:`${ecr.length} écriture(s) saisies par la direction ET porteuses d’un second marqueur `
                    + `(${quels.join(', ')}) pèsent ${eur(m)}, soit ${pct(part, 1)} de la masse du poste `
                    + `(${eur(masse)}). La possibilité pour la direction de passer outre les contrôles est un `
                    + `facteur qualitatif : il ne se déduit d’aucun montant, mais il ne se lève que là où la `
                    + `concentration le justifie.`,
          cibles:[{ fsli:p.code, assertions:['realite'] }],
          pertinence:`${pct(part, 1)} de la masse ≥ seuil ${seuil}${NBSP}% (plancher ${eur(seuils().CTT)})`,
          srcRef:p.lib,
        });
      }
      return out;
    },
  },
  {
    code:'PIECE_HORS', lib:'Pièce datée hors exercice',
    srcLib:'Contrôle de forme du fichier des écritures', srcVue:'plan.rappro',
    /* Clé : la PIÈCE, pas le poste. Une facture de vente touche le chiffre
       d'affaires ET les créances : la keyer par poste dédoublait une seule
       constatation en deux facteurs portant le même texte. Une constatation,
       un facteur, plusieurs cibles. */
    seuilLib:'écart minimal à la clôture', seuilUnite:'jours', seuilDefaut:() => 1, pas:1,
    nature:'quantitatif',
    calc(seuil){
      const out = [];
      for (const e of lg().entries){
        if (!e.pieceDate) continue;
        const jours = e.pieceDate > '2025-12-31'
          ? Math.round((Date.parse(e.pieceDate) - Date.parse('2025-12-31')) / 86400000)
          : e.pieceDate < '2025-01-01'
            ? Math.round((Date.parse('2025-01-01') - Date.parse(e.pieceDate)) / 86400000) : 0;
        if (jours < seuil) continue;
        const postes = [...new Set(e.lines.flatMap(l => postesDuCompte(l.compte).map(p => p.code)))];
        if (!postes.length) continue;
        out.push({
          id:'PIECE_HORS:' + e.pieceRef,
          description:`La pièce ${e.pieceRef} porte la date du ${frDate(e.pieceDate)}, soit ${jours} jour(s) hors `
                    + `de l’exercice, alors que l’écriture ${e.num} est comptabilisée le ${frDate(e.date)} `
                    + `(${eur(e.lines[0].debit || e.lines[0].credit)}). Indice de rattachement au mauvais exercice.`,
          cibles:postes.map(c => ({ fsli:c, assertions:['separation'] })),
          pertinence:`${jours} jour(s) hors exercice ≥ seuil ${seuil}`,
          srcRef:'pièce ' + e.pieceRef,
        });
      }
      return out;
    },
  },
  {
    code:'JE_ANOMALIE', lib:'Écriture particulière relevée au test des écritures',
    srcLib:'Test des écritures', srcVue:'plan.je',
    seuilLib:'montant minimal retenu', seuilUnite:'€', seuilDefaut:() => seuils().CTT / 100, pas:100,
    nature:'quantitatif',
    calc(seuil){
      const LIB = { A1:['réalité', 'realite', 'Même facture comptabilisée deux fois'],
                    A5:['séparation des exercices', 'separation', 'Produit de 2026 rattaché à 2025'],
                    A6:['réalité', 'realite', 'Écriture manuelle de direction en fin d’exercice'] };
      const out = [], vus = new Set();
      for (const e of lg().entries){
        if (!e.tag || !LIB[e.tag]) continue;
        const cle = e.tag + '/' + e.pieceRef;
        if (vus.has(cle)) continue;          // une constatation, un facteur
        vus.add(cle);
        const m = e.lines[0].debit || e.lines[0].credit;
        if (m < seuil * 100) continue;
        const comptes = e.lines.map(l => l.compte);
        const postes = [...new Set(comptes.flatMap(c => postesDuCompte(c).map(p => p.code)))];
        if (!postes.length) continue;
        out.push({
          id:'JE_ANOMALIE:' + e.num,
          description:`${LIB[e.tag][2]} — écriture ${e.num}, pièce ${e.pieceRef}, ${eur(m)}. Relevée par les `
                    + `critères de sélection des écritures, elle porte sur ce poste.`,
          cibles:postes.map(c => ({ fsli:c, assertions:[LIB[e.tag][1]] })),
          pertinence:`${eur(m)} ≥ seuil ${eur(seuil * 100)}`,
          srcRef:'écriture ' + e.num,
        });
      }
      return out;
    },
  },
  {
    /* Deuxième fois que le même piège se referme, et de la même façon.
       Premier essai : « variation ≥ 3 × le seuil de planification ». Résultat,
       cinq facteurs — dont une HAUSSE DE 1,7 % DU CHIFFRE D'AFFAIRES. Sur un
       compte de 5 M€, trois fois le seuil est un mouvement ordinaire ; le
       multiple absolu ne mesure que la taille du compte.
       Ce qui rend une variation inhabituelle, c'est son ampleur RELATIVE à ce
       que le compte pèse. La règle exige donc les deux : un montant qui compte
       (au moins le seuil de planification, sinon on parle de bruit) ET une
       déformation du compte au-delà du taux réglé ci-contre. Une croissance de
       1,7 % ne lève plus rien ; un compte qui double, oui. */
    code:'RA_PRELIM', lib:'Variation d’ampleur inhabituelle à la revue analytique préliminaire',
    srcLib:'Revue analytique préliminaire', srcVue:'plan.ra',
    seuilLib:'déformation minimale du compte', seuilUnite:'%', seuilDefaut:() => 25, pas:5,
    nature:'quantitatif',
    calc(seuil){
      const out = [];
      for (const l of revueAnalytique()){
        if (Math.abs(l.d) < seuils().PM) continue;              // plancher : le montant doit compter
        if (l.p === null || Math.abs(l.p) < seuil / 100) continue;  // et la déformation doit être réelle
        const postes = postesDuCompte(l.compte);
        if (!postes.length) continue;
        const k = sensNaturel(l), sens = l.d * k > 0 ? 'augmentation' : 'diminution';
        out.push({
          id:'RA_PRELIM:' + l.compte,
          description:`Le compte ${l.compte} « ${l.lib} » présente une ${sens} de ${eur(Math.abs(l.d))}, soit `
                    + `${pct(Math.abs(l.p), 1)} de son solde de l’exercice précédent (${eur(Math.abs(l.n1))}). `
                    + `Une déformation de cette ampleur oriente les travaux avant même leur programmation.`,
          cibles:postes.map(x => ({ fsli:x.code, assertions:['realite', 'presentation'] })),
          pertinence:`${pct(Math.abs(l.p), 1)} de déformation ≥ seuil ${seuil}${NBSP}% · montant ${eur(Math.abs(l.d))} ≥ plancher ${eur0(seuils().PM)}`,
          srcRef:'compte ' + l.compte,
        });
      }
      return out;
    },
  },
  {
    code:'CIRC', lib:'Compte en comptabilité absent du listing à circulariser',
    srcLib:'Exhaustivité des circularisations', srcVue:'plan.circ',
    seuilLib:'solde minimal retenu', seuilUnite:'€', seuilDefaut:() => seuils().CTT / 100, pas:100,
    nature:'quantitatif',
    calc(seuil){
      const out = [];
      for (const b of exhaustiviteBanques()){
        if (b.declare || Math.abs(b.solde) < seuil * 100) continue;
        const postes = postesDuCompte(b.compte);
        if (!postes.length) continue;
        out.push({
          id:'CIRC:' + b.compte,
          description:`Le compte ${b.compte} « ${b.lib} » (${eur(b.solde)}) figure en comptabilité mais pas au `
                    + `listing des banques transmis par le client. Le périmètre des confirmations à demander `
                    + `n’est pas arrêté.`,
          cibles:postes.map(p => ({ fsli:p.code, assertions:['exhaustivite'] })),
          pertinence:`solde ${eur(Math.abs(b.solde))} ≥ seuil ${eur(seuil * 100)}`,
          srcRef:'compte ' + b.compte,
        });
      }
      return out;
    },
  },
  /* ═══ RÈGLES QUALITATIVES ══════════════════════════════════════════════
     Le registre comptait CINQ règles quantitatives et UNE qualitative :
     l'évaluation du risque du produit reposait donc à 83 % sur des variations
     chiffrées, ce qu'un auditeur reproche au premier coup d'œil. Les cinq
     règles qui suivent lèvent des facteurs QUALITATIFS depuis des procédures
     qui les captent déjà — c'est la conception demandée : la plupart des
     facteurs qualitatifs doivent REMONTER, et le questionnaire ne garde que
     le résiduel.

     Le vocabulaire retenu — complexité, subjectivité, changement, incertitude,
     biais de la direction — est celui des facteurs de risque inhérent des
     référentiels d'audit. [UNVERIFIED] : il vient de sources secondaires,
     aucun texte normatif primaire n'ayant pu être atteint depuis cet
     environnement (voir methodology/README.md). Il organise les questions ;
     il ne fonde aucune obligation. */
  {
    code:'ESTIM', lib:'Le poste est porté par des estimations comptables',
    srcLib:'Composition du poste', srcVue:'plan.scope',
    seuilLib:'part du poste portée par des comptes d’estimation', seuilUnite:'%',
    seuilDefaut:() => 10, pas:1,
    nature:'qualitatif',
    calc(seuil){
      /* Provisions, dépréciations et dotations : ce sont les comptes dont le
         solde résulte d'un JUGEMENT et non d'une transaction. La subjectivité
         d'un poste se mesure donc — c'est la part de sa masse qu'ils portent. */
      const RE_ESTIM = /^(15|29|39|49|59|68|78)/;
      const out = [];
      for (const p of postesCalcules()){
        const comptes = p.comptes.filter(c => RE_ESTIM.test(c));
        if (!comptes.length) continue;
        const tot = p.comptes.reduce((a, c) => a + Math.abs(bal().get(c).solde), 0);
        const est = comptes.reduce((a, c) => a + Math.abs(bal().get(c).solde), 0);
        if (!tot) continue;
        const part = est / tot;
        if (part < seuil / 100 || est < seuils().CTT) continue;
        out.push({
          id:'ESTIM:' + p.code,
          description:`${pct(part, 0)} de la masse du poste (${eur(est)} sur ${eur(tot)}) est portée par des `
                    + `comptes d’estimation — ${comptes.join(', ')}. Un solde qui résulte d’un jugement et non `
                    + `d’une transaction ne se prouve pas par une pièce : il se prouve par la méthode et les `
                    + `hypothèses. C’est un facteur de SUBJECTIVITÉ, et il ne se déduit d’aucune variation.`,
          cibles:[{ fsli:p.code, assertions:['evaluation'] }],
          pertinence:`${pct(part, 0)} de la masse ≥ seuil ${seuil}${NBSP}% (plancher ${eur(seuils().CTT)})`,
          srcRef:p.lib,
        });
      }
      return out;
    },
  },
  {
    code:'TIERS_UNIQUE', lib:'Dépendance à un tiers unique sur le poste',
    srcLib:'Grand livre auxiliaire du poste', srcVue:'plan.rappro',
    seuilLib:'part du poste portée par un seul tiers', seuilUnite:'%',
    seuilDefaut:() => 25, pas:1,
    nature:'qualitatif',
    /* Chemin parcouru, parce qu'il dit ce que vaut le seuil.
       Au premier essai — part ≥ 25 %, sans autre garde — la règle levait HUIT
       facteurs. En regardant la distribution : les quatre plus concentrés
       (77 %, 76 %, 62 %, 56 %) portent tous DEUX À QUATRE TIERS. Avec deux
       tiers, l'un des deux pèse forcément plus de la moitié : le nombre est
       une conséquence arithmétique de la population, pas une dépendance.
       On a donc ajouté un PLANCHER DE POPULATION — cinq tiers — et gardé la
       part absolue, parce que c'est elle qui répond à la question de
       l'auditeur : si ce tiers disparaît, le poste tient-il ? Un fournisseur
       à 35 % est une dépendance qu'il y en ait huit ou huit cents.
       Quatre facteurs restent. Deux seront sans doute écartés au triage, avec
       un motif : c'est un taux de triage normal, pas du bruit. */
    minTiers:5,
    calc(seuil){
      const out = [];
      for (const p of postesCalcules()){
        const m = new Map();
        let tot = 0;
        for (const e of lg().entries){
          const aux = e.lines.map(l => l.auxLib).find(Boolean);
          if (!aux) continue;
          const mv = e.lines.reduce((a, l) => a + (p.re.test(l.compte) ? Math.abs(l.debit - l.credit) : 0), 0);
          if (!mv) continue;
          m.set(aux, (m.get(aux) || 0) + mv); tot += mv;
        }
        if (!tot || m.size < this.minTiers) continue;
        const [tiers, mv] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
        const part = mv / tot;
        if (part < seuil / 100 || mv < seuils().CTT) continue;
        out.push({
          id:'TIERS_UNIQUE:' + p.code,
          description:`Le tiers « ${tiers} » porte ${pct(part, 0)} des mouvements du poste (${eur(mv)} sur `
                    + `${eur(tot)}, ${m.size} tiers au total). La dépendance à un partenaire unique est un `
                    + `facteur d’audit — continuité, pouvoir de négociation, concentration du risque de `
                    + `recouvrement ou d’approvisionnement — et elle ne se lit sur aucune variation N/N-1. `
                    + `À répartition égale, chacun en porterait ${pct(1 / m.size, 0)}.`,
          cibles:[{ fsli:p.code, assertions:['evaluation', 'realite'] }],
          pertinence:`${pct(part, 0)} des mouvements ≥ seuil ${seuil}${NBSP}% · ${m.size} tiers ≥ plancher ${this.minTiers}`,
          srcRef:tiers,
        });
      }
      return out;
    },
  },
  {
    code:'RETRAITEMENT', lib:'Changement d’estimation ou de méthode passé en cours de mission',
    srcLib:'Ajustements et retraitements', srcVue:'plan.ajust',
    seuilLib:'montant minimal du retraitement', seuilUnite:'€',
    seuilDefaut:() => seuils().CTT / 100, pas:100,
    nature:'qualitatif',
    calc(seuil){
      const out = [];
      for (const a of ajustements()){
        if (a.nature !== 'retraitement' || !a.prise) continue;
        const i = impactAjustement(a);
        if (montantAjustement(a) < seuil * 100) continue;
        const cibles = i.postes.map(x => ({ fsli:x.code, assertions:['evaluation', 'presentation'] }));
        if (!cibles.length) continue;
        out.push({
          id:'RETRAITEMENT:' + a.ref,
          description:`L’écriture ${a.ref} « ${a.lib} » est un retraitement de ${eur(montantAjustement(a))} passé `
                    + `à la version ${a.v} : ${a.motif}. Un reclassement ou un changement d’estimation en cours `
                    + `d’exercice est un facteur de CHANGEMENT : ce qui a été jugé une fois peut l’être encore, `
                    + `et le poste touché mérite d’être regardé pour ce qu’il est devenu.`,
          cibles,
          pertinence:`${eur(montantAjustement(a))} ≥ seuil ${eur(seuil * 100)}`,
          srcRef:a.ref,
        });
      }
      return out;
    },
  },
  {
    code:'CORRECTION_N', lib:'Le poste a exigé une correction sur constat d’audit',
    srcLib:'Ajustements et retraitements', srcVue:'plan.ajust',
    seuilLib:'montant minimal de la correction', seuilUnite:'€',
    seuilDefaut:() => seuils().CTT / 100, pas:100,
    nature:'qualitatif',
    calc(seuil){
      const out = [];
      for (const a of correctionsEnVigueur()){
        if (montantAjustement(a) < seuil * 100) continue;
        const i = impactAjustement(a);
        const cibles = i.postes.map(x => ({ fsli:x.code, assertions:['realite', 'exhaustivite'] }));
        if (!cibles.length) continue;
        out.push({
          id:'CORRECTION_N:' + a.ref,
          description:`Le client a passé l’écriture ${a.ref} « ${a.lib} » (${eur(montantAjustement(a))}) EN RÉPONSE `
                    + `à un constat d’audit. Un poste qui a exigé une correction cette année est un poste où le `
                    + `dispositif du client a laissé passer quelque chose : c’est un facteur, indépendamment du `
                    + `fait que la correction ait été passée.`,
          cibles,
          pertinence:`${eur(montantAjustement(a))} ≥ seuil ${eur(seuil * 100)}`,
          srcRef:a.ref,
        });
      }
      return out;
    },
  },
  {
    code:'NOTE_N1', lib:'Anomalie relevée sur ce poste à l’exercice précédent',
    srcLib:'Notes de revue — reprise N-1', srcVue:'plan.synth',
    seuilLib:'types de note retenus', seuilUnite:'niveau', seuilDefaut:() => 1, pas:1,
    nature:'qualitatif',
    calc(seuil){
      /* seuil 1 : notes bloquantes seules · 2 : + « à documenter » · 3 : toutes */
      const rang = { bloq:1, doc:2, q:3, n1:3 };
      const out = [];
      const parSection = {};
      for (const n of NOTES_N1){
        if ((rang[n.type] || 3) > seuil) continue;
        (parSection[n.section] = parSection[n.section] || []).push(n);
      }
      for (const [code, l] of Object.entries(parSection)){
        const p = postesCalcules().find(x => x.code === code);
        if (!p) continue;
        out.push({
          id:'NOTE_N1:' + code,
          description:`${l.length} note(s) de revue de l’exercice précédent portaient sur ce poste : `
                    + l.map(x => '« ' + x.texte + ' »').join(' ')
                    + ` Une anomalie relevée l’an dernier n’est pas une anomalie de cette année, mais elle dit où `
                    + `regarder — et sa RÉCURRENCE, si elle se confirme, est le fait le plus significatif du dossier.`,
          cibles:[{ fsli:code, assertions:[...new Set(l.map(x => x.type === 'bloq' ? 'exhaustivite' : 'presentation'))] }],
          pertinence:`${l.length} note(s) N-1 de type ${[...new Set(l.map(x => TYPES_NOTE[x.type].lib))].join(', ')}`,
          srcRef:libFsli(code),
        });
      }
      return out;
    },
  },
];

const _regleCache = new Map();
/** Candidats d'une règle, mémoïsés sur (règle, seuil, seuils de la mission).
 *  Sans cela, le rail — qui interroge les obstacles au visa de chaque section —
 *  relançait le registre entier seize fois par rendu. */
function candidatsRegle(r){
  const s = seuils(), seuil = seuilRegle(r.code);
  const cle = r.code + '|' + seuil + '|' + s.PM + '|' + s.CTT;
  if (_regleCache.has(cle)) return _regleCache.get(cle);
  const v = r.calc(seuil);
  if (_regleCache.size > 200) _regleCache.clear();
  _regleCache.set(cle, v);
  return v;
}
function seuilRegle(code){
  const r = REGLES_FACTEUR.find(x => x.code === code);
  return S.seuilsFacteurs[code] !== undefined ? S.seuilsFacteurs[code] : r.seuilDefaut();
}

/* ── le questionnaire alimente LE MÊME registre ───────────────────────────
   Une réponse « oui » CRÉE un facteur, avec sa source — le questionnaire n'a
   pas son chemin à lui. Une différence avec les candidats des règles : le
   facteur naît CONFIRMÉ, parce que la réponse EST la décision humaine.
   Redemander à quelqu'un de confirmer ce qu'il vient de répondre est la
   cérémonie qui fait qu'on cesse de lire. Il reste écartable, avec motif,
   comme n'importe quel autre facteur.

   Un « oui » sans précision écrite produit un facteur INCOMPLET : il compte,
   mais l'écran le dit et le visa s'en trouve bloqué — même règle qu'un facteur
   écarté sans motif. */
function reponseQuestion(q, code){
  return q.portee === 'entite' ? (S.questEntite[q.code] || {})
                               : { rep:sec(code).quest[q.code], prec:sec(code).questPrec[q.code] };
}
function facteursQuestionnaire(){
  const out = [];
  for (const q of QUEST_ENTITE){
    const r = S.questEntite[q.code] || {};
    if (r.rep !== 'oui') continue;
    const cibles = postesEnPerimetre().map(p => ({ fsli:p.code, assertions:[q.a] }));
    if (!cibles.length) continue;
    out.push({
      id:'QUEST:' + q.code, questionnaire:true, question:q, portee:'entite',
      description:q.q + ' — répondu OUI. ' + (r.prec || '').trim() + ' ' + q.effet,
      cibles, incomplet:!(r.prec || '').trim(),
      pertinence:'réponse d’entité · nature ' + NATURES_RI[q.nat].lib,
      srcRef:'questionnaire d’entité', par:r.par, t:r.t,
    });
  }
  for (const p of postesEnPerimetre()){
    const st = sec(p.code);
    for (const q of QUEST_SECTION){
      if (st.quest[q.code] !== 'oui') continue;
      const prec = (st.questPrec[q.code] || '').trim();
      out.push({
        id:'QUEST:' + q.code + ':' + p.code, questionnaire:true, question:q, portee:'section',
        description:q.q + ' — répondu OUI sur ' + p.lib + '. ' + prec + ' ' + q.effet,
        cibles:[{ fsli:p.code, assertions:[q.a] }], incomplet:!prec,
        pertinence:'réponse de section · nature ' + NATURES_RI[q.nat].lib,
        srcRef:p.lib, par:st.questPar && st.questPar[q.code], t:st.questT && st.questT[q.code],
      });
    }
  }
  return out;
}
/** Questions restées sans réponse — une évaluation de risque incomplète. */
function questionsSansReponse(code){
  const st = sec(code);
  const s = QUEST_SECTION.filter(q => !st.quest[q.code]);
  const e = code === undefined ? QUEST_ENTITE.filter(q => !(S.questEntite[q.code] || {}).rep) : [];
  return { section:s, entite:e };
}
function repondreQuestion(q, code, rep, prec){
  if (q.portee === 'entite'){
    const av = (S.questEntite[q.code] || {}).rep;
    S.questEntite[q.code] = { rep, prec:prec !== undefined ? prec : (S.questEntite[q.code] || {}).prec || '',
                              par:S.moi, t:tick() };
    if (av !== rep) logEvent('questionnaire de risque — entité', q.q.slice(0, 70), 'réponse : ' + rep);
  } else {
    const st = sec(code);
    const av = st.quest[q.code];
    st.quest[q.code] = rep;
    if (prec !== undefined) st.questPrec[q.code] = prec;
    st.questPar = st.questPar || {}; st.questT = st.questT || {};
    st.questPar[q.code] = S.moi; st.questT[q.code] = tick();
    if (av !== rep) logEvent('questionnaire de risque — ' + libFsli(code), q.q.slice(0, 70), 'réponse : ' + rep);
  }
  _regCache = null; _regCle = '';
}

/** Registre complet : candidats re-dérivés + facteurs saisis à la main,
 *  chacun portant la décision humaine conservée par identifiant. */
let _regCache = null, _regCle = '';
function registre(){
  const sq = seuils();
  const cle = JSON.stringify([S.seuilsFacteurs, S.decisionsFacteurs, S.facteursManuels.length, sq.PM, sq.CTT,
    S.questEntite, postesEnPerimetre().map(p => p.code + JSON.stringify(sec(p.code).quest)).join('|')]);
  if (_regCache && _regCle === cle) return _regCache;
  const out = [];
  for (const r of REGLES_FACTEUR){
    for (const c of candidatsRegle(r)){
      const d = S.decisionsFacteurs[c.id] || {};
      out.push({ ...c, regle:r.code, regleLib:r.lib, nature:r.nature,
                 source:{ lib:r.srcLib, vue:r.srcVue, ref:c.srcRef },
                 auto:true,
                 statut:d.statut || 'propose', motif:d.motif || '',
                 effet:d.effet || 'majore', par:d.par, t:d.t, cree:d.cree || S.premierRendu });
    }
  }
  for (const f of S.facteursManuels){
    const d = S.decisionsFacteurs[f.id] || {};
    out.push({ ...f, auto:false,
               statut:d.statut || 'propose', motif:d.motif || '',
               effet:d.effet || 'majore', par:d.par, t:d.t });
  }
  for (const f of facteursQuestionnaire()){
    const d = S.decisionsFacteurs[f.id] || {};
    out.push({ ...f, regle:'QUESTIONNAIRE', regleLib:'Questionnaire résiduel de risque',
               nature:'qualitatif', auto:false,
               source:{ lib:f.portee === 'entite' ? 'Questionnaire d’entité' : 'Questionnaire de la section',
                        vue:f.portee === 'entite' ? 'plan.facteurs' : 'fsli:' + f.cibles[0].fsli,
                        ref:f.srcRef },
               statut:d.statut || 'confirme', motif:d.motif || '',
               effet:d.effet || 'majore',
               par:d.par || f.par, t:d.t || f.t, cree:d.cree || S.premierRendu });
  }
  _regCache = out; _regCle = cle;
  return out;
}
function facteursDe(code){ return registre().filter(f => f.cibles.some(c => c.fsli === code)); }
function facteursProposes(code){ return facteursDe(code).filter(f => f.statut === 'propose'); }
/** Facteurs confirmés ET retenus comme majorants, sur une assertion donnée. */
function facteursRetenus(code, assertion){
  return registre().filter(f => f.statut === 'confirme' && f.effet === 'majore'
    && f.cibles.some(c => c.fsli === code && (assertion === undefined || c.assertions.includes(assertion))));
}
function statuerFacteur(id, statut, motif, effet){
  const f = registre().find(x => x.id === id); if (!f) return;
  S.decisionsFacteurs[id] = { statut, motif:motif || '', effet:effet || 'majore',
                              par:S.moi, t:tick(), cree:f.cree };
  logEvent('facteur de risque ' + (statut === 'confirme' ? 'confirmé' : statut === 'ecarte' ? 'écarté' : 'remis en attente'),
           id, (motif ? motif.slice(0, 80) : '') + (statut === 'confirme' ? ' · effet : ' + effet : ''));
}

/* ── le questionnaire, à l'écran ──────────────────────────────────────────
   Chaque question porte la RAISON pour laquelle elle existe encore. C'est la
   règle de conception du questionnaire résiduel : si une autre source du
   dossier peut y répondre, la question ne doit pas être posée. */
function ligneQuestion(q, code){
  const r = reponseQuestion(q, code);
  const cle = q.portee === 'entite' ? q.code : q.code + '|' + code;
  const oui = r.rep === 'oui';
  return `<div class="nl ${oui ? (r.prec || '').trim() ? 'bloq' : 'warn' : r.rep ? '' : 'doc'}" style="margin-top:6px">
    <div class="m">
      <span class="tag">${esc(NATURES_RI[q.nat].lib)}</span>
      <span class="tag">${esc(libAssertion(q.a))}</span>
      ${r.rep ? `<span class="pill ${oui ? 'bad' : ''}">${oui ? 'oui' : 'non'}</span>`
              : '<span class="pill warn">sans réponse</span>'}
      ${r.par ? `<span class="smallcaps">${esc(USERS[r.par] ? USERS[r.par].nom : r.par)}${r.t ? ' · ' + horo(r.t) : ''}</span>` : ''}
    </div>
    <div class="txt">${esc(q.q)}</div>
    <div class="row" style="margin-top:5px">
      <div class="ctrl"><label>Réponse</label>
        <select data-qrep="${esc(cle)}" style="width:150px">
          <option value="" ${!r.rep ? 'selected' : ''}>— à répondre —</option>
          <option value="non" ${r.rep === 'non' ? 'selected' : ''}>non</option>
          <option value="oui" ${oui ? 'selected' : ''}>oui</option>
        </select></div>
      ${oui ? `<div class="ctrl" style="flex:1 1 320px"><label>Précision — obligatoire</label>
        <input class="cell txt" data-qprec="${esc(cle)}" value="${esc(r.prec || '')}"
          placeholder="ce qui a changé, qui, quand — c’est ce texte qui part au registre"></div>` : ''}
    </div>
    <div class="m" style="margin-top:3px">
      <span class="smallcaps">Pourquoi cette question existe encore : ${esc(q.pourquoi)}</span>
    </div>
    ${oui && !(r.prec || '').trim() ? `<div class="callout bad" style="margin-top:5px">
      Un « oui » sans précision écrite crée un facteur que personne ne pourra relire.
      Tant qu’elle manque, le visa de la section reste bloqué.</div>` : ''}
  </div>`;
}
function blocQuestionnaireEntite(){
  const sans = QUEST_ENTITE.filter(q => !(S.questEntite[q.code] || {}).rep);
  const oui = QUEST_ENTITE.filter(q => (S.questEntite[q.code] || {}).rep === 'oui');
  return blk('Questionnaire d’entité', QUEST_ENTITE.length + ' question(s) · ' + oui.length + ' réponse(s) « oui »'
      + (sans.length ? ' · ' + sans.length + ' sans réponse' : ''),
    `<p class="note">Quatre questions posées <b>une fois pour le dossier</b>. Une réponse « oui » crée un facteur
    qui porte sur <b>tous les postes retenus</b> : la pression sur le résultat ou un changement de direction ne
    s’arrêtent pas à un cycle. Le questionnaire n’a pas de chemin à lui — il alimente le même registre, avec sa
    source, et le facteur reste écartable avec motif.</p>
    ${QUEST_ENTITE.map(q => ligneQuestion(q, undefined)).join('')}`,
    sans.length ? sans.length + ' sans réponse' : '');
}

/* ── rendu d'un facteur ───────────────────────────────────────────────────── */
const STATUT_FACTEUR = { propose:{ lib:'proposé', cls:'warn' }, confirme:{ lib:'confirmé', cls:'bad' },
                         ecarte:{ lib:'écarté', cls:'' } };
function libFsli(code){ return (POSTES.find(p => p.code === code) || {}).lib || code; }
function libAssertion(code){ return (ASSERTIONS.find(a => a.code === code) || {}).lib || code; }

function carteFacteur(f, compact){
  const s = STATUT_FACTEUR[f.statut];
  const sansMotif = f.statut === 'ecarte' && !f.motif.trim();
  return `<div class="nl ${f.statut === 'propose' ? 'doc' : f.statut === 'confirme' ? 'bloq' : 'n1'}" data-fact="${esc(f.id)}">
    <div class="m">
      <span class="pill ${s.cls}">${s.lib}</span>
      <span class="mono">${esc(f.id)}</span>
      <span class="tag">${f.nature}</span>
      ${f.auto ? `<button class="btn mini sec" data-gosrc="${esc(f.source.vue)}">${esc(f.source.lib)} ↗</button>`
               : '<span class="tag">saisi à la main</span>'}
      ${f.source && f.source.ref ? `<span class="smallcaps">${esc(f.source.ref)}</span>` : ''}
      ${f.statut === 'confirme' ? `<span class="pill ${f.effet === 'majore' ? 'bad' : ''}">${f.effet === 'majore' ? 'majore le risque' : 'sans effet sur le niveau'}</span>` : ''}
      ${f.par ? `<span class="smallcaps">${esc(USERS[f.par].nom)} · ${horo(f.t)}</span>` : ''}
    </div>
    <div class="txt">${esc(f.description)}</div>
    <div class="m" style="margin-top:3px">
      ${compact ? '' : f.cibles.map(c => `<span class="tag">${esc(libFsli(c.fsli))} · ${c.assertions.map(libAssertion).join(', ')}</span>`).join(' ')}
      <span class="smallcaps">pertinence : ${esc(f.pertinence || '—')}</span>
    </div>
    ${f.motif ? `<div class="rep"><b>Motif</b> — ${esc(f.motif)}</div>` : ''}
    ${sansMotif ? '<div class="callout bad" style="margin-top:5px">Un facteur écarté sans motif écrit ne compte pas comme statué : il continue de bloquer le visa.</div>' : ''}
    <div class="row" style="margin:6px 0 0">
      ${f.statut === 'propose' ? `
        <div class="ctrl"><label>Effet si confirmé</label>
          <select data-feff="${esc(f.id)}"><option value="majore">majore le niveau de risque</option>
            <option value="neutre">confirmé, sans effet sur le niveau</option></select></div>
        <div class="ctrl" style="flex:1 1 240px"><label>Motif (obligatoire pour écarter, et pour « sans effet »)</label>
          <input type="text" data-fmotif="${esc(f.id)}" placeholder="pourquoi ce facteur est retenu, neutralisé ou écarté"></div>
        <div class="ctrl"><label>&nbsp;</label><button class="btn" data-fconf="${esc(f.id)}">confirmer</button></div>
        <div class="ctrl"><label>&nbsp;</label><button class="btn sec" data-fecart="${esc(f.id)}">écarter</button></div>`
      : `<button class="btn mini sec" data-frouvre="${esc(f.id)}">remettre en attente</button>`}
    </div>
  </div>`;
}

/* ── bloc inséré dans l'évaluation du risque d'une section ────────────────── */
function blocFacteursSection(p){
  const l = facteursDe(p.code), props = l.filter(f => f.statut === 'propose');
  if (!l.length) return `<p class="note">Aucune constatation venue d’une autre procédure ne touche ce poste
    pour l’instant. Le registre est <a data-vue="plan.facteurs" style="cursor:pointer">ici</a>.</p>`;
  return `
    <div class="row"><span class="pill ${props.length ? 'bad' : ''}">${props.length} à statuer</span>
      <span class="pill">${l.length - props.length} statuée(s)</span></div>
    ${l.map(f => carteFacteur(f, true)).join('')}`;
}

/* ── vue de triage : point d'entrée unique ───────────────────────────────── */
function vueFacteurs(){
  const l = registre();
  const props = l.filter(f => f.statut === 'propose');
  const parSection = {}, parSource = {};
  for (const f of props){
    for (const c of new Set(f.cibles.map(x => x.fsli))) (parSection[c] = parSection[c] || []).push(f);
    const k = f.auto ? f.source.lib : 'saisi à la main';
    (parSource[k] = parSource[k] || []).push(f);
  }
  const tri = [...props].sort((a, b) => (a.cree || '').localeCompare(b.cree || ''));
  const enScope = postesEnPerimetre();
  return `
    <div class="hd"><h1>Registre des facteurs de risque</h1>
      <span class="sub">une constatation levée quelque part se pose seule là où elle compte — et n’est appliquée nulle part sans décision humaine</span></div>
    ${barreReplis('plan.facteurs')}
    ${blocQuestionnaireEntite()}

    <details class="blk pan" data-repli="plan.facteurs/volume" ${ouvertParDefaut("plan.facteurs/volume", `${l.length > CIBLE_VOLUME ? l.length + " facteurs pour une cible de " + CIBLE_VOLUME : ""}`) ? "open" : ""}><summary><h2>Volume</h2><span class="pill bad">${l.length > CIBLE_VOLUME ? l.length + " facteurs pour une cible de " + CIBLE_VOLUME : ""}</span>
      <span class="why">garde-fou : le registre doit rester de l’ordre de la dizaine</span></summary><div class="body">
      <div class="grid3">
        <div class="kv"><span class="k">Facteurs au registre</span><span class="v">${l.length}</span>
          <span class="k">À statuer</span><span class="v">${props.length}</span></div>
        <div class="kv"><span class="k">Confirmés majorants</span><span class="v">${l.filter(f => f.statut === 'confirme' && f.effet === 'majore').length}</span>
          <span class="k">Confirmés sans effet</span><span class="v">${l.filter(f => f.statut === 'confirme' && f.effet === 'neutre').length}</span></div>
        <div class="kv"><span class="k">Écartés</span><span class="v">${l.filter(f => f.statut === 'ecarte').length}</span>
          <span class="k">Sections touchées</span><span class="v">${new Set(l.flatMap(f => f.cibles.map(c => c.fsli))).size}</span></div>
      </div>
      <div class="row"><span class="pill ${l.length > CIBLE_VOLUME ? 'bad' : ''}">${l.length} facteurs — cible ${CIBLE_VOLUME}</span>
        ${l.length > CIBLE_VOLUME ? '<span class="smallcaps">remontez les seuils de pertinence ci-dessous</span>' : ''}</div>
      <div class="row"><span class="pill">${REGLES_FACTEUR.filter(r => r.nature === 'quantitatif').length} règle(s) quantitative(s)</span>
        <span class="pill">${REGLES_FACTEUR.filter(r => r.nature === 'qualitatif').length} règle(s) qualitative(s)</span>
        <span class="smallcaps">soit ${pct(REGLES_FACTEUR.filter(r => r.nature === 'quantitatif').length / REGLES_FACTEUR.length, 0)}
        de règles quantitatives · ${QUESTIONNAIRE.length} question(s) résiduelle(s) au questionnaire</span></div>
      <h3>Seuils de pertinence, par règle</h3>
      ${table([{k:'r',t:'Règle',cls:'wrapcell'},{k:'s',t:'Source'},{k:'n',t:'Nature'},
               {k:'v',t:'Seuil de pertinence'},{k:'c',t:'Facteurs levés',n:1}],
        REGLES_FACTEUR.map(r => {
          const n = candidatsRegle(r).length;
          return { r:esc(r.lib) + (n === 0 ? ' <span class="pill">ne lève rien</span>' : ''), s:esc(r.srcLib), n:r.nature,
                   v:`<input class="cell" data-fseuil="${r.code}" value="${seuilRegle(r.code)}" step="${r.pas}" type="number" style="width:110px">
                      <span class="smallcaps">${esc(r.seuilUnite)} — ${esc(r.seuilLib)}</span>`,
                   c:String(n) }; }))}
      <p class="note">Ces seuils sont <b>des paramètres de la mission</b>, pas des constantes du produit : ils se
      règlent ici, l’effet est immédiat dans la colonne de droite, et le seuil retenu figure sur chaque facteur levé.</p>
      ${REGLES_FACTEUR.filter(r => candidatsRegle(r).length === 0).length ? `<p class="note">
        Règle(s) sans levée sur ce jeu de données : ${REGLES_FACTEUR.filter(r => candidatsRegle(r).length === 0).map(r => esc(r.lib)).join(' · ')}.</p>` : ''}
    </div></details>

    <details class="blk pan" data-repli="plan.facteurs/statuer" ${ouvertParDefaut("plan.facteurs/statuer", `${props.length ? props.length : ""}`) ? "open" : ""}><summary><h2>À statuer</h2><span class="pill bad">${props.length ? props.length : ""}</span>
      <span class="why">${props.length} facteur(s) — les plus anciens d’abord</span></summary><div class="body">
      ${props.length ? `
        <div class="grid2" style="margin-bottom:10px">
          <div><h3>Par section</h3>${Object.keys(parSection).length
            ? Object.entries(parSection).sort((a, b) => b[1].length - a[1].length).map(([c, fs]) =>
                `<div class="kv"><span class="k">${esc(libFsli(c))}</span>
                  <span class="v">${fs.length} <button class="btn mini sec" data-open="${esc(c)}">ouvrir</button></span></div>`).join('')
            : '<p class="note">—</p>'}</div>
          <div><h3>Par source</h3>${Object.entries(parSource).sort((a, b) => b[1].length - a[1].length).map(([s, fs]) =>
            `<div class="kv"><span class="k">${esc(s)}</span><span class="v">${fs.length}</span></div>`).join('')}</div>
        </div>
        ${tri.map(f => carteFacteur(f, false)).join('')}`
        : '<p class="note">Aucun facteur en attente de décision.</p>'}
    </div></details>

    <details class="blk pan" data-repli="plan.facteurs/manuel" ${ouvertParDefaut("plan.facteurs/manuel", "manuel" === "volume") ? "open" : ""}><summary><h2>Lever un facteur à la main</h2>
      <span class="why">n’importe quelle procédure peut en lever un — y compris l’auditeur lui-même</span></summary><div class="body">
      <div class="row">
        <div class="ctrl" style="flex:1 1 320px"><label>Constatation</label>
          <input type="text" id="mf-desc" placeholder="ex. : changement d’ERP en cours d’exercice, signalé par le responsable du cycle vente"></div>
        <div class="ctrl"><label>Nature</label>
          <select id="mf-nat"><option value="qualitatif">qualitative</option><option value="quantitatif">quantitative</option></select></div>
        <div class="ctrl"><label>Source</label>
          <input type="text" id="mf-src" placeholder="ex. : entretien du 04/03/2026, M. Roussel"></div>
      </div>
      <div class="row">
        <div class="ctrl"><label>Postes touchés (plusieurs possibles)</label>
          <select id="mf-fsli" multiple size="6" style="min-width:240px">
            ${enScope.map(p => `<option value="${p.code}">${esc(p.lib)}</option>`).join('')}</select></div>
        <div class="ctrl"><label>Assertions touchées</label>
          <select id="mf-ass" multiple size="6" style="min-width:220px">
            ${ASSERTIONS.map(a => `<option value="${a.code}">${esc(a.lib)}</option>`).join('')}</select></div>
        <div class="ctrl"><label>&nbsp;</label><button class="btn" id="mf-add">lever le facteur</button></div>
      </div>
      <p class="note">C’est la porte qu’emprunteront l’entretien de cycle, l’analyse des balances auxiliaires et
      l’analyse sectorielle.</p>
    </div></details>

    <details class="blk pan" data-repli="plan.facteurs/statues" ${ouvertParDefaut("plan.facteurs/statues", "statues" === "volume") ? "open" : ""}><summary><h2>Déjà statués</h2>
      <span class="why">${l.length - props.length} facteur(s)</span></summary><div class="body">
      ${l.length - props.length ? l.filter(f => f.statut !== 'propose').map(f => carteFacteur(f, false)).join('')
        : '<p class="note">Aucun facteur statué pour l’instant.</p>'}
    </div></details>`;
}
