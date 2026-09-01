import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { motif, type Motif } from './motif';

// L'INFORMATION PRODUITE PAR L'ENTITÉ — IPE (revue utilisateur n°2 §3.1).
//
// LA QUESTION QU'UN CONTRÔLEUR POSE EN PREMIER. Un test substantif tiré d'un
// listing fourni par le client ne prouve rien tant que l'exhaustivité et
// l'exactitude de ce listing n'ont pas été éprouvées. C'est l'une des
// insuffisances les plus fréquemment relevées en inspection.
//
// TROIS RÈGLES, ET ELLES SONT DANS LA BASE AVANT D'ÊTRE À L'ÉCRAN :
//  1. Répondre « oui » sans documenter nature, exhaustivité, exactitude, date,
//     pertinence ET SANS DÉSIGNER LA PIÈCE est refusé (contrainte 0031).
//  2. La pièce désignée est LE MÊME OBJET que celle reçue au portail ou
//     importée — jamais une pièce jointe orpheline : sans cela, la provenance
//     s'arrête au bord du papier.
//  3. La rédaction peut être PROPOSÉE par le modèle ; elle n'entre au dossier
//     qu'après validation humaine (plafond L2). Une conclusion d'audit écrite
//     par une machine et versée sans relecture n'est pas une conclusion.

export interface Ipe {
  id: string;
  workpaperId: string;
  utilisee: boolean;
  nature: 'manuelle' | 'systeme' | null;
  rapportCode: string | null;
  evidenceId: string | null;
  importFileId: string | null;
  evidenceNom: string | null;
  exhaustivite: string | null;
  exactitude: string | null;
  dateDocument: string | null;
  approprie: boolean | null;
  redigeParIa: boolean;
  validePar: string | null;
  valideParNom: string | null;
  valideLe: string | null;
}

export async function lireIpe(workpaperId: string): Promise<Ipe | null> {
  return q01<Ipe>(
    `select i.id::text, i.workpaper_id::text "workpaperId", i.utilisee, i.nature,
            i.rapport_code "rapportCode", i.evidence_id::text "evidenceId",
            i.import_file_id::text "importFileId",
            coalesce(e.filename, f.filename) "evidenceNom", i.exhaustivite, i.exactitude,
            i.date_document::text "dateDocument", i.approprie,
            i.redige_par_ia "redigeParIa", i.valide_par::text "validePar",
            u.name "valideParNom", i.valide_le::text "valideLe"
     from ipe i
     left join evidence e on e.id = i.evidence_id
     left join import_file f on f.id = i.import_file_id
     left join app_user u on u.id = i.valide_par
     where i.workpaper_id = $1`, [workpaperId]);
}

/**
 * LES OBJETS DU DOSSIER qu'on peut désigner — ceux qui EXISTENT déjà, des deux
 * natures : une pièce REÇUE et un fichier IMPORTÉ. Rien d'autre : le but est
 * précisément d'interdire la pièce jointe orpheline.
 */
export async function piecesDisponibles(engagementId: string) {
  const pieces = await q<{ cle: string; filename: string; source: string }>(
    `select 'e:' || id::text cle, filename, source from evidence
     where engagement_id = $1 and quarantined = false
     order by created_at desc limit 40`, [engagementId]);
  const imports = await q<{ cle: string; filename: string; source: string }>(
    `select 'f:' || id::text cle, filename, kind source from import_file
     where engagement_id = $1 order by created_at desc limit 10`, [engagementId]);
  return [...imports, ...pieces];
}

/** « e:<uuid> » ou « f:<uuid> » → la colonne visée. */
export function decouperCle(cle: string | null | undefined): { evidenceId: string | null; importFileId: string | null } {
  if (!cle) return { evidenceId: null, importFileId: null };
  if (cle.startsWith('f:')) return { evidenceId: null, importFileId: cle.slice(2) };
  return { evidenceId: cle.startsWith('e:') ? cle.slice(2) : cle, importFileId: null };
}

export interface SaisieIpe {
  utilisee: boolean;
  nature?: 'manuelle' | 'systeme' | null;
  rapportCode?: string | null;
  evidenceId?: string | null;
  importFileId?: string | null;
  exhaustivite?: string | null;
  exactitude?: string | null;
  dateDocument?: string | null;
  approprie?: boolean | null;
  redigeParIa?: boolean;
}

export async function enregistrerIpe(
  workpaperId: string, s: SaisieIpe, userId: string,
): Promise<void> {
  const wp = await q1<{ engagement_id: string; tenant_id: string; code: string; status: string }>(
    `select w.engagement_id::text, e.tenant_id::text, w.code, w.status
     from workpaper w join engagement e on e.id = w.engagement_id where w.id = $1`,
    [workpaperId]);
  if (wp.status === 'signed') {
    throw new Error('Ce papier est visé : l’information produite par l’entité ne se modifie plus.');
  }

  if (s.utilisee) {
    const manque: string[] = [];
    if (!s.nature) manque.push('la nature (manuelle ou générée par le système)');
    if (!s.evidenceId && !s.importFileId) manque.push('le fichier client concerné');
    if (!s.exhaustivite?.trim()) manque.push('comment l’exhaustivité a été validée');
    if (!s.exactitude?.trim()) manque.push('comment l’exactitude a été validée');
    if (!s.dateDocument) manque.push('la date du document');
    if (s.approprie === null || s.approprie === undefined) manque.push('si le document est approprié au test');
    if (manque.length) {
      throw new Error(
        `Information produite par l’entité : répondre « oui » engage le dossier. Il manque ${manque.join(', ')}.`);
    }
    /* L'OBJET DOIT ÊTRE CELUI DU DOSSIER — pas un identifiant venu d'ailleurs. */
    const piece = s.evidenceId
      ? await q01<{ n: string }>(
        `select count(*) n from evidence
         where id = $1 and engagement_id = $2 and quarantined = false`,
        [s.evidenceId, wp.engagement_id])
      : await q01<{ n: string }>(
        `select count(*) n from import_file where id = $1 and engagement_id = $2`,
        [s.importFileId, wp.engagement_id]);
    if (Number(piece?.n ?? 0) === 0) {
      throw new Error('Le fichier désigné n’est pas une pièce de ce dossier : '
        + 'l’information produite par l’entité se rattache à la pièce reçue, jamais à une pièce jointe orpheline.');
    }
  }

  await q(
    `insert into ipe (workpaper_id, utilisee, nature, rapport_code, evidence_id, import_file_id,
                      exhaustivite, exactitude, date_document, approprie, redige_par_ia,
                      valide_par, valide_le)
     values ($1,$2,$3,$4,$5,$12,$6,$7,$8,$9,$10,$11, now())
     on conflict (workpaper_id) do update set
       utilisee = excluded.utilisee, nature = excluded.nature,
       rapport_code = excluded.rapport_code, evidence_id = excluded.evidence_id,
       import_file_id = excluded.import_file_id,
       exhaustivite = excluded.exhaustivite, exactitude = excluded.exactitude,
       date_document = excluded.date_document, approprie = excluded.approprie,
       redige_par_ia = excluded.redige_par_ia,
       valide_par = excluded.valide_par, valide_le = now()`,
    [workpaperId, s.utilisee, s.utilisee ? s.nature : null,
     s.utilisee ? (s.rapportCode ?? null) : null, s.utilisee ? s.evidenceId : null,
     s.utilisee ? s.exhaustivite : null, s.utilisee ? s.exactitude : null,
     s.utilisee ? s.dateDocument : null, s.utilisee ? s.approprie : null,
     s.redigeParIa ?? false, userId, s.utilisee ? (s.importFileId ?? null) : null]);

  await logEvent({
    tenantId: wp.tenant_id, engagementId: wp.engagement_id,
    actorKind: 'user', actorId: userId,
    verb: 'ipe.recorded', objectType: 'workpaper', objectId: workpaperId,
    payload: { utilisee: s.utilisee, nature: s.nature ?? null, redige_par_ia: s.redigeParIa ?? false },
  });
}

/**
 * CE QUI BLOQUE LE VISA. Un papier sans réponse à la question, c'est une
 * question qu'on n'a pas posée ; « oui » sans documentation est refusé par la
 * base, donc n'arrive pas ici. Ce contrôle porte donc sur l'ABSENCE de réponse.
 */
export async function obstaclesIpe(engagementId: string): Promise<{ code: string; motif: Motif; ou: string }[]> {
  const sans = await q<{ id: string; code: string; title: string }>(
    `select w.id::text, w.code, w.title from workpaper w
     where w.engagement_id = $1
       and w.status in ('draft','in_review','reviewed')
       and not exists (select 1 from ipe i where i.workpaper_id = w.id)`,
    [engagementId]);
  return sans.map((w) => ({
    code: `ipe:${w.code}`,
    motif: motif('obst.ipeQuestionNonPosee', { papier: w.code }),
    ou: `/eng/${engagementId}/workpapers/${w.id}`,
  }));
}

/**
 * LA RÉDACTION PROPOSÉE — déterministe ici, et c'est un choix.
 *
 * La revue demande « un wording généré par un agent IA ». Ce que le produit
 * peut faire honnêtement aujourd'hui : proposer la PHRASE À PARTIR DES FAITS
 * du dossier (nature de la source, pièce désignée, date), sans appeler un
 * modèle. Elle reste une PROPOSITION que l'humain corrige et valide (L2), et
 * l'écran le dit. Le jour où l'échelon vivant l'écrit, c'est la même case et
 * le même plafond — pas un autre chemin.
 */
export function proposerRedaction(o: {
  nature: 'manuelle' | 'systeme'; rapportCode?: string | null; nomFichier: string;
}): { exhaustivite: string; exactitude: string } {
  const src = o.nature === 'systeme'
    ? `l’état « ${o.nomFichier} »${o.rapportCode ? ` (rapport ${o.rapportCode})` : ''}`
    : `le fichier « ${o.nomFichier} », établi manuellement`;
  return {
    exhaustivite: `Exhaustivité de ${src} : le total et le nombre de lignes ont été rapprochés `
      + `du grand livre du poste sur la même période ; aucun écart de reprise n’a été relevé. `
      + `[à revoir et à compléter par le préparateur avant visa]`,
    exactitude: `Exactitude de ${src} : un sous-ensemble de lignes a été rapproché des pièces `
      + `d’origine (montant, date, tiers) ; les paramètres d’extraction ont été relevés. `
      + `[à revoir et à compléter par le préparateur avant visa]`,
  };
}
