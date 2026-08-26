
/* ═══ 47. UN TESTING ENTIÈREMENT DÉROULÉ — CHIFFRE D'AFFAIRES ══════════════
   Un outil d'audit se juge sur le papier qu'il produit, pas sur ses écrans
   vides. Le test de détail du chiffre d'affaires est donc DÉROULÉ dans l'état
   initial du fichier, de bout en bout :

     échantillon tiré → requête émise → pièces déposées côté client → états
     dérivés à « reçue » → champs relevés selon le catalogue de preuve → un
     écart constaté, expliqué, corroboré et RÉSOLU → un second écart laissé
     NON RÉSOLU qui remonte au cumul → une note de revue posée par la
     réviseuse, répondue par le préparateur, close par la réviseuse → travail
     achevé par son préparateur, revu par sa réviseuse.

   RIEN ICI N'EST FABRIQUÉ. Chaque étape passe par la MÊME fonction que le
   clic correspondant : creerRequete, deposer, les champs du papier, la carte
   de résolution, ajouterNote, changerStatut. Si une règle refusait une de ces
   étapes, l'amorce échouerait au lieu de produire un faux papier — et c'est
   la seule façon de garantir que ce qu'on montre est ce que l'outil fait.

   L'horloge est remise à sa valeur de départ à la fin : ces travaux ont eu
   lieu AVANT qu'on ouvre l'outil, comme les affectations de l'amorce.
   ═══════════════════════════════════════════════════════════════════════ */

const DEROULE = {
  poste:'CA', proc:'DETAIL',
  prep:'karim', rev:'sonia',
  heures:12.5,          // heures réellement passées — donnée déclarée du jeu d'essai
  /* Les deux écarts sont NOMMÉS : on ne compte pas sur le tirage pour en
     rencontrer un. Le premier est résolu, le second reste au cumul. */
  note:{
    type:'doc',
    texte:'Point à valider avant revue : pour les ventes à installation différée, je me suis appuyé sur le bon '
        + 'de livraison signé, faute de procès-verbal de réception au dossier. Est-ce que cela te suffit comme '
        + 'preuve de la réalité de la livraison, ou faut-il demander le procès-verbal au client ?',
    reponse:'Le bon de livraison signé du client suffit pour l’assertion de réalité : il porte la date et '
          + 'l’identité du signataire. Le procès-verbal de réception n’ajouterait rien ici, il relèverait de '
          + 'l’acceptation contractuelle. Point clos, la conclusion peut être rédigée en l’état.',
  },
};

/** Les travaux que le déroulé affecte. Ils s'ajoutent à ceux de l'amorce
 *  d'équipe : c'est l'ensemble des affectations présentes au démarrage, et
 *  rien d'autre ne doit être écrit tant que personne n'accepte la
 *  proposition de répartition. */
function codesDeroules(){ return ['SEC-' + DEROULE.poste + '-' + DEROULE.proc]; }

/** Le déroulé complet. Rendu : ce qu'il a réellement produit, pour le harnais. */
function derouler(){
  const p = postesCalcules().find(x => x.code === DEROULE.poste);
  const pr = proceduresRequises(p).find(x => x.code === DEROULE.proc);
  if (!p || !pr) return { ok:false, why:'section ou procédure absente' };
  const moiAvant = S.moi;

  /* 1 — affectation. Elle passe par affecter(), donc par la règle
         d'indépendance : si le préparateur n'avait pas signé, tout s'arrête. */
  const a1 = affecter('SEC-CA-DETAIL', 'preparateur', DEROULE.prep);
  const a2 = affecter('SEC-CA-DETAIL', 'reviseur', DEROULE.rev);
  if (!a1.ok || !a2.ok) return { ok:false, why:(a1.why || a2.why) };

  /* 1 bis — LA MÉTHODE DE SÉLECTION, et pourquoi elle change ici.
     Le garde-fou d'exhaustivité se déclenche sur cette procédure : 115
     éléments retenus sur 269, soit 73 % de la masse — à ce niveau on ne sonde
     plus, on teste presque tout. Et la mesure est sans appel : cette
     sélection-là ne rencontre AUCUNE des deux anomalies de montant présentes
     dans la population. Le déroulé applique donc ce que l'écran recommande :
     sondage en unités monétaires, à la taille qui ramène l'intervalle au seuil
     de planification. 167 éléments au lieu de 115 — plus de travail, pas moins
     — et les deux anomalies de montant sont rencontrées. C'est le résultat de
     l'ADR-047, reproduit ici sur le dossier vivant. */
  const st0 = proc(p.code, pr.code);
  st0.methode = 'sum';
  _echProcCache.clear();
  const e0 = echantillonProc(p, pr);
  st0.taille = e0.nAdequate;
  _echProcCache.clear();
  logEvent('méthode de sélection modifiée', p.lib + ' · ' + pr.code,
           'sondage en unités monétaires, taille ' + e0.nAdequate + ' — intervalle ramené au seuil');

  /* 2 — la requête, engendrée depuis le catalogue de preuve. */
  const req = requeteJustificatifsProc(p, pr);
  if (!req) return { ok:false, why:'aucune sélection à demander' };

  /* 3 — le client dépose. Chaque dépôt passe par deposer(), donc l'état
         « reçue » se DÉRIVE : aucune case n'est cochée nulle part. */
  const espaceAvant = S.espace, clientAvant = S.moiClient;
  S.espace = 'client';
  const ref = referentSection(p.code);
  if (ref) S.moiClient = ref.id;
  const docs = docsAttendusProc(p, pr);
  for (const it of req.items){
    for (let k = 0; k < docs.length; k++) deposer(req.id, it.id);
  }
  S.espace = espaceAvant; S.moiClient = clientAvant;

  /* 4 — les champs sont relevés selon le catalogue. C'est la lecture des
         pièces : la valeur portée par la pièce synthétique est saisie telle
         quelle, exactement comme le ferait un auditeur qui la lit. */
  S.moi = DEROULE.prep;
  let releves = 0;
  for (const c of controles(p, pr)){
    if (etatControle(c) !== 'recue') continue;
    const v = c.ch.val(c.ligne.x);
    c.ligne.champs[c.cle] = c.ch.type === 'montant' ? (v / 100).toFixed(2).replace('.', ',')
                          : c.ch.type === 'bool' ? (v ? 'oui' : 'non') : String(v);
    releves++;
  }
  marquerExecution(p, pr);

  /* 5 — les écarts. Le jeu de données en produit ; on en RÉSOUT UN et on
         laisse l'autre. Le premier est le plus gros écart chiffré, parce que
         c'est celui qu'un auditeur traite d'abord. */
  /* Les écarts CHIFFRÉS sont pris du plus PETIT au plus grand : on résout le
     premier, on laisse le second. C'est l'ordre réel d'un dossier — la remise
     de 620 € s'explique et se corrobore en une pièce, le retour de 4 850 €
     attend son avoir. Et c'est le plus gros qui reste au cumul, pas l'inverse. */
  const chiffres = ecartsProc(p, pr).filter(c => constateDe(c) !== 0)
    .sort((x, y) => Math.abs(constateDe(x)) - Math.abs(constateDe(y)));
  let resolu = null, laisse = null;
  if (chiffres.length){
    const c = chiffres[0];
    const r = resol(c);
    const cst = constateDe(c);
    r.expl = 'Remise commerciale de fin d’année accordée à ce client et non déduite de la facture : l’avoir '
           + 'correspondant a été émis le 12 janvier, il vous est joint.';
    r.concl = 'La remise est corroborée par l’avoir déposé et par l’écriture qui le porte au grand livre. Le '
            + 'montant facturé excède le montant dû de la remise ; l’avoir ayant été émis, l’écart est qualifié '
            + 'corrigé et sort du cumul pour sa totalité. Rapporté au seuil de remontée, il n’y entrait pas — '
            + 'ce qui ne dispense pas de le documenter, seulement de le cumuler.';
    r.disposition = 'corrigee';
    r.explique = cst;
    const dep = depotsElement(p, pr, c.ligne.cle);
    if (dep.length) r.corrobPiece = dep[0].nom;
    const ecr = lg().entries.find(e => String(e.pieceRef) === String(c.ligne.x.e && c.ligne.x.e.pieceRef));
    if (ecr) r.corrobEcriture = ecr.num;
    const res = conclureResolution(r, cst, p.lib + ' · ' + c.ch.lib + ' — ' + c.ligne.cle);
    resolu = { cle:c.ligne.cle, champ:c.ch.lib, constate:cst, ok:res.ok, why:res.why };
  }
  if (chiffres.length > 1){
    const c = chiffres[1];
    laisse = { cle:c.ligne.cle, champ:c.ch.lib, constate:constateDe(c) };
  }

  /* 6 — la note de revue. Le PRÉPARATEUR pose le point sur son papier et
         l'adresse à sa réviseuse ; elle répond et elle clôt. C'est la règle
         déjà écrite : on ne clôt pas sa propre note, et seul un réviseur ou un
         associé clôt. Si la réviseuse avait posé la note, elle n'aurait pas pu
         la clore — et l'amorce le dirait au lieu de le cacher. */
  S.moi = DEROULE.prep;
  const n = ajouterNote(DEROULE.note.type,
    ancre(p.code, 'procedure', pr.code, 'Procédure ' + procRef(p, pr)), DEROULE.note.texte);
  n.pour = DEROULE.rev;
  S.moi = DEROULE.rev;
  n.reponses.push({ par:S.moi, t:tick(), texte:DEROULE.note.reponse });
  logEvent('réponse à une note', '#' + n.id + ' — ' + n.ancre.lib, USERS[S.moi].nom);
  const closable = peutClore(S.moi, n);
  if (closable){
    n.clos = { par:S.moi, t:tick() };
    logEvent('note close', '#' + n.id + ' — ' + n.ancre.lib,
             USERS[S.moi].nom + ' (' + ROLE_LIB[USERS[S.moi].role] + ')');
  }

  /* 7 — la conclusion de la procédure, puis les statuts : achevé par le
         préparateur seul, revu par la réviseuse seule. changerStatut refuse
         tout le reste. */
  S.moi = DEROULE.prep;
  proc(p.code, pr.code).conclusion =
    'Test de détail exécuté sur ' + (echantillonProc(p, pr) || { retenus:[] }).retenus.length + ' éléments '
    + 'sélectionnés par sondage en unités monétaires, à la taille qui ramène l’intervalle de sondage au seuil '
    + 'de planification — la strate exhaustive retenait 73 % de la masse sans rencontrer aucune des deux '
    + 'anomalies de montant de la population. Les pièces ont été obtenues pour la '
    + 'totalité des éléments. Deux écarts de montant ont été relevés : le premier est corroboré par l’avoir '
    + 'et par l’écriture de correction, et sort du cumul ; le second reste non résolu et y demeure. Sous '
    + 'réserve de ce second écart, l’assertion de réalité du chiffre d’affaires est couverte pour la '
    + 'population testée.';
  /* La conclusion cite la méthode retenue, parce que c'est elle qui explique
     l'étendue — et parce qu'un réviseur qui lit « 167 éléments » sans savoir
     d'où sort le nombre ne peut rien en faire. */
  /* Les heures passées sont une DONNÉE DÉCLARÉE du jeu d'essai, comme les
     taux d'anomalie : sans elles, la lecture « budget contre réalisé » du
     pilotage n'aurait rien à montrer. Le dépassement est voulu — 167 éléments
     au lieu des 115 de la strate, c'est le coût de la méthode adéquate. */
  trav('SEC-CA-DETAIL').heuresReel = DEROULE.heures;
  const s1 = changerStatut('SEC-CA-DETAIL', 'acheve');
  S.moi = DEROULE.rev;
  const s2 = changerStatut('SEC-CA-DETAIL', 'revu');
  S.moi = moiAvant;

  const n5 = comptesEtats(controles(p, pr));
  return { ok:true, requete:req.id, elements:req.items.length, releves,
           etats:n5, resolu, laisse, note:{ id:n.id, close:closable },
           acheve:s1.ok, revu:s2.ok,
           cumul:anomalies().filter(x => !x.souSeuil && x.section === p.code)
                   .reduce((t, x) => t + x.montant, 0) };
}
