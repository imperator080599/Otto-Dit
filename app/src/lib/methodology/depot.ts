// La méthode d'un cabinet : publication, désignation, chargement.
//
// LA PROMESSE QUE CE FICHIER REND VRAIE : « votre méthode reste la vôtre, vous
// la chargez, je ne la vois jamais. » Elle a deux moitiés, et jusqu'ici seule la
// première tenait. Le catalogue était lu depuis le dépôt : il était COMMUN.
//
// TROIS RÈGLES, ET ELLES SE TIENNENT.
//
//   1. RIEN N'ENTRE SANS ÊTRE VALIDÉ. `publierMethodologie` fait passer le
//      paquet par le MÊME validateur que le catalogue du dépôt — pas par un
//      second chemin, qui serait un chemin non testé. Un fichier invalide n'est
//      pas stocké : il est refusé avec la liste des erreurs en toutes lettres.
//
//   2. LES SCHÉMAS NE VIENNENT JAMAIS DU CABINET. Ils énumèrent ce que le
//      moteur sait CALCULER — prédicats implémentés, règles de date, sens de
//      test. Un cabinet qui livrerait son propre schéma désactiverait tous les
//      contrôles en une ligne. La fonction n'a aucun paramètre par lequel un
//      schéma pourrait arriver.
//
//   3. UNE MISSION SANS MÉTHODOLOGIE DÉSIGNÉE EST REFUSÉE, pas repliée sur
//      celle du dépôt. Un repli silencieux ferait tourner un dossier sur la
//      méthode de l'éditeur sans qu'aucun écran ne le dise. C'est le défaut que
//      ce produit passe son temps à interdire ; il ne va pas l'introduire ici.
//
// L'ISOLATION est dans la BASE : la clé étrangère de `engagement.methodology_id`
// est composite avec `tenant_id`. Désigner la méthode d'un autre cabinet est
// impossible, pas seulement déconseillé. La garde applicative ci-dessous existe
// pour le MESSAGE, pas pour la garantie.

import path from 'node:path';
import url from 'node:url';
import { q, q1, q01 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { hashObject } from '@/lib/core/hash';
import { racineDepot } from './catalogue';
import type { Catalogue } from './types';

export class MethodologyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MethodologyError';
  }
}

type Valideur = {
  assemblerCatalogue: (contenu: Record<string, unknown>, racineSchemas?: string) => Catalogue;
  contenuDuDepot: (racine?: string) => Record<string, unknown>;
  FICHIERS_CONTENU: string[];
};

let _valideur: Valideur | null = null;

async function valideur(): Promise<Valideur> {
  if (_valideur) return _valideur;
  const chemin = url.pathToFileURL(path.join(racineDepot(), 'methodology', 'valider.mjs')).href;
  _valideur = (await import(/* @vite-ignore */ chemin)) as Valideur;
  return _valideur;
}

/** Le contenu du dépôt, tel qu'un cabinet le fournirait. Sert au peuplement et aux tests. */
export async function contenuDuDepot(): Promise<Record<string, unknown>> {
  return (await valideur()).contenuDuDepot(racineDepot());
}

export interface MethodologyRow {
  id: string;
  tenant_id: string;
  label: string;
  content_hash: string;
  versions: Record<string, string>;
  published_by: string;
  published_at: string;
}

const COLONNES = `id, tenant_id, label, content_hash, versions, published_by, published_at::text`;

/* ── publier ────────────────────────────────────────────────────────────── */

/**
 * Valide un paquet de méthode et le publie pour un cabinet.
 *
 * Une méthode publiée ne se modifie JAMAIS : republier crée une ligne. Un
 * dossier doit pouvoir dire des années plus tard sous quelle méthode il a été
 * exécuté, et une ligne réécrite le rendrait incapable de le dire.
 */
export async function publierMethodologie(input: {
  tenantId: string;
  label: string;
  /** Le paquet des six fichiers de CONTENU. Pas de schéma : ils sont au produit. */
  contenu: Record<string, unknown>;
  actorUserId: string;
  /** Identifiant imposé — réservé au peuplement déterministe. */
  id?: string;
}): Promise<MethodologyRow> {
  const v = await valideur();

  const intrus = Object.keys(input.contenu).filter((f) => !v.FICHIERS_CONTENU.includes(f));
  if (intrus.length) {
    /* Presque toujours un schéma glissé dans le paquet. Refuser explicitement
       vaut mieux qu'ignorer en silence : celui qui l'a mis croit qu'il agit. */
    throw new MethodologyError(
      `méthode refusée : fichier(s) hors du paquet de contenu — ${intrus.join(', ')}. `
      + `Les schémas appartiennent au produit : ils énumèrent ce que le moteur sait calculer.`,
    );
  }

  // Le MÊME validateur que celui du dépôt. Lève si le paquet est invalide.
  const cat = v.assemblerCatalogue(input.contenu);

  const hash = hashObject(input.contenu);
  const versions = {
    procedures: cat.version,
    questionnaire: cat.questionnaire.version,
    independance: cat.independance.version,
    risque: cat.risque.version,
    assertions: cat.assertions.version,
  };

  const user = await q01<{ tenant_id: string }>(
    `select tenant_id from app_user where id = $1`, [input.actorUserId],
  );
  if (!user) throw new MethodologyError('personne inconnue');
  if (user.tenant_id !== input.tenantId) {
    throw new MethodologyError(
      'isolation : cette personne appartient à un autre cabinet — publication refusée',
    );
  }

  const row = await q1<MethodologyRow>(
    `insert into firm_methodology (id, tenant_id, label, content, content_hash, versions, published_by)
     values (coalesce($7::uuid, gen_random_uuid()), $1, $2, $3::jsonb, $4, $5::jsonb, $6)
     returning ${COLONNES}`,
    [input.tenantId, input.label, JSON.stringify(input.contenu), hash,
     JSON.stringify(versions), input.actorUserId, input.id ?? null],
  );

  await logEvent({
    tenantId: input.tenantId,
    engagementId: null,
    actorKind: 'user',
    actorId: input.actorUserId,
    verb: 'methodology.published',
    objectType: 'firm_methodology',
    objectId: row.id,
    payload: { label: input.label, contentHash: hash, versions },
  });

  return row;
}

/** Les méthodes d'un cabinet, la plus récente d'abord. */
export async function methodologies(tenantId: string): Promise<MethodologyRow[]> {
  return q<MethodologyRow>(
    `select ${COLONNES} from firm_methodology
     where tenant_id = $1 order by published_at desc, id desc`,
    [tenantId],
  );
}

/** La méthode courante d'un cabinet : la dernière publiée. Null s'il n'en a aucune. */
export async function methodologieCourante(tenantId: string): Promise<MethodologyRow | null> {
  return q01<MethodologyRow>(
    `select ${COLONNES} from firm_methodology
     where tenant_id = $1 order by published_at desc, id desc limit 1`,
    [tenantId],
  );
}

/* ── désigner ───────────────────────────────────────────────────────────── */

/**
 * Une mission désigne le catalogue sous lequel elle est exécutée.
 *
 * Elle ne prend pas « le dernier en date » à chaque lecture : une méthode
 * publiée en mars ne doit pas changer rétroactivement les travaux requis d'un
 * dossier planifié en janvier. La désignation est une DÉCISION, elle se trace.
 */
export async function designerMethodologie(input: {
  engagementId: string;
  methodologyId: string;
  actorUserId: string;
}): Promise<void> {
  const eng = await q01<{ id: string; tenant_id: string; status: string }>(
    `select id, tenant_id, status from engagement where id = $1`, [input.engagementId],
  );
  if (!eng) throw new MethodologyError('mission inconnue');

  const meth = await q01<MethodologyRow>(
    `select ${COLONNES} from firm_methodology where id = $1`, [input.methodologyId],
  );
  if (!meth) throw new MethodologyError('méthodologie inconnue');
  /* La base l'interdit déjà par clé étrangère composite. Cette garde existe
     pour DIRE pourquoi, plutôt que de laisser sortir une violation de
     contrainte que personne ne sait lire. */
  if (meth.tenant_id !== eng.tenant_id) {
    throw new MethodologyError(
      'isolation : cette méthodologie appartient à un autre cabinet que la mission — désignation refusée',
    );
  }

  await q(`update engagement set methodology_id = $1 where id = $2`,
    [input.methodologyId, input.engagementId]);

  await logEvent({
    tenantId: eng.tenant_id,
    engagementId: input.engagementId,
    actorKind: 'user',
    actorId: input.actorUserId,
    verb: 'methodology.designated',
    objectType: 'engagement',
    objectId: input.engagementId,
    payload: { methodologyId: meth.id, label: meth.label, contentHash: meth.content_hash },
  });
}

/* ── charger ────────────────────────────────────────────────────────────── */

/* Cache par méthodologie, pas par mission : deux missions du même cabinet sous
   la même méthode partagent le catalogue assemblé. La clé est l'identifiant de
   la LIGNE, qui ne change jamais — une méthode publiée est immuable, donc le
   cache ne peut pas devenir faux. */
const _cache = new Map<string, Catalogue>();

export function oublierMethodologies(): void { _cache.clear(); }

/**
 * Le catalogue d'une mission — celui de SON cabinet, dans la version qu'elle a
 * désignée.
 *
 * REFUSE si la mission n'en désigne aucune. Le repli sur le catalogue du dépôt
 * serait la faute : le dossier tournerait sur la méthode de l'éditeur et aucun
 * écran ne le dirait.
 */
export async function catalogueDeLaMission(engagementId: string): Promise<Catalogue> {
  const row = await q01<{ methodology_id: string | null; name: string }>(
    `select e.methodology_id, e.name from engagement e where e.id = $1`, [engagementId],
  );
  if (!row) throw new MethodologyError('mission inconnue');
  if (!row.methodology_id) {
    throw new MethodologyError(
      `la mission « ${row.name} » ne désigne aucune méthodologie : `
      + `aucun travail ne peut être planifié tant que le cabinet n'a pas chargé la sienne`,
    );
  }
  return catalogueParId(row.methodology_id);
}

/** Le catalogue d'une ligne de méthodologie, assemblé et validé. */
export async function catalogueParId(methodologyId: string): Promise<Catalogue> {
  const hit = _cache.get(methodologyId);
  if (hit) return hit;
  const row = await q01<{ content: Record<string, unknown> }>(
    `select content from firm_methodology where id = $1`, [methodologyId],
  );
  if (!row) throw new MethodologyError('méthodologie inconnue');
  /* Re-validé au CHARGEMENT, pas seulement à l'écriture. Le produit évolue :
     un prédicat retiré du moteur rendrait invalide une méthode publiée hier, et
     la lire sans revalider ferait tourner un facteur qui ne se calcule plus. */
  const v = await valideur();
  const cat = v.assemblerCatalogue(row.content);
  _cache.set(methodologyId, cat);
  return cat;
}
