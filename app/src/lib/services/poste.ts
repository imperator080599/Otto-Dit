import { q, q01 } from '@/lib/db/client';
import { fsliAccounts } from './fsli';
import { risksFor } from './risk';
import { boucle, type Boucle } from './loop';
import { obstaclesProcessus } from './processus';

// L'ESPACE DE TRAVAIL D'UN POSTE (R-03, ADR-112).
//
// « Organisation par FSLI : leadsheet → processus → contrôle interne →
// évaluation des risques → échantillons → testing. » C'est l'ordre dans lequel
// un auditeur travaille un poste, et ce n'est pas l'ordre dans lequel le
// produit avait rangé ses écrans (un onglet par fonction, tous au même
// niveau). Ici, le poste est le sujet ; les fonctions sont ses étapes.
//
// AUCUN STATUT N'EST STOCKÉ. L'état de chaque étape est DÉRIVÉ des faits :
// des comptes rattachés, un processus décrit, des contrôles évalués, des
// risques arbitrés, un échantillon tiré, des éléments contrôlés. Un compteur
// tenu à part diverge un jour de ce qu'il compte.
//
// CE QUE CE SERVICE NE FAIT PAS, ET QUI EST DIT PLUTÔT QUE CACHÉ : il ne
// devine pas quel PROCESSUS sert quel poste. Le lien poste ↔ cycle n'est pas
// modélisé (le processus porte un `cycle_ref` libre, le poste un code de
// référentiel) ; l'étape affiche donc ce qui EST décrit sur le dossier et
// laisse l'auditeur juger, au lieu d'inventer un rattachement.

export type EtatBloc = 'fait' | 'en_cours' | 'a_faire' | 'sans_objet';

export interface BlocPoste {
  cle: 'leadsheet' | 'processus' | 'controle-interne' | 'risques' | 'echantillon' | 'testing';
  titre: string;
  /** Ce qu'on y fait, en une ligne. */
  quoi: string;
  etat: EtatBloc;
  /** Des CHIFFRES, jamais « en cours » : ce que l'étape a produit. */
  resume: string;
  /** Où l'on agit. null = tout est déjà sur cet écran. */
  href: string | null;
}

/**
 * UNE LIGNE DE LEADSHEET, avec ses RÉFÉRENCES CROISÉES (revue n°2 §3.2).
 *
 * Le geste de navigation de tout réviseur : on part du solde, on suit la
 * référence, on arrive au travail. La XREF n'est pas décorative — c'est la
 * PROVENANCE, exprimée en langage d'auditeur au lieu d'être une page qui
 * s'explique. Elle se dérive : un papier référence un compte quand une ligne
 * qu'il a testée porte ce compte. Écrire « REV-01 » à côté de chaque compte du
 * poste serait plus simple et faux — un papier ne teste pas ce qu'il n'a pas vu.
 */
export interface LigneLeadsheet {
  number: string;
  label: string;
  balanceCents: number;
  xref: { id: string; code: string }[];
}

export interface VuePoste {
  fsli: { code: string; name: string; statement: string; balance: string; scoping: string; scoping_basis: string | null };
  comptes: LigneLeadsheet[];
  totalCents: number;
  blocs: BlocPoste[];
  boucle: Boucle | null;
  papiers: { id: string; code: string; title: string; status: string; version: number }[];
  ecarts: { ouverts: number; total: number };
  notes: number;
}

const n = (v: unknown) => Number(v ?? 0);

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
    `${b}/testing`, `${b}/loop`, `${b}/workpapers`, `${b}/exceptions`,
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
  const bruts = await fsliAccounts(engagementId, code);
  const totalCents = bruts.reduce((s, a) => s + a.balanceCents, 0);

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
  const comptes: LigneLeadsheet[] = bruts.map((a) => ({
    ...a,
    xref: refs.filter((r) => r.account_no === a.number).map((r) => ({ id: r.id, code: r.code })),
  }));

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
  const ech = await q01<{ pop: string; tire: string; items: string; testes: string; ecarts: string }>(
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
          and i.status in ('tested','complete','exception'))::text testes,
       (select count(*) from exception x
        where x.engagement_id = $1 and x.status not in ('resolved','scope_limitation'))::text ecarts`,
    [engagementId, code],
  );

  const papiers = await q<VuePoste['papiers'][number]>(
    `select w.id::text, w.code, w.title, w.status, w.version
     from workpaper w
     left join procedure_instance p on p.id = w.procedure_id
     where w.engagement_id = $1 and (p.fsli_code = $2 or p.fsli_code is null)
     order by w.code, w.version desc`,
    [engagementId, code],
  );
  const ecarts = await q01<{ ouverts: string; total: string }>(
    `select count(*) filter (where status not in ('resolved','scope_limitation'))::text ouverts,
            count(*)::text total
     from exception where engagement_id = $1`, [engagementId]);
  const notes = await q01<{ n: string }>(
    `select count(*)::text n from review_note where engagement_id = $1 and status = 'open'`, [engagementId]);

  /* LA BOUCLE ne vaut que si un tirage existe : l'appeler sans échantillon
     rendrait des étapes vides qu'on lirait comme un blocage. */
  const laBoucle = n(ech?.tire) > 0 ? await boucle(engagementId, code) : null;

  const blocs: BlocPoste[] = [
    {
      cle: 'leadsheet', titre: 'Leadsheet',
      quoi: 'Les comptes rattachés au poste et leur solde, rapprochés de la balance.',
      etat: comptes.length ? 'fait' : 'a_faire',
      resume: comptes.length
        ? `${comptes.length} compte(s) · ${(totalCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`
        : 'aucun compte rattaché — la balance n’est pas importée, ou la table de correspondance ne couvre pas ces comptes',
      href: null,
    },
    {
      cle: 'processus', titre: 'Processus',
      quoi: 'Le processus du client en données structurées : étapes, acteurs, systèmes, différence N/N-1.',
      etat: n(proc?.modeles) === 0 ? 'a_faire' : procAStatuer > 0 ? 'en_cours' : 'fait',
      resume: n(proc?.modeles) === 0
        ? 'aucun processus décrit sur ce dossier'
        : `${proc!.cycles} cycle(s) décrit(s) · ${proc!.modeles} version(s)`
          + (procAStatuer > 0 ? ` · ${procAStatuer} changement(s) N/N-1 à statuer` : ''),
      href: `${base}/processus`,
    },
    {
      cle: 'controle-interne', titre: 'Contrôle interne',
      quoi: 'Les contrôles qui couvrent le poste, leur conception et leur efficacité.',
      etat: n(ci?.controles) === 0 ? 'a_faire' : n(ci?.evalues) < n(ci?.controles) ? 'en_cours' : 'fait',
      resume: n(ci?.controles) === 0
        ? 'aucun contrôle décrit sur ce dossier'
        : `${ci!.controles} contrôle(s) · ${ci!.evalues} évalué(s) · ${ci!.tests} test(s)`,
      href: `${base}/rcm`,
    },
    {
      cle: 'risques', titre: 'Évaluation des risques',
      quoi: 'Le niveau de risque par assertion — celui qui commande la taille des travaux.',
      etat: risques.length === 0 ? 'a_faire' : 'fait',
      resume: risques.length === 0
        ? 'aucune assertion évaluée sur ce poste'
        : `${risques.length} assertion(s) · ${eleves} à risque élevé · ${arbitres} arbitrage(s) humain(s)`,
      href: `${base}/risk?fsli=${c}`,
    },
    {
      cle: 'echantillon', titre: 'Échantillon',
      quoi: 'La population contrôlable, puis le tirage : couverture, unités monétaires, germe rejouable.',
      etat: n(ech?.tire) > 0 ? 'fait' : n(ech?.pop) > 0 ? 'en_cours' : 'a_faire',
      resume: n(ech?.tire) > 0
        ? `${ech!.items} élément(s) tiré(s) sur une population de ${ech!.pop}`
        : n(ech?.pop) > 0 ? `population de ${ech!.pop} — aucun tirage validé`
          : 'population non constituée',
      href: n(ech?.pop) > 0 ? `${base}/sampling` : `${base}/population`,
    },
    {
      cle: 'testing', titre: 'Contrôle sur pièces',
      quoi: 'Chaque élément tiré contrôlé contre ses pièces, écart par écart.',
      etat: n(ech?.items) === 0 ? 'a_faire'
        : n(ech?.testes) >= n(ech?.items) ? 'fait' : 'en_cours',
      resume: n(ech?.items) === 0
        ? 'rien à contrôler tant que l’échantillon n’est pas tiré'
        : `${ech!.testes} / ${ech!.items} élément(s) contrôlé(s)`,
      href: `${base}/testing`,
    },
  ];

  return {
    fsli, comptes, totalCents, blocs, boucle: laBoucle, papiers,
    ecarts: { ouverts: n(ecarts?.ouverts), total: n(ecarts?.total) },
    notes: n(notes?.n),
  };
}
