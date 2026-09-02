import { q, q01 } from '@/lib/db/client';
import { motif, type Motif } from './motif';
import { risksFor, type AssertionRisk } from './risk';
import { boucle, type Boucle } from './loop';
import { obstaclesProcessus } from './processus';
import { leadsheetDuPoste, lireAnalytique, type LigneSoldes, type OrigineN1, type RevueAnalytique } from './analytique';
import type { CleLibelle } from '@/lib/i18n/catalogue';

// L'ESPACE DE TRAVAIL D'UN POSTE (R-03, ADR-112 ; anatomie du mandat de la
// soirée, §2).
//
// « Organisation par FSLI : leadsheet → processus → contrôle interne →
// évaluation des risques → échantillons → testing. » C'est l'ordre dans lequel
// un auditeur travaille un poste, et ce n'est pas l'ordre dans lequel le
// produit avait rangé ses écrans (un onglet par fonction, tous au même
// niveau). Ici, le poste est le sujet ; les fonctions sont ses étapes — et,
// depuis la soirée, ses PAPIERS, ses ÉCARTS et ses DEMANDES sont des sections
// du poste, lues ICI, avec le papier qui les porte.
//
// AUCUN STATUT N'EST STOCKÉ. L'état de chaque étape est DÉRIVÉ des faits :
// des comptes rattachés, un processus décrit, des contrôles évalués, des
// risques arbitrés, un échantillon tiré, des éléments contrôlés, un papier
// visé. Un compteur tenu à part diverge un jour de ce qu'il compte.
//
// LES VISAS DU POSTE sont ceux de ses papiers : pour chaque rôle, le visa le
// plus récent posé sur un papier du poste — et il se lit PÉRIMÉ quand le
// papier visé est dépassé (redraft). Un visa périmé se lit en haut de la
// page, jamais en bas.
//
// CE QUE CE SERVICE NE FAIT PAS, ET QUI EST DIT PLUTÔT QUE CACHÉ : il ne
// devine pas quel PROCESSUS sert quel poste. Le lien poste ↔ cycle n'est pas
// modélisé (le processus porte un `cycle_ref` libre, le poste un code de
// référentiel) ; l'étape affiche donc ce qui EST décrit sur le dossier et
// laisse l'auditeur juger, au lieu d'inventer un rattachement.

export type EtatBloc = 'fait' | 'en_cours' | 'a_faire' | 'sans_objet';

export type CleBloc = 'leadsheet' | 'analytique' | 'processus' | 'controle-interne' | 'risques'
  | 'echantillon' | 'testing' | 'papiers' | 'ecarts' | 'demandes';

export interface BlocPoste {
  cle: CleBloc;
  titre: CleLibelle;
  etat: EtatBloc;
  /** Le résumé d'étape, en clé et variables — rendu `title` et texte par l'écran. */
  resume: Motif;
  /** Où l'on agit. null = tout est déjà sur cet écran. */
  href: string | null;
}

/**
 * UNE LIGNE DE LEADSHEET : N, N-1, variation — et ses RÉFÉRENCES CROISÉES
 * (revue n°2 §3.2).
 *
 * Le geste de navigation de tout réviseur : on part du solde, on suit la
 * référence, on arrive au travail. La XREF n'est pas décorative — c'est la
 * PROVENANCE, exprimée en langage d'auditeur au lieu d'être une page qui
 * s'explique. Elle se dérive : un papier référence un compte quand une ligne
 * qu'il a testée porte ce compte. Écrire « REV-01 » à côté de chaque compte du
 * poste serait plus simple et faux — un papier ne teste pas ce qu'il n'a pas vu.
 */
export interface LigneLeadsheet extends LigneSoldes {
  xref: { id: string; code: string }[];
}

export type RoleVisa = 'preparer_validator' | 'reviewer' | 'partner';
export const ROLES_VISA: RoleVisa[] = ['preparer_validator', 'reviewer', 'partner'];

export interface VisaPoste {
  role: RoleVisa;
  nom: string | null;
  quand: string | null;
  etat: 'vise' | 'perime' | 'absent';
  papier: { id: string; code: string } | null;
}

export interface PapierPoste {
  id: string; code: string; title: string; status: string; version: number; quand: string;
  visas: { role: RoleVisa; nom: string; quand: string }[];
}

export interface EcartPoste {
  id: string; taxonomy_code: string; status: string; description: string; piece_ref: string | null;
  papier: { id: string; code: string } | null;
}

export interface DemandePoste {
  id: string; seq_no: number; title: string; status: string; due_date: string | null; items: number; faits: number;
}

export interface VuePoste {
  fsli: { code: string; name: string; statement: string; balance: string; scoping: string; scoping_basis: string | null };
  periode: { n: string; n1: string | null };
  origineN1: OrigineN1;
  comptes: LigneLeadsheet[];
  totalCents: number;
  totalN1Cents: number | null;
  variationCents: number | null;
  variationPct: number | null;
  empreinte: string;
  analytique: RevueAnalytique | null;
  blocs: BlocPoste[];
  boucle: Boucle | null;
  risques: AssertionRisk[];
  visas: VisaPoste[];
  papiers: PapierPoste[];
  ecarts: { liste: EcartPoste[]; ouverts: number; total: number; dossierOuverts: number; dossierTotal: number };
  demandes: DemandePoste[];
  notes: number;
}

const n = (v: unknown) => Number(v ?? 0);
const OUVERT = `status not in ('resolved','scope_limitation')`;

/**
 * Les destinations qu'un poste ouvre — la liste que le garde de couverture
 * interroge. Un écran atteignable UNIQUEMENT depuis un poste doit être ici,
 * sinon il devient injoignable en silence (règle 13).
 */
export function destinationsDuPoste(engagementId: string, code: string): string[] {
  const b = `/eng/${engagementId}`;
  const c = encodeURIComponent(code);
  return [
    `${b}/processus`, `${b}/rcm`, `${b}/risk`, `${b}/population`, `${b}/sampling`,
    `${b}/testing`, `${b}/loop`, `${b}/workpapers`, `${b}/exceptions`, `${b}/requests`,
    /* La revue analytique du dossier : la ligne de variation y renvoie (§2.2). */
    `${b}/analytique`, `${b}/notes`,
    /* `/workpapers` : atteint par l'en-tête XREF de la leadsheet — la liste
       porte le geste « rédiger le papier », elle n'est plus une section. */
    `${b}/provenance`, `${b}/dashboard`, `${b}/ask`, `${b}/poste/${c}`,
  ];
}

export async function vuePoste(engagementId: string, code: string): Promise<VuePoste | null> {
  const fsli = await q01<VuePoste['fsli']>(
    `select code, name, statement, balance::text, scoping, scoping_basis
     from fsli where engagement_id = $1 and code = $2`,
    [engagementId, code],
  );
  if (!fsli) return null;

  const base = `/eng/${engagementId}`;
  const c = encodeURIComponent(code);
  const periode = await q01<{ label: string }>(
    `select p.label from engagement e join period p on p.id = e.period_id where e.id = $1`, [engagementId]);

  /* LA LEADSHEET N / N-1 (§2.2) : les soldes, leur origine, la variation. */
  const ls = await leadsheetDuPoste(engagementId, code);

  /* LES RÉFÉRENCES CROISÉES, par compte. Un papier référence un compte quand
     une ligne d'échantillon qu'il porte est une écriture de ce compte. */
  const refs = await q<{ account_no: string; id: string; code: string }>(
    `select distinct g.account_no, w.id::text, w.code
     from workpaper w
     join procedure_instance p on p.id = w.procedure_id
     join sample sa on sa.procedure_id = p.id
     join sample_item i on i.sample_id = sa.id
     join gl_entry g on g.id = i.unit_id
     where w.engagement_id = $1 and p.fsli_code = $2
     order by g.account_no, w.code`,
    [engagementId, code]);
  const comptes: LigneLeadsheet[] = ls.lignes.map((a) => ({
    ...a,
    xref: refs.filter((r) => r.account_no === a.number).map((r) => ({ id: r.id, code: r.code })),
  }));

  /* LA REVUE ANALYTIQUE, jugée contre l'empreinte des soldes d'aujourd'hui. */
  const analytique = await lireAnalytique(engagementId, code, ls.empreinte);

  /* PROCESSUS — ce qui est décrit sur le dossier, et les changements N/N-1 non
     statués : un changement non statué est un travail qui reste. */
  const proc = await q01<{ modeles: string; cycles: string }>(
    `select (select count(*) from process_model where engagement_id = $1)::text modeles,
            (select count(distinct cycle_ref) from process_model where engagement_id = $1)::text cycles`,
    [engagementId],
  );
  /* Ce qui RESTE à faire sur le processus est déjà calculé ailleurs — la même
     liste que celle qui bloque le visa. Deux vérités sur ce qui reste
     divergeraient un jour, et ce serait toujours celle qu'on croit. */
  const procAStatuer = (await obstaclesProcessus(engagementId)).length;

  /* CONTRÔLE INTERNE — les contrôles du dossier et leur conception évaluée. */
  const ci = await q01<{ controles: string; evalues: string; tests: string }>(
    `select (select count(*) from control where engagement_id = $1)::text controles,
            (select count(*) from control where engagement_id = $1 and di_status <> 'not_assessed')::text evalues,
            (select count(*) from control_test t join control ct on ct.id = t.control_id
             where ct.engagement_id = $1)::text tests`,
    [engagementId],
  );

  /* RISQUES — par assertion, sur CE poste. */
  const risques = await risksFor(engagementId, code);
  const arbitres = risques.filter((r) => r.retained_level !== null).length;
  const eleves = risques.filter((r) => r.level === 'high' || r.level === 'significant').length;

  /* ÉCHANTILLON ET TESTING — par les procédures de CE poste. */
  const ech = await q01<{ pop: string; tire: string; items: string; testes: string }>(
    `select
       (select coalesce(max(s.population_size),0) from sample s
        join procedure_instance p on p.id = s.procedure_id
        where p.engagement_id = $1 and p.fsli_code = $2)::text pop,
       (select count(*) from sample s join procedure_instance p on p.id = s.procedure_id
        where p.engagement_id = $1 and p.fsli_code = $2 and s.status = 'drawn')::text tire,
       (select count(*) from sample_item i join sample s on s.id = i.sample_id
        join procedure_instance p on p.id = s.procedure_id
        where p.engagement_id = $1 and p.fsli_code = $2 and s.status = 'drawn')::text items,
       (select count(*) from sample_item i join sample s on s.id = i.sample_id
        join procedure_instance p on p.id = s.procedure_id
        where p.engagement_id = $1 and p.fsli_code = $2 and s.status = 'drawn'
          and i.status in ('tested','complete','exception'))::text testes`,
    [engagementId, code],
  );

  /* LES PAPIERS DU POSTE, avec leurs visas : la section « Working papers »
     (§2.3) — référence, état de visa, date, lien. Un papier appartient au
     poste par la procédure qu'il documente (fsli_code), comme le statut de
     section le dérive (sections.ts) : une seule règle d'appartenance. */
  const papiersBruts = await q<{ id: string; code: string; title: string; status: string; version: number; quand: string }>(
    `select w.id::text, w.code, w.title, w.status, w.version, w.created_at::text quand
     from workpaper w
     join procedure_instance p on p.id = w.procedure_id
     where w.engagement_id = $1 and p.fsli_code = $2
     order by w.code, w.version desc`,
    [engagementId, code],
  );
  const visasBruts = await q<{ wid: string; role: RoleVisa; nom: string; quand: string; status: string; code: string }>(
    `select s.workpaper_id::text wid, s.sign_role role, u.name nom, s.signed_at::text quand, w.status, w.code
     from signoff s
     join workpaper w on w.id = s.workpaper_id
     join procedure_instance p on p.id = w.procedure_id
     join app_user u on u.id = s.user_id
     where w.engagement_id = $1 and p.fsli_code = $2
     order by s.signed_at desc`,
    [engagementId, code],
  );
  const papiers: PapierPoste[] = papiersBruts.map((w) => ({
    ...w, version: Number(w.version),
    visas: visasBruts.filter((v) => v.wid === w.id).map((v) => ({ role: v.role, nom: v.nom, quand: v.quand })),
  }));
  const visas: VisaPoste[] = ROLES_VISA.map((role) => {
    const v = visasBruts.find((x) => x.role === role);
    if (!v) return { role, nom: null, quand: null, etat: 'absent', papier: null };
    return { role, nom: v.nom, quand: v.quand, etat: v.status === 'outdated' ? 'perime' : 'vise', papier: { id: v.wid, code: v.code } };
  });

  /* LES ÉCARTS DU POSTE, avec le papier qui les porte (§2.3) : un écart naît
     d'une ligne d'échantillon, la ligne d'une procédure, la procédure d'un
     papier — le lien se DÉRIVE, il ne se stocke pas. Les écarts sans écriture
     (rapprochement, import) ne sont d'aucun poste : ils restent sur l'écran
     des écarts, et le compte du dossier est donné à côté. */
  const ecartsListe = await q<EcartPoste & { papier_id: string | null; papier_code: string | null }>(
    `select x.id::text, x.taxonomy_code, x.status, x.description, g.piece_ref,
            w.id::text papier_id, w.code papier_code
     from exception x
     join sample_item si on si.id = x.sample_item_id
     join sample sa on sa.id = si.sample_id
     join procedure_instance p on p.id = sa.procedure_id
     left join gl_entry g on g.id = si.unit_id
     left join lateral (
       select w.id, w.code from workpaper w
       where w.procedure_id = p.id and w.status <> 'outdated'
       order by w.version desc limit 1) w on true
     where x.engagement_id = $1 and p.fsli_code = $2
     order by case x.status when 'open' then 0 when 'clarification_requested' then 1 else 2 end, x.created_at`,
    [engagementId, code],
  );
  const ecartsDuPoste: EcartPoste[] = ecartsListe.map(({ papier_id, papier_code, ...x }) => ({
    ...x, papier: papier_id && papier_code ? { id: papier_id, code: papier_code } : null,
  }));
  const dossier = await q01<{ ouverts: string; total: string }>(
    `select count(*) filter (where ${OUVERT})::text ouverts, count(*)::text total
     from exception where engagement_id = $1`, [engagementId]);

  /* LES DEMANDES AU CLIENT DU POSTE (§2.3) : une demande est du poste quand
     un de ses éléments vise une ligne d'échantillon (ou un écart) du poste. */
  const demandes = await q<{ id: string; seq_no: number; title: string; status: string; due_date: string | null; items: string; faits: string }>(
    `select r.id::text, r.seq_no, r.title, r.status, r.due_date::text,
            count(i.id)::text items,
            count(i.id) filter (where i.status in ('uploaded','complete','na'))::text faits
     from request r
     join request_item i on i.request_id = r.id
     left join exception x on x.id = i.exception_id
     left join sample_item si on si.id = coalesce(i.sample_item_id, x.sample_item_id)
     left join sample sa on sa.id = si.sample_id
     left join procedure_instance p on p.id = sa.procedure_id
     where r.engagement_id = $1 and p.fsli_code = $2
     group by r.id, r.seq_no, r.title, r.status, r.due_date
     order by r.seq_no`,
    [engagementId, code],
  );
  const demandesDuPoste: DemandePoste[] = demandes.map((d) => ({
    ...d, seq_no: Number(d.seq_no), items: Number(d.items), faits: Number(d.faits),
  }));

  const notes = await q01<{ n: string }>(
    `select count(*)::text n from review_note where engagement_id = $1 and status = 'open'`, [engagementId]);

  /* LA BOUCLE ne vaut que si un tirage existe : l'appeler sans échantillon
     rendrait des étapes vides qu'on lirait comme un blocage. */
  const laBoucle = n(ech?.tire) > 0 ? await boucle(engagementId, code) : null;

  const ouverts = ecartsDuPoste.filter((x) => !['resolved', 'scope_limitation'].includes(x.status)).length;
  const vises = papiers.filter((w) => w.status === 'signed').length;
  const itemsDemandes = demandesDuPoste.reduce((s, d) => s + d.items, 0);
  const faitsDemandes = demandesDuPoste.reduce((s, d) => s + d.faits, 0);

  const blocs: BlocPoste[] = [
    {
      cle: 'leadsheet', titre: 'poste.section.leadsheet',
      etat: comptes.length ? 'fait' : 'a_faire',
      resume: comptes.length
        ? motif('poste.resume.comptes', { n: comptes.length, total: (ls.totalCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) })
        : motif('poste.resume.aucunCompte'),
      href: null,
    },
    {
      cle: 'analytique', titre: 'poste.analytique',
      etat: !analytique ? 'a_faire' : analytique.perimee ? 'en_cours' : 'fait',
      resume: !analytique
        ? motif('poste.resume.analytiqueAbsente')
        : analytique.perimee ? motif('poste.resume.analytiquePerimee', { v: analytique.version })
          : motif('poste.resume.analytiqueRedigee', { v: analytique.version }),
      href: null,
    },
    {
      cle: 'processus', titre: 'poste.section.processus',
      etat: n(proc?.modeles) === 0 ? 'a_faire' : procAStatuer > 0 ? 'en_cours' : 'fait',
      resume: n(proc?.modeles) === 0
        ? motif('poste.resume.aucunProcessus')
        : procAStatuer > 0
          ? motif('poste.resume.processusAStatuer', { cycles: proc!.cycles, versions: proc!.modeles, n: procAStatuer })
          : motif('poste.resume.processus', { cycles: proc!.cycles, versions: proc!.modeles }),
      href: `${base}/processus`,
    },
    {
      cle: 'controle-interne', titre: 'rail.controleInterne',
      etat: n(ci?.controles) === 0 ? 'a_faire' : n(ci?.evalues) < n(ci?.controles) ? 'en_cours' : 'fait',
      resume: n(ci?.controles) === 0
        ? motif('poste.resume.aucunControle')
        : motif('poste.resume.controles', { n: ci!.controles, evalues: ci!.evalues, tests: ci!.tests }),
      href: `${base}/rcm`,
    },
    {
      cle: 'risques', titre: 'poste.riskAssessment',
      etat: risques.length === 0 ? 'a_faire' : 'fait',
      resume: risques.length === 0
        ? motif('poste.resume.aucuneAssertion')
        : motif('poste.resume.assertions', { n: risques.length, eleves, arbitres }),
      href: `${base}/risk?fsli=${c}`,
    },
    {
      cle: 'echantillon', titre: 'poste.section.echantillon',
      etat: n(ech?.tire) > 0 ? 'fait' : n(ech?.pop) > 0 ? 'en_cours' : 'a_faire',
      resume: n(ech?.tire) > 0
        ? motif('poste.resume.tirage', { items: ech!.items, pop: ech!.pop })
        : n(ech?.pop) > 0 ? motif('poste.resume.populationSansTirage', { pop: ech!.pop })
          : motif('poste.resume.populationAbsente'),
      href: n(ech?.pop) > 0 ? `${base}/sampling` : `${base}/population`,
    },
    {
      cle: 'testing', titre: 'poste.section.testing',
      etat: n(ech?.items) === 0 ? 'a_faire'
        : n(ech?.testes) >= n(ech?.items) ? 'fait' : 'en_cours',
      resume: n(ech?.items) === 0
        ? motif('poste.resume.rienAControler')
        : motif('poste.resume.testes', { testes: ech!.testes, items: ech!.items }),
      href: `${base}/testing`,
    },
    {
      cle: 'papiers', titre: 'col.workpapers',
      etat: papiers.length === 0 ? 'a_faire' : vises > 0 ? 'fait' : 'en_cours',
      resume: papiers.length === 0 ? motif('poste.resume.aucunPapier') : motif('poste.resume.papiers', { n: papiers.length, vises }),
      href: `${base}/workpapers`,
    },
    {
      cle: 'ecarts', titre: 'poste.section.ecarts',
      etat: ecartsDuPoste.length === 0 ? 'sans_objet' : ouverts > 0 ? 'en_cours' : 'fait',
      resume: ecartsDuPoste.length === 0 ? motif('poste.resume.aucunEcart') : motif('poste.resume.ecarts', { ouverts, total: ecartsDuPoste.length }),
      href: `${base}/exceptions`,
    },
    {
      cle: 'demandes', titre: 'rail.demandes',
      etat: demandesDuPoste.length === 0 ? 'sans_objet' : faitsDemandes >= itemsDemandes ? 'fait' : 'en_cours',
      resume: demandesDuPoste.length === 0
        ? motif('poste.resume.aucuneDemande')
        : motif('poste.resume.demandes', { n: demandesDuPoste.length, faits: faitsDemandes, items: itemsDemandes }),
      href: `${base}/requests`,
    },
  ];

  return {
    fsli,
    periode: { n: periode?.label ?? '', n1: ls.origine.mission?.period_label ?? null },
    origineN1: ls.origine,
    comptes, totalCents: ls.totalCents, totalN1Cents: ls.totalN1Cents,
    variationCents: ls.variationCents, variationPct: ls.variationPct, empreinte: ls.empreinte,
    analytique, blocs, boucle: laBoucle, risques, visas, papiers,
    ecarts: {
      liste: ecartsDuPoste, ouverts, total: ecartsDuPoste.length,
      dossierOuverts: n(dossier?.ouverts), dossierTotal: n(dossier?.total),
    },
    demandes: demandesDuPoste,
    notes: n(notes?.n),
  };
}
