import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { questionsOfScope, answerQuestion, register, decideFactor } from '@/lib/services/questionnaire';
import { proposerReprise, reprises, deciderReprise } from '@/lib/services/carryforward';
import { construireDossierN1 } from '@/lib/flows/prior-year';
import { declarerLignes, pointer, documenter, expliquerEcart, lignes } from '@/lib/services/tieout';
import { plaquetteDemo } from '@/lib/services/tieout-demo';
import { assurerAchevement, conclure, sansObjet, dateRapport } from '@/lib/services/completion';
import { jalons, marquerJalonFait } from '@/lib/services/acceptance';
import { answerExplanation } from '@/lib/services/evidence';
import { boucle } from '@/lib/services/loop';
import { campagne, rapprochement } from '@/lib/services/circularisations';
import { acheverCircularisationBanques } from '@/lib/flows/part1';
import { obstaclesAuVisa } from '@/lib/services/obstacles';
import { listFslis } from '@/lib/services/fsli';

// LE PARCOURS COMPLET — de la reprise à la clôture (DEMO_APP.md).
//
// CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS. Ce n'est pas un peuplement :
// chaque étape appelle le MÊME service que l'écran, dans le même ordre, avec
// les mêmes refus. C'est ce qui en fait une preuve plutôt qu'une mise en scène —
// si une règle refuse, le parcours s'arrête, et c'est le but.
//
// IL FINIT PAR UN DOSSIER SCELLÉ, et c'est la définition de « fini » : la
// clôture demande LA liste des obstacles au visa (ADR-085), donc le parcours ne
// peut pas s'achever tant qu'une seule règle du dossier reste insatisfaite.
//
// Ce qui n'est pas ici — l'import, l'échantillon, le vouching, la résolution,
// le papier, les visas — est dans `part1.ts` : ce fichier CONTINUE le parcours
// là où part1 s'arrête, il ne le refait pas.

export interface EtapeParcours {
  cle: string;
  libelle: string;
  fait: string;
}

const journal: EtapeParcours[] = [];
const note = (cle: string, libelle: string, fait: string) => { journal.push({ cle, libelle, fait }); };

/**
 * Le client répond aux demandes restées ouvertes.
 *
 * Le déroulé de démonstration laisse une demande d'EXPLICATION sans réponse —
 * et la boucle a raison de la signaler : personne n'a répondu. Y répondre est
 * un geste du parcours, pas un contournement du contrôle : c'est le client qui
 * répond, par le portail, comme pour les pièces.
 */
export async function etapeReponsesClient(engagementId = IDS.engNep): Promise<void> {
  const ouvertes = await q1<{ n: string }>(
    `select count(*) n from request_item ri
     join request r on r.id = ri.request_id
     where r.engagement_id = $1 and ri.kind = 'explanation' and ri.status <> 'complete'`,
    [engagementId],
  );
  const contact = await q1<{ id: string }>(
    `select c.id from client_contact c
     join engagement e on e.entity_id = c.entity_id
     where e.id = $1 and c.active order by c.name limit 1`,
    [engagementId],
  );
  const items = await q<{ id: string }>(
    `select ri.id from request_item ri
     join request r on r.id = ri.request_id
     where r.engagement_id = $1 and ri.kind = 'explanation' and ri.status <> 'complete'`,
    [engagementId],
  );
  for (const it of items) {
    await answerExplanation(it.id, contact.id,
      'Écriture d’ajustement passée à la demande du contrôle de gestion ; le détail et l’autorisation figurent dans le dossier de clôture mensuel.');
  }
  note('reponses', 'Réponses du client', `${ouvertes.n} demande(s) d’explication répondue(s)`);
}

/** La reprise N-1 : proposer, puis STATUER — sinon le visa reste bloqué. */
export async function etapeReprise(engagementId = IDS.engNep): Promise<void> {
  await construireDossierN1();
  const proposees = await proposerReprise(engagementId, IDS.users.lea);
  for (const r of proposees.filter((x) => x.status === 'proposed')) {
    /* Une décision de périmètre se reconfirme ; un papier de travail N-1 ne se
       reprend pas — il dit ce qu'il faut REFAIRE. C'est la différence entre
       reprendre une conclusion et recopier un document. */
    if (r.kind === 'workpaper') {
      await deciderReprise(r.id, IDS.users.lea, 'dismissed',
        'Papier de travail N-1 : les travaux sont refaits cette année sur la population 2025.');
    } else {
      await deciderReprise(r.id, IDS.users.lea, 'reconfirmed');
    }
  }
  const restantes = (await reprises(engagementId)).filter((x) => x.status === 'proposed');
  note('reprise', 'Reprise de l’exercice précédent',
    `${proposees.length} proposition(s) statuée(s), ${restantes.length} en attente`);
}

/** Le questionnaire résiduel : entité + chaque poste retenu, et les facteurs statués. */
export async function etapeQuestionnaire(engagementId = IDS.engNep): Promise<void> {
  const cat = await catalogueDeLaMission(engagementId);
  const postes = (await listFslis(engagementId))
    .filter((f) => f.scoping === 'in_scope' || f.scoping === 'in_scope_qualitative')
    .map((f) => f.code);

  for (const qn of questionsOfScope(cat, 'entite')) {
    await answerQuestion({
      engagementId, fsliCode: null, questionCode: qn.code, answer: 'non',
      detail: '', actorUserId: IDS.users.lea,
    });
  }
  for (const p of postes) {
    for (const qn of questionsOfScope(cat, 'section')) {
      /* UNE réponse « oui » sur le chiffre d'affaires : le questionnaire ne
         coche rien, il CRÉE un facteur — et un parcours où toutes les réponses
         sont « non » ne démontrerait pas cela. */
      const oui = p === 'REVENUE' && qn.code === questionsOfScope(cat, 'section')[0].code;
      await answerQuestion({
        engagementId, fsliCode: p, questionCode: qn.code,
        answer: oui ? 'oui' : 'non',
        detail: oui
          ? 'Pression commerciale de fin d’exercice : objectifs annuels atteints sur les deux dernières semaines de décembre.'
          : '',
        actorUserId: IDS.users.lea,
      });
    }
  }
  for (const f of await register(engagementId)) {
    if (f.status !== 'proposed') continue;
    await decideFactor(engagementId, f.id, 'confirmed',
      'Facteur retenu : il porte sur la réalité du chiffre d’affaires du dernier mois.',
      IDS.users.claire);
  }
  note('questionnaire', 'Questionnaire résiduel de risque',
    `entité + ${postes.length} poste(s), facteurs déclarés statués`);
}

/** Le pointage des états financiers : deux natures calculées, une documentée. */
export async function etapePointage(engagementId = IDS.engNep): Promise<void> {
  await declarerLignes(engagementId, IDS.users.lea, await plaquetteDemo(engagementId));
  await pointer(engagementId, IDS.users.lea);

  const piece = await q1<{ id: string }>(
    `select id from evidence where engagement_id = $1 and quarantined = false order by filename limit 1`,
    [engagementId],
  );
  for (const l of await lignes(engagementId)) {
    if (l.status && l.status !== 'open') continue;
    if (l.nature === 'calcul_documente') {
      await documenter(engagementId, IDS.users.lea, l.id,
        'Effectif moyen calculé sur les douze déclarations sociales nominatives de l’exercice.',
        piece.id);
    } else {
      await expliquerEcart(engagementId, IDS.users.lea, l.id,
        'Écart de présentation : reclassement opéré dans la plaquette, sans incidence sur le résultat.');
    }
  }
  const restantes = (await lignes(engagementId)).filter((l) => !l.status || l.status === 'open');
  note('pointage', 'Pointage des états financiers',
    `${(await lignes(engagementId)).length} ligne(s), ${restantes.length} non pointée(s)`);
}

/** L'achèvement : cinq travaux, avec leurs règles de date. */
export async function etapeAchevement(engagementId = IDS.engNep): Promise<void> {
  await assurerAchevement(engagementId);
  const rapport = (await dateRapport(engagementId)) ?? '2026-03-31';
  const piece = await q1<{ id: string }>(
    `select id from evidence where engagement_id = $1 and quarantined = false order by filename limit 1`,
    [engagementId],
  );

  await conclure(engagementId, IDS.users.claire, 'evenements_posterieurs', {
    findings: 'Procès-verbaux, relevés bancaires postérieurs et factures reçues après clôture revus.',
    conclusion: 'Aucun événement postérieur nécessitant un ajustement ou une information en annexe.',
    coveredThrough: rapport,
  });
  await sansObjet(engagementId, IDS.users.claire, 'continuite',
    'Trésorerie nette positive, résultat bénéficiaire, aucun indicateur de doute significatif relevé.');
  await conclure(engagementId, IDS.users.claire, 'anomalies_non_corrigees', {
    findings: 'Cumul repris de l’état des anomalies.',
    conclusion: 'Les anomalies non corrigées dépassent le seuil de signification ; l’incidence sur l’opinion est traitée dans la conclusion du dossier.',
  });
  await conclure(engagementId, IDS.users.claire, 'lettre_affirmation', {
    conclusion: 'Lettre d’affirmation reçue, signée du directeur général, datée du jour du rapport.',
    signedOn: rapport, evidenceId: piece.id,
  });
  await conclure(engagementId, IDS.users.claire, 'gouvernance', {
    findings: 'Anomalies non corrigées, limitation sur le grand livre provisoire, points d’attention sur le cut-off.',
    conclusion: 'Communication faite au président, sans observation en retour.',
  });
  note('achevement', 'Achèvement', 'cinq travaux conclus ou motivés');
}

/**
 * Les jalons qui ont EU LIEU sont marqués faits.
 *
 * Un jalon dont la date est passée n'est pas en retard s'il a eu lieu. Sans
 * cette étape, l'intervention intérimaire de novembre resterait « échue et non
 * faite » en mars, et le dossier ne pourrait plus se clore — un retard fabriqué
 * par l'outil, pas par le dossier.
 */
export async function etapeJalons(engagementId = IDS.engNep): Promise<void> {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  let faits = 0;
  for (const j of await jalons(engagementId)) {
    if (!j.due_date || j.done_at) continue;
    if (j.due_date > aujourdhui) continue;   // pas encore échu : rien à dire
    await marquerJalonFait(engagementId, IDS.users.lea, j.code);
    faits += 1;
  }
  note('jalons', 'Jalons', `${faits} jalon(s) échu(s) marqué(s) faits`);
}

/**
 * Le parcours complet, après part1.
 *
 * Rend les obstacles RESTANTS : zéro signifie que le dossier peut être clos, et
 * c'est la seule affirmation que ce parcours produit.
 */
/**
 * LA CIRCULARISATION FAIT PARTIE DE LA FIN DE MISSION (ADR-111).
 *
 * Le monde de démonstration s'arrête au listing INCOMPLET — c'est le défaut
 * que l'écran doit donner à trouver. Tout parcours qui va jusqu'au scellement
 * doit donc la finir, sinon le compte non couvert et la demande jamais partie
 * bloquent le visa : et c'est exactement ce qu'on veut qu'ils fassent.
 */
export async function etapeCircularisation(engagementId = IDS.engNep): Promise<void> {
  if (engagementId !== IDS.engNep) return;   // le listing du jeu est celui du dossier NEP
  if (!(await campagne(engagementId, 'banque'))) return;
  await acheverCircularisationBanques();
  const r = await rapprochement(engagementId, 'banque');
  const ecart = r.lignes.find((l) => l.ecartCents !== null && l.ecartCents !== 0);
  note('circularisation', 'Circularisation des banques',
    ecart
      ? `écart de ${((ecart.ecartCents ?? 0) / 100).toFixed(2)} € confirmé et EXPLIQUÉ`
      : 'aucun écart');
}

export async function deroulerFin(engagementId = IDS.engNep): Promise<{
  etapes: EtapeParcours[];
  obstacles: { famille: string; libelle: string }[];
}> {
  journal.length = 0;
  await etapeReponsesClient(engagementId);
  await etapeReprise(engagementId);
  await etapeQuestionnaire(engagementId);
  await etapePointage(engagementId);
  await etapeCircularisation(engagementId);
  await etapeAchevement(engagementId);
  await etapeJalons(engagementId);
  /* La boucle doit être FERMÉE sur le poste travaillé : c'est la vérification
     que le parcours a bien tourné, pas seulement qu'il s'est déroulé. */
  const b = await boucle(engagementId, 'REVENUE');
  note('boucle', 'La boucle', b.fermee ? 'fermée' : `ouverte — ${b.obstacles.join(' ; ')}`);

  const obstacles = (await obstaclesAuVisa(engagementId))
    .map((o) => ({ famille: o.famille, libelle: o.libelle }));
  note('obstacles', 'Obstacles au visa', `${obstacles.length} restant(s)`);
  return { etapes: [...journal], obstacles };
}
