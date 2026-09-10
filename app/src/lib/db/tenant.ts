import { tx, q } from '@/lib/db/client';
import { sousLocataire, sousDerogation, locataireDuContexte } from '@/lib/db/sans-locataire';

// POSER LE LOCATAIRE DANS LA TRANSACTION (docs/PLAN_RLS.md, étape 1).
//
// La production tourne derrière un pooler en mode TRANSACTION : un réglage de
// session (`set`, `set_config(…, false)`) peut repartir sur une autre connexion
// à la requête suivante — interdit à la source (ADR-115). Seul `set local`,
// DANS une transaction, est sûr : il vit et meurt avec elle. C'est aussi ce qui
// rend la sonde compatible (une transaction annulée emporte le réglage).
//
// CE QUE CE MODULE NE FAIT PAS : il n'arme rien. Sous le rôle actuel
// (`postgres`, BYPASSRLS), poser `otto.tenant_id` ne change RIEN à ce que la
// base rend — les politiques sont inertes. C'est l'étape 3 de PLAN_RLS, non
// exécutée, qui l'arme. Ce module et son test disent donc aujourd'hui une
// chose vérifiable : *quand* le rôle changera, l'isolation tiendra.

/** Le locataire courant, tel que la BASE le voit (null hors transaction posée). */
export async function locataireCourant(): Promise<string | null> {
  const r = await q<{ t: string | null }>(`select nullif(current_setting('otto.tenant_id', true), '') t`);
  return r[0]?.t ?? null;
}

/**
 * Conduire `fn` avec le locataire posé pour la durée de la transaction.
 * Toute requête faite dessous (`q`, `q1`, `tx`, `logEvent`…) la rejoint.
 */
export async function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  if (!tenantId) throw new Error('withTenant : un locataire vide n’est pas un locataire');
  /* DEUX POSES, PAS UNE. Dans la BASE (`set local`, pour les politiques) et
     dans le CONTEXTE ASYNCHRONE (pour le garde de `q()`) : la première décide
     de ce que la base rend, la seconde de ce que le code s'autorise à
     demander. Sans la seconde, un `q()` conduit ici lèverait LOC-01 alors que
     le locataire EST posé — le garde deviendrait un obstacle au lieu d'une
     règle. */
  return sousLocataire(tenantId, () => tx(async (run) => {
    await run(`select set_config('otto.tenant_id', $1, true)`, [tenantId]);
    return fn();
  }));
}

/** Le locataire tel que le CODE l'a posé (le contexte asynchrone), sans requête. */
export function locataireDuCode(): string | null {
  return locataireDuContexte();
}

/**
 * LA SONDE DÉCLARE SON LOCATAIRE, ET UNE LECTURE VIDE ÉCHOUE (décision du
 * fondateur, 2026-09-10, docs/MANDATS/2026-09-10_trois_reponses.md, point 2 —
 * en réponse à l'écart A.6 de PLAN_RLS.md) : « le sondage doit déclarer quel
 * locataire il lit, et une lecture vide doit ÉCHOUER plutôt que passer... il
 * doit être impossible pour la sonde de ne rien voir et de rendre vert. »
 *
 * Pose `tenantId` par `withTenant` (les DEUX poses : `set_config` dans la
 * base, contexte asynchrone pour le garde LOC-01), puis relit LA MÊME mission
 * SOUS ce locataire déclaré — SANS filtrer par `tenant_id` dans la requête :
 * c'est la politique RLS elle-même qui doit laisser passer la ligne, jamais
 * une clause `where` qui ferait le travail à sa place. Sous BYPASSRLS
 * (aujourd'hui, en production comme en local), la politique est inerte et la
 * ligne se voit toujours quel que soit le locataire déclaré ; ce que cette
 * fonction PROUVE dès aujourd'hui, c'est le round-trip de la déclaration
 * elle-même (`set_config` posé = `set_config` relu). Ce qu'elle PROUVERA le
 * jour de l'étape 3 (non exécutée), c'est que le locataire déclaré voit
 * réellement sa propre mission — et qu'un locataire qui n'en voit AUCUNE
 * échoue, au lieu de rendre une sonde aveugle qui se dit verte.
 *
 * OÙ ELLE CESSE DE REGARDER (règle 19) : elle ne change RIEN aux AUTRES
 * lectures de `/api/sante`, qui continuent de lire sous la dérogation nommée
 * « sante », sans locataire posé — les envelopper TOUTES dans une seule
 * transaction poserait un problème réel sur un vrai Postgres (une erreur DANS
 * une transaction l'avorte : les requêtes suivantes échoueraient en cascade,
 * sans rapport avec leur propre contenu, tant qu'aucun point de reprise ne
 * les protège) ; ce refactor plus large reste un chantier séparé, nommé ici
 * plutôt que fait à moitié en silence. Elle ne vérifie pas non plus que
 * `tenantId` est le BON cabinet au sens métier — c'est l'appelant qui le
 * fournit, cette fonction ne fait que le round-trip et la visibilité.
 *
 * CORRIGÉ APRÈS REVUE HOSTILE (voix 2, 2026-09-10) : `/api/sante` l'appelle
 * avec le locataire et l'objet CANONIQUES de la démonstration
 * (`IDS.tenant`/`IDS.engNep`, des identifiants FIXES), jamais avec un
 * locataire dérivé d'une découverte dynamique — sans quoi la découverte
 * elle-même, potentiellement aveugle, aurait pu sauter cette vérification
 * tout entière (voir le commentaire de `corpsDeLaSonde` dans route.ts).
 */
export async function verifierLocataireVisible(tenantId: string, engagementId: string): Promise<number> {
  return withTenant(tenantId, async () => {
    const vu = await locataireCourant();
    if (vu !== tenantId) {
      throw new Error(`SANTE-TENANT : le locataire posé (${tenantId}) ne se relit pas identique depuis `
        + `la base (lu : ${vu ?? 'aucun'}) — set_config n’a pas tenu`);
    }
    const r = await q<{ id: string }>(`select id::text id from engagement where id = $1`, [engagementId]);
    if (r.length === 0) {
      throw new Error(`SANTE-TENANT-VIDE : sous le locataire déclaré ${tenantId}, la mission ${engagementId} `
        + `n’est PLUS visible — sous un rôle sans BYPASSRLS, ce serait un cabinet aveugle à son propre `
        + `dossier ; la sonde échoue plutôt que de rendre vert sur un dossier qu’elle ne voit plus `
        + `(décision du fondateur, 2026-09-10, PLAN_RLS.md A.6).`);
    }
    return r.length;
  });
}

/**
 * LE PORTAIL CLIENT : LE JETON POSÉ POUR LA DURÉE DE LA TRANSACTION
 * (migration 0141 ; mandat du soir, étage 0.2).
 *
 * Le contact client n'appartient à AUCUN cabinet : aucune politique par
 * locataire ne peut rien pour lui. Son identité, c'est son jeton — comme le
 * cookie l'est pour l'auditeur. On le pose donc de la même façon (`set local`,
 * seul réglage sûr derrière un pooler de transaction), et les politiques
 * `*_portail` de 0141 s'en servent.
 *
 * On ouvre AUSSI la dérogation « portail-client » : sans elle, le garde LOC-01
 * refuserait une transaction sans locataire — or ici l'absence de locataire est
 * la règle, pas l'oubli.
 *
 * OÙ ELLE CESSE DE REGARDER : elle ne vérifie pas que le jeton existe (la base
 * s'en charge : sans contact actif, `otto_portal_contact()` rend NULL et les
 * politiques ne laissent rien passer) ; et elle ne borne pas ce que le code du
 * portail fait de ce qu'il lit — la liste blanche (docs/04 §9.7) reste tenue en
 * application.
 */
export async function withJeton<T>(token: string, fn: () => Promise<T>): Promise<T> {
  if (!token) throw new Error('withJeton : un jeton vide n’est pas un jeton');
  return sousDerogation('portail-client', () => tx(async (run) => {
    await run(`select set_config('otto.portal_token', $1, true)`, [token]);
    return fn();
  }));
}
