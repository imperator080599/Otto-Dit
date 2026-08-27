import fs from 'node:fs';
import path from 'node:path';
import { q, q01 } from '../../src/lib/db/client';

// LA LISTE DES ROUTES SE DÉCOUVRE, ELLE NE S'ÉCRIT PAS.
//
// Une liste tenue à la main oublie un jour une route, et l'oubli est SILENCIEUX :
// le balayage passe au vert en ne regardant pas l'écran cassé. C'est exactement
// le défaut qui a laissé /risk et /team rendre 500 pendant plusieurs tranches
// (ADR-076). On lit donc l'arborescence de src/app, et toute route neuve est
// couverte le jour où elle est écrite, sans que personne y pense.

export interface Route {
  /** Le motif tel qu'il est sur le disque : /eng/[id]/risk */
  pattern: string;
  /** L'URL réelle, paramètres résolus depuis la base semée. */
  url: string;
  /** Une page rendue, ou une route d'API (le contrôle diffère). */
  kind: 'page' | 'api';
  /** Ce qu'il faut être pour y accéder. */
  as: 'auditor' | 'anonymous';
  /**
   * Le statut ATTENDU, quand ce n'est pas 200 — et pourquoi c'est un champ
   * plutôt qu'une exception cachée dans le balayage.
   *
   * Le téléchargement du dossier scellé répond 404 tant qu'aucun dossier n'est
   * scellé, et c'est le bon comportement. Deux mauvaises façons de traiter ça :
   * sauter la route (un écran non vérifié), ou ignorer les 404 (on perdrait
   * tous les vrais). On DÉCLARE donc l'attente, elle s'affiche dans le rapport,
   * et un 200 inattendu échouerait tout autant qu'un 404 inattendu.
   */
  attendu?: number;
  /** Pourquoi ce statut est attendu. Une attente sans raison est une excuse. */
  pourquoi?: string;
}

/** Tous les motifs de route, lus depuis src/app. */
export function motifs(racineApp = path.join(process.cwd(), 'src', 'app')): { pattern: string; kind: 'page' | 'api' }[] {
  const out: { pattern: string; kind: 'page' | 'api' }[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        // (groupes) et @slots ne font pas de segment d'URL
        const seg = /^\(.*\)$/.test(e.name) ? '' : `/${e.name}`;
        walk(p, prefix + seg);
      } else if (e.name === 'page.tsx' || e.name === 'page.ts') {
        out.push({ pattern: prefix || '/', kind: 'page' });
      } else if (e.name === 'route.ts' || e.name === 'route.tsx') {
        out.push({ pattern: prefix || '/', kind: 'api' });
      }
    }
  };
  walk(racineApp, '');
  return out.sort((a, b) => a.pattern.localeCompare(b.pattern));
}

/**
 * Les valeurs réelles des paramètres dynamiques, lues dans la base SEMÉE.
 *
 * Un balayage sur une base vide prouve peu : une page qui ne rend rien parce
 * qu'il n'y a pas de données n'est pas une page qui rend. On résout donc chaque
 * paramètre sur le dossier de démonstration, déroulé de bout en bout.
 */
export async function parametres(): Promise<Record<string, string>> {
  const un = async (sql: string, def = '') =>
    (await q01<{ v: string }>(sql))?.v ?? def;

  /* LE CHOIX DE LA MISSION EST DÉTERMINISTE, ET IL A ÉTÉ CORRIGÉ.
     Un `limit 1` sans ordre suffisait tant qu'il n'y avait qu'un audit légal.
     Le jour où le dossier N-1 est arrivé, il a parfois été choisi — un dossier
     de planification, sans demande ni papier — et six routes sont devenues
     « non résolues ». On prend donc la mission la plus RICHE : celle qui porte
     des papiers, puis la plus récente. Balayer un dossier vide ne prouve rien. */
  const engId = await un(
    `select e.id::text v from engagement e
     join period p on p.id = e.period_id
     where e.kind = 'statutory_audit'
     order by (select count(*) from workpaper w where w.engagement_id = e.id) desc,
              p.end_date desc, e.id
     limit 1`);
  const soxId = await un(`select id::text v from engagement where kind = 'sox_component' order by id limit 1`);
  return {
    // /eng/[id]/… — le dossier NEP, celui qui porte le cycle complet
    id: engId,
    // /eng/[id]/rcm/[cid] — un contrôle du dossier SOX
    cid: await un(`select id::text v from control order by code limit 1`),
    // /eng/[id]/requests/[rid]
    rid: await un(`select id::text v from request where engagement_id = '${engId}' order by seq_no limit 1`),
    // /eng/[id]/workpapers/[wid]
    wid: await un(`select id::text v from workpaper where engagement_id = '${engId}' order by code limit 1`),
    // /portal/[token]
    token: await un(`select portal_token v from client_contact where active limit 1`),
    // /api/blob/[evidenceId]
    evidenceId: await un(`select id::text v from evidence where engagement_id = '${engId}' order by id limit 1`),
    // /api/export-file/[exportId]
    exportId: await un(`select id::text v from export_record order by id limit 1`),
    // /api/tracker/[engId]
    engId,
    // /api/archive/[engagementId] — le dossier scellé se télécharge
    engagementId: engId,
    // le dossier SOX, pour les routes qui ne valent que là
    sox: soxId,
  };
}

/** L'utilisateur auditeur du cabinet, pour le cookie de session. */
export async function auditeur(): Promise<string> {
  const r = await q01<{ id: string }>(`select id::text id from app_user where firm_role = 'partner' limit 1`);
  if (!r) throw new Error('aucun associé en base : la base n’est pas semée');
  return r.id;
}

/**
 * Les routes à ouvrir, paramètres résolus.
 *
 * Une route dont un paramètre ne se résout pas n'est PAS ignorée en silence :
 * elle est rendue avec un `url` vide, et le balayage la signale comme non
 * couverte. Sauter ce qu'on ne sait pas construire est la même faute que la
 * liste écrite à la main.
 */
export async function routes(): Promise<{ pretes: Route[]; nonResolues: string[] }> {
  const vals = await parametres();
  const pretes: Route[] = [];
  const nonResolues: string[] = [];
  for (const { pattern, kind } of motifs()) {
    const manquants: string[] = [];
    const url = pattern.replace(/\[(\.\.\.)?([^\]]+)\]/g, (_m, _spread, nom: string) => {
      const v = vals[nom];
      if (!v) manquants.push(nom);
      return v ?? `__${nom}__`;
    });
    if (manquants.length) { nonResolues.push(`${pattern} (paramètre non résolu : ${manquants.join(', ')})`); continue; }
    /* LE DOSSIER SCELLÉ RÉPOND 404 TANT QU'IL N'Y EN A PAS — et c'est juste.
       On DÉCLARE l'attente au lieu de sauter la route ou d'ignorer les 404 :
       le rapport la montre, et un 200 inattendu échouerait tout autant. */
    const archiveVide = pattern === '/api/archive/[engagementId]' && !(await aUnDossierScelle(vals.id));
    pretes.push({
      pattern, url, kind,
      // Le portail client est une surface ANONYME : l'ouvrir avec le cookie
      // auditeur ne prouverait pas qu'un client peut s'en servir.
      as: pattern.startsWith('/portal') ? 'anonymous' : 'auditor',
      ...(archiveVide
        ? { attendu: 404, pourquoi: 'aucun dossier scellé dans le monde de démonstration' }
        : {}),
    });
  }
  // Le second dossier vaut d'être ouvert aussi : le pack SOX allume des écrans
  // que le pack NEP n'allume pas, et l'inverse.
  const sox = vals.sox;
  if (sox) {
    for (const r of [...pretes]) {
      if (r.pattern.startsWith('/eng/[id]') && !r.pattern.includes('[', 10)) {
        pretes.push({ ...r, url: r.url.replace(vals.id, sox), pattern: r.pattern + ' (SOX)' });
      }
    }
  }
  return { pretes, nonResolues };
}

/** Ce dossier porte-t-il une archive scellée ? */
async function aUnDossierScelle(engagementId: string): Promise<boolean> {
  const r = await q01<{ n: string }>(
    `select count(*) n from file_archive where engagement_id = $1`, [engagementId]);
  return Number(r?.n ?? 0) > 0;
}

/** Utilitaire : la liste des tables citées ci-dessus existe-t-elle ? */
export async function baseSemee(): Promise<boolean> {
  const r = await q<{ n: string }>(`select count(*) n from engagement`);
  return Number(r[0].n) > 0;
}
