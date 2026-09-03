import { AsyncLocalStorage } from 'node:async_hooks';

// LES CHEMINS LÉGITIMEMENT SANS LOCATAIRE, ÉCRITS (docs/PLAN_RLS.md, addendum
// A.4 ; mandat du jour n°3, §1.1). Ce fichier est la liste, et il est aussi le
// GARDE : les deux au même endroit, parce qu'une liste que le garde ne consulte
// pas est un document, pas une règle.
//
// ── POURQUOI UN GARDE, ET PAS UN ZÉRO ───────────────────────────────────────
// Sous un rôle sans BYPASSRLS, une requête qui n'a pas posé
// `otto.tenant_id` ne se plaint pas : elle rend ZÉRO LIGNE. Un écran vide sans
// message, un tableau de bord à zéro obstacle, une grille de test sans cellule
// — et rien dans le journal. C'est exactement le silence lu comme un succès
// que la règle 13 nomme. Pire : les gardes SQL du schéma (0037, 0042, ADR-028)
// sont des fonctions `security invoker` qui LISENT des tables pour décider de
// refuser ; sans locataire elles ne voient rien, donc elles ne refusent rien.
// Un garde qui ne voit pas devient un garde qui laisse passer.
//
// Le garde transforme donc ce zéro en REFUS NOMMÉ, qui cite la table visée.
//
// ── OÙ CE GARDE CESSE DE REGARDER, dit ici ──────────────────────────────────
// · Il est DÉSARMÉ tant que le rôle servi contourne la RLS — c'est le cas
//   aujourd'hui en production (`postgres`) et en local (PGlite, propriétaire).
//   Il ne protège donc RIEN aujourd'hui ; il sera la première chose qui parle
//   le jour de l'étape 3 de PLAN_RLS (non exécutée). Son refus est OBSERVÉ
//   malgré tout, dès maintenant : `tenant.test.ts` l'arme et le fait refuser
//   (règle 17 — un garde qui n'a jamais refusé n'est pas un garde).
// · Il regarde le CONTEXTE ASYNCHRONE, pas la base : il constate qu'aucun
//   `withTenant` et aucune dérogation n'englobent l'appel. Une transaction qui
//   aurait posé `otto.tenant_id` par un autre chemin que `withTenant` lui
//   serait invisible. IL EN EXISTE UN, et la première version de ce commentaire
//   affirmait le contraire « et le test le vérifie » alors qu'aucun test ne
//   vérifiait rien (revue hostile n°9, constat 15) :
//   `app/scripts/deploy/reconstruire.ts` pose `otto.tenant_id` à la main pour
//   la tentative de fuite du build. C'est un script, il tourne sous `postgres`,
//   et il est inscrit à ce titre. Le balayage de `sans-locataire.test.ts`
//   énumère désormais TOUTES les poses du dépôt et exige que chacune soit
//   écrite ici — une pose neuve rougit.
// · Il ne juge PAS la valeur du locataire : poser le locataire d'un autre
//   cabinet n'est pas son affaire, c'est celle des politiques.
// · Il ne couvre PAS `db.query`/`db.exec` appelés directement (migrations,
//   bloc d'assertions, mesures de catalogue) : ces chemins parlent au pilote,
//   pas à `q()`, et tournent sous `postgres` par construction.
// · Il garde DEUX entrées : `q()` et l'ouverture d'une transaction NEUVE par
//   `tx()`. Un `run()` à l'intérieur d'une transaction déjà ouverte n'est PAS
//   revérifié — la transaction l'a été à son ouverture — et un point de
//   reprise (savepoint) non plus. Un service qui écrirait par `tx(run => …)`
//   hors de tout locataire est donc attrapé à l'ouverture ; il y en a trois
//   dans le dépôt (`core/events.ts`, `services/acceptance.ts`, et `tenant.ts`
//   lui-même, qui pose justement le locataire).
// · `annulerApres()` (la sonde) ouvre une transaction : sous un rôle sans
//   BYPASSRLS elle exigerait donc un locataire, comme n'importe quel geste.

/** Un chemin de l'application qui s'exécute AVANT tout locataire connu. */
export interface CheminSansLocataire {
  /** La clé citée à l'appel : `sansLocataire('session', …)`. */
  cle: string;
  /** Où, exactement. */
  ou: string;
  /** Pourquoi aucun locataire ne peut être posé ici. */
  raison: string;
  /** Ce que ce chemin lit — et donc ce qu'il expose si sa politique est trop large. */
  lit: string;
  /**
   * `cable` : la dérogation est POSÉE dans le code (un appel
   * `sansLocataire('<clé>', …)` existe) — le test le vérifie fichier par
   * fichier. `a-cabler` : elle est écrite ici mais PAS encore posée ; la
   * raison doit dire à quelle condition elle le sera. Le test vérifie AUSSI ce
   * sens-là — une clé annoncée câblée et absente du code, ou l'inverse, est
   * une déclaration qui ne correspond à rien (règle 13).
   */
  etat: 'cable' | 'a-cabler';
}

export const CHEMINS_SANS_LOCATAIRE: CheminSansLocataire[] = [
  {
    cle: 'session',
    ou: 'src/lib/core/auth.ts — getSessionUser()',
    raison: 'la session PRÉCÈDE le locataire : c’est en lisant app_user par le cookie qu’on APPREND de quel cabinet est la personne. Poser le locataire avant serait le supposer.',
    lit: 'app_user (une ligne, par identifiant exact)',
    etat: 'cable',
  },
  {
    cle: 'choix-identite',
    ou: 'src/app/page.tsx — le sélecteur d’identité de la démonstration',
    raison: 'l’écran d’entrée liste les identités de démonstration alors qu’aucun cookie n’est encore posé ; il n’y a personne, donc pas de cabinet.',
    lit: 'app_user, engagement (le monde de démonstration, public par destination)',
    etat: 'cable',
  },
  {
    cle: 'portail-client',
    ou: 'src/lib/core/auth.ts — portalSession() ; src/app/portal/[token]/**',
    raison: 'le portail est authentifié PAR JETON, pas par une session de cabinet : le contact client n’appartient à aucun cabinet. Sa politique doit être PAR JETON, et elle n’est pas écrite — dette nommée dans PLAN_RLS, à régler avant l’étape 3.',
    lit: 'client_contact par jeton, puis les missions de son entité',
    etat: 'cable',
  },
  {
    cle: 'lien-demo',
    ou: 'src/app/demo/[qui]/route.ts — le lien /demo/<prénom>?vers=…',
    raison: 'ce chemin CRÉE la session : il résout une personne par son prénom pour poser le cookie. Il s’exécute donc, par définition, avant qu’un cabinet soit connu — et il n’existe que sur la démonstration publique (404 ailleurs).',
    lit: 'app_user (une ligne, par identifiant ou prénom)',
    etat: 'cable',
  },
  {
    cle: 'sante',
    ou: 'src/app/api/sante/route.ts',
    raison: 'sonde publique sans cookie. Elle ne sert QUE la démonstration publique : elle lit sous une dérogation NOMMÉE, jamais comme test d’isolation (PLAN_RLS, A.6 — la contradiction de l’étape 3, tranchée).',
    lit: 'des comptages sur le monde de démonstration',
    etat: 'cable',
  },
  {
    cle: 'erreur',
    ou: 'src/app/api/erreur/route.ts et le crochet d’instrumentation',
    raison: 'une exception peut survenir AVANT toute session — et un crochet qui échoue à consigner la panne est la panne qui disparaît. La politique de server_error écrit toujours (with check (true)) et ne lit que les siennes (0140).',
    lit: 'server_error (écriture)',
    etat: 'cable',
  },
  {
    cle: 'scripts',
    ou: 'scripts/** — semis, migration, remise à zéro, harnais',
    raison: 'ils tournent sous SUPABASE_DB_URL (rôle postgres), jamais sous la chaîne de l’application ; ils parlent à tous les cabinets par définition. NON CÂBLÉ, et c’est délibéré : sous le rôle propriétaire le garde est désarmé, donc le câblage ne changerait rien. Il devra l’être le jour où la CI « rôle de production » rejouera le semis sous otto_app.',
    lit: 'tout le schéma',
    etat: 'a-cabler',
  },
];

const PAR_CLE = new Map(CHEMINS_SANS_LOCATAIRE.map((c) => [c.cle, c]));

type Contexte = { locataire: string } | { derogation: string };
const contexte = new AsyncLocalStorage<Contexte>();

let arme = false;

/**
 * ARMER OU DÉSARMER. Appelé une fois à l'ouverture de la base, à partir du rôle
 * RÉELLEMENT servi ; `OTTO_GARDE_LOCATAIRE` (1/0) tranche à la main — c'est ce
 * que le test emploie pour faire refuser le garde, et ce que la CI « rôle de
 * production » emploiera pour l'exiger.
 */
export function armerLeGarde(contourneLaRls: boolean): void {
  const force = process.env.OTTO_GARDE_LOCATAIRE;
  arme = force === '1' ? true : force === '0' ? false : !contourneLaRls;
}

export function gardeArme(): boolean { return arme; }

/** Le locataire posé pour l'appel courant, s'il y en a un. */
export function locataireDuContexte(): string | null {
  const c = contexte.getStore();
  return c && 'locataire' in c ? c.locataire : null;
}

/** Poser le locataire pour la durée de `fn` (appelé par withTenant). */
export function sousLocataire<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return contexte.run({ locataire: tenantId }, fn);
}

/**
 * Conduire un chemin LISTÉ comme légitimement sans locataire. Une clé inconnue
 * est REFUSÉE, armée ou non : une règle inconnue qu'on ignore est le défaut que
 * la règle 13 traque.
 */
export function sansLocataire<T>(cle: string, fn: () => Promise<T>): Promise<T> {
  if (!PAR_CLE.has(cle)) {
    return Promise.reject(new Error(
      `LOC-02 : dérogation « ${cle} » inconnue. Les chemins sans locataire sont écrits dans `
      + `app/src/lib/db/sans-locataire.ts (${CHEMINS_SANS_LOCATAIRE.map((c) => c.cle).join(', ')}) — `
      + `ajoutez le vôtre AVEC sa raison, ou posez un locataire par withTenant.`));
  }
  return contexte.run({ derogation: cle }, fn);
}

/**
 * La table visée, pour que le refus soit diagnosticable sans pile.
 * `OUVERTURE_TRANSACTION` est le seul appel qui n'est pas du SQL : `tx()` garde
 * l'ENTRÉE, et son refus doit dire cela plutôt que « table indéterminée »
 * (revue hostile n°9, constat 12 — un refus sur le chemin d'ÉCRITURE qui ne
 * disait pas ce qu'on écrivait).
 */
export const OUVERTURE_TRANSACTION = '\u0000ouverture-de-transaction';

export function tableVisee(sql: string): string {
  if (sql === OUVERTURE_TRANSACTION) return 'l’ouverture d’une transaction (une écriture)';
  const m = sql.match(/\b(?:from|into|update|join)\s+"?([a-z_][a-z0-9_]*)"?/i);
  return m ? m[1] : '(table indéterminée)';
}

/**
 * LOC-01 — le refus. Appelé par `q()` à chaque requête ; il rend la main
 * immédiatement quand le garde est désarmé (le cas de toutes les exécutions
 * d'aujourd'hui), donc il ne coûte rien.
 */
export function assertLocataire(sql: string): void {
  if (!arme) return;
  if (contexte.getStore()) return;
  throw new Error(
    `LOC-01 : requête sans locataire sur « ${tableVisee(sql)} ». Sous un rôle sans BYPASSRLS, `
    + `elle rendrait ZÉRO LIGNE en silence. Enveloppez l’appel dans withTenant(<cabinet>, …), `
    + `ou — si ce chemin s’exécute légitimement avant toute session — inscrivez-le dans `
    + `app/src/lib/db/sans-locataire.ts et conduisez-le par sansLocataire('<clé>', …).`);
}
