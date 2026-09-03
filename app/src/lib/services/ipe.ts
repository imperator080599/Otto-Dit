import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { motif, type Motif } from './motif';
import { assertMembre, assertMembreDe } from '@/lib/core/membre';

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

/** LE RAPPORT (1.8) — l'objet partagé du dossier : nom, système, paramètres,
 *  période, généré par qui et quand, empreinte, nature, les deux éléments
 *  testés. Un papier le DÉSIGNE ; plusieurs papiers peuvent le partager. */
export interface Rapport {
  id: string;
  engagementId: string;
  nom: string;
  codeRapport: string | null;
  systemeSource: string | null;
  parametres: string | null;
  periodeDebut: string | null;
  periodeFin: string;
  generePar: string | null;
  genereLe: string | null;
  empreinte: string | null;
  nature: 'systeme' | 'systeme_modifie' | 'manuelle';
  evidenceId: string | null;
  importFileId: string | null;
  fichierNom: string | null;
  exhaustivite: string;
  exactitude: string;
  redigeParIa: boolean;
  validePar: string | null;
  valideParNom: string | null;
  valideLe: string | null;
  /** Combien de papiers du dossier le désignent. */
  papiers: number;
}

export interface Ipe {
  id: string;
  workpaperId: string;
  utilisee: boolean;
  /** Le rapport désigné (null tant que « oui » n'a pas été documenté, ou si « non »). */
  rapportId: string | null;
  rapportNom: string | null;
  periodeFin: string | null;
  systemeSource: string | null;
  empreinte: string | null;
  papiers: number;
  natureRapport: NatureRapport | null;
  parametres: string | null;
  generePar: string | null;
  genereLe: string | null;
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
  /* LA DOCUMENTATION VIT SUR LE RAPPORT (0036) : nature, pièce, exhaustivité,
     exactitude s'y lisent ; les colonnes du papier restent pour les lignes
     d'avant la migration — `coalesce`, rapport d'abord. */
  return q01<Ipe>(
    `select i.id::text, i.workpaper_id::text "workpaperId", i.utilisee,
            i.rapport_id::text "rapportId", r.nom "rapportNom", r.periode_fin::text "periodeFin",
            r.systeme_source "systemeSource", r.empreinte,
            (select count(*)::int from ipe i2 where i2.rapport_id = r.id) "papiers",
            case when coalesce(r.nature, i.nature) is null then null
                 when coalesce(r.nature, i.nature) = 'manuelle' then 'manuelle' else 'systeme' end nature,
            r.nature "natureRapport", r.parametres, r.genere_par "generePar", r.genere_le::text "genereLe",
            case when r.id is not null then r.code_rapport else i.rapport_code end "rapportCode",
            case when r.id is not null then r.evidence_id else i.evidence_id end::text "evidenceId",
            case when r.id is not null then r.import_file_id else i.import_file_id end::text "importFileId",
            case when r.id is not null then coalesce(re.filename, rf.filename) else coalesce(e.filename, f.filename) end "evidenceNom",
            case when r.id is not null then r.exhaustivite else i.exhaustivite end exhaustivite,
            case when r.id is not null then r.exactitude else i.exactitude end exactitude,
            i.date_document::text "dateDocument", i.approprie,
            coalesce(r.redige_par_ia, i.redige_par_ia) "redigeParIa", i.valide_par::text "validePar",
            u.name "valideParNom", i.valide_le::text "valideLe"
     from ipe i
     left join ipe_rapport r on r.id = i.rapport_id
     left join evidence re on re.id = r.evidence_id
     left join import_file rf on rf.id = r.import_file_id
     left join evidence e on e.id = i.evidence_id
     left join import_file f on f.id = i.import_file_id
     left join app_user u on u.id = i.valide_par
     where i.workpaper_id = $1`, [workpaperId]);
}

const COLONNES_RAPPORT = `
  r.id::text, r.engagement_id::text "engagementId", r.nom, r.code_rapport "codeRapport",
  r.systeme_source "systemeSource", r.parametres, r.periode_debut::text "periodeDebut",
  r.periode_fin::text "periodeFin", r.genere_par "generePar", r.genere_le::text "genereLe",
  r.empreinte, r.nature, r.evidence_id::text "evidenceId", r.import_file_id::text "importFileId",
  coalesce(e.filename, f.filename) "fichierNom", r.exhaustivite, r.exactitude,
  r.redige_par_ia "redigeParIa", r.valide_par::text "validePar", u.name "valideParNom",
  r.valide_le::text "valideLe",
  (select count(*)::int from ipe i where i.rapport_id = r.id) papiers`;
const DEPUIS_RAPPORT = `
  from ipe_rapport r
  left join evidence e on e.id = r.evidence_id
  left join import_file f on f.id = r.import_file_id
  left join app_user u on u.id = r.valide_par`;

/** Les rapports IPE du dossier, le plus récent arrêté d'abord. */
export async function rapportsDuDossier(engagementId: string): Promise<Rapport[]> {
  return q<Rapport>(`select ${COLONNES_RAPPORT} ${DEPUIS_RAPPORT} where r.engagement_id = $1 order by r.periode_fin desc, r.nom`, [engagementId]);
}

export async function lireRapport(rapportId: string): Promise<Rapport | null> {
  return q01<Rapport>(`select ${COLONNES_RAPPORT} ${DEPUIS_RAPPORT} where r.id = $1`, [rapportId]);
}

export type NatureRapport = 'systeme' | 'systeme_modifie' | 'manuelle';
export const NATURES_RAPPORT: readonly NatureRapport[] = ['systeme', 'systeme_modifie', 'manuelle'];

export interface SaisieRapport {
  nom: string;
  codeRapport?: string | null;
  systemeSource?: string | null;
  parametres?: string | null;
  periodeDebut?: string | null;
  periodeFin: string;
  generePar?: string | null;
  genereLe?: string | null;
  nature: NatureRapport;
  evidenceId?: string | null;
  importFileId?: string | null;
  exhaustivite: string;
  exactitude: string;
  redigeParIa?: boolean;
}

/**
 * CRÉER UN RAPPORT IPE. Un nom, une date d'arrêté, une nature, UNE pièce du
 * dossier, les deux éléments testés — rien de moins. L'empreinte est celle du
 * fichier désigné (un rapport désigne des octets, pas un nom) ; ce que
 * l'import a capturé (système source, identifiant, extraction) est repris si
 * la saisie ne le dit pas. Un nom déjà pris pour le même arrêté est REFUSÉ :
 * c'est le rapport existant qu'il faut désigner.
 */
/** Une date ISO qui EXISTE — « 2025-13-45 » passait l'expression et cassait
 *  en base, en anglais (revue hostile n°6). */
export function dateIso(s: string | null | undefined): boolean {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

async function refuserSiScelle(engagementId: string): Promise<void> {
  const e = await q01<{ status: string }>(`select status from engagement where id = $1`, [engagementId]);
  if (e && (e.status === 'locked' || e.status === 'archived')) {
    throw new Error('Ce dossier est scellé : l’information produite par l’entité ne s’y modifie plus.');
  }
}

export async function creerRapport(engagementId: string, s: SaisieRapport, userId: string): Promise<{
  id: string }> {
  await assertMembre(engagementId, userId, 'creerRapport');
  await refuserSiScelle(engagementId);
  const nom = (s.nom ?? '').trim();
  if (!nom) throw new Error('Un rapport IPE se nomme — le nom de l’état tel que le système le produit.');
  if (nom.length > 200) throw new Error('Un nom de rapport tient en deux cents caractères.');
  if (!dateIso(s.periodeFin)) throw new Error('Un rapport IPE porte sa date d’arrêté (AAAA-MM-JJ, une date qui existe) : c’est elle qui décide s’il peut servir à un papier.');
  if (!NATURES_RAPPORT.includes(s.nature)) throw new Error('La nature du rapport est : générée par le système, générée puis modifiée, ou manuelle.');
  if (!s.exhaustivite?.trim() || !s.exactitude?.trim()) {
    throw new Error('Un rapport IPE documente ses deux éléments testés : comment l’exhaustivité et l’exactitude ont été validées.');
  }
  if (Boolean(s.evidenceId) === Boolean(s.importFileId)) {
    throw new Error('Un rapport IPE désigne exactement UN fichier du dossier — une pièce reçue ou un fichier importé.');
  }
  const ctx = await q1<{ tenant_id: string }>(`select tenant_id::text from engagement where id = $1`, [engagementId]);
  /* LE MÊME OBJET que celui du dossier — et son empreinte. */
  const fichier = s.evidenceId
    ? await q01<{ sha256: string; systeme_source: string | null; nature_ipe: string | null; identifiant_rapport: string | null; extrait_le: string | null; extrait_par: string | null }>(
      `select sha256, null systeme_source, null nature_ipe, null identifiant_rapport, null extrait_le, null extrait_par
       from evidence where id = $1 and engagement_id = $2 and quarantined = false`, [s.evidenceId, engagementId])
    : await q01<{ sha256: string; systeme_source: string | null; nature_ipe: string | null; identifiant_rapport: string | null; extrait_le: string | null; extrait_par: string | null }>(
      `select sha256, systeme_source, nature_ipe, identifiant_rapport, extrait_le::text extrait_le, extrait_par
       from import_file where id = $1 and engagement_id = $2`, [s.importFileId, engagementId]);
  if (!fichier) {
    throw new Error('Le fichier désigné n’est pas une pièce de ce dossier : '
      + 'l’information produite par l’entité se rattache à la pièce reçue, jamais à une pièce jointe orpheline.');
  }
  const deja = await q01<{ id: string }>(
    `select id from ipe_rapport where engagement_id = $1 and nom = $2 and periode_fin = $3::date`, [engagementId, nom, s.periodeFin]);
  if (deja) throw new Error(`Le rapport « ${nom} » arrêté au ${s.periodeFin} existe déjà dans ce dossier — désignez-le au lieu de le recréer.`);
  const row = await q1<{ id: string }>(
    `insert into ipe_rapport (engagement_id, nom, code_rapport, systeme_source, parametres, periode_debut, periode_fin,
                             genere_par, genere_le, empreinte, nature, evidence_id, import_file_id,
                             exhaustivite, exactitude, redige_par_ia, valide_par, valide_le, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now(), $17) returning id::text`,
    [engagementId, nom, s.codeRapport?.trim() || fichier.identifiant_rapport || null,
     s.systemeSource?.trim() || fichier.systeme_source || null, s.parametres?.trim() || null,
     s.periodeDebut || null, s.periodeFin,
     s.generePar?.trim() || fichier.extrait_par || null, s.genereLe || fichier.extrait_le || null,
     fichier.sha256, s.nature, s.evidenceId ?? null, s.importFileId ?? null,
     s.exhaustivite.trim(), s.exactitude.trim(), s.redigeParIa ?? false, userId]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'ipe_rapport.created', objectType: 'ipe_rapport', objectId: row.id,
    payload: { nom, periodeFin: s.periodeFin, nature: s.nature, empreinte: fichier.sha256 },
  });
  return row;
}

/**
 * DÉSIGNER UN RAPPORT DEPUIS UN PAPIER — et le REFUS qui fait l'objet (1.8) :
 * un papier qui s'appuie sur un autre arrêté que celui du rapport ne peut pas
 * le réutiliser. Les deux dates sont dites côte à côte, et un nouveau test
 * IPE est ce qu'on propose — pas un rapport étiré sur une période qu'il ne
 * couvre pas.
 */
export async function utiliserRapport(
  workpaperId: string, rapportId: string, periodeAttendue: string, userId: string,
  approprie: boolean | null = true,
): Promise<void> {
  /* DEUX OBJETS : le papier ET le rapport IPE qu'on lui rattache. */
  const engPapier = await assertMembreDe('workpaper', workpaperId, userId, 'employer un rapport IPE dans un papier');
  const engRapport = await assertMembreDe('ipe_rapport', rapportId, userId, 'employer un rapport IPE dans un papier');
  if (engPapier !== engRapport) {
    throw new Error('ETANCH-06 : employer un rapport IPE dans un papier — le papier et le rapport ne sont pas du même dossier');
  }
  const wp = await q1<{ engagement_id: string; tenant_id: string; status: string }>(
    `select w.engagement_id::text, e.tenant_id::text, w.status
     from workpaper w join engagement e on e.id = w.engagement_id where w.id = $1`, [workpaperId]);
  if (wp.status === 'signed') throw new Error('Ce papier est visé : l’information produite par l’entité ne se modifie plus.');
  await refuserSiScelle(wp.engagement_id);
  const r = await lireRapport(rapportId);
  if (!r || r.engagementId !== wp.engagement_id) throw new Error('Ce rapport IPE n’est pas un rapport de ce dossier.');
  if (!dateIso(periodeAttendue)) {
    throw new Error('Dites sur quel arrêté ce papier s’appuie (AAAA-MM-JJ, une date qui existe) : c’est ce qui décide si le rapport peut servir.');
  }
  if (approprie === null || approprie === undefined) {
    throw new Error('Dites si ce rapport est approprié à CE test : c’est un fait du papier, pas du rapport.');
  }
  if (periodeAttendue !== r.periodeFin) {
    throw new Error(
      `Réutilisation refusée : le rapport « ${r.nom} » est arrêté au ${r.periodeFin}, ce papier s’appuie sur l’arrêté du ${periodeAttendue}. `
      + 'Un rapport ne couvre pas une autre période que la sienne — créez un nouveau test IPE sur l’état de cet arrêté.');
  }
  await q(
    `insert into ipe (workpaper_id, utilisee, rapport_id, date_document, approprie, redige_par_ia, valide_par, valide_le)
     values ($1, true, $2, $3, $4, $5, $6, now())
     on conflict (workpaper_id) do update set
       utilisee = true, rapport_id = excluded.rapport_id, date_document = excluded.date_document,
       approprie = excluded.approprie, redige_par_ia = excluded.redige_par_ia,
       nature = null, rapport_code = null, evidence_id = null, import_file_id = null,
       exhaustivite = null, exactitude = null,
       valide_par = excluded.valide_par, valide_le = now()`,
    [workpaperId, rapportId, periodeAttendue, approprie, r.redigeParIa, userId]);
  await logEvent({
    tenantId: wp.tenant_id, engagementId: wp.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'ipe.recorded', objectType: 'workpaper', objectId: workpaperId,
    payload: { utilisee: true, rapportId, periodeFin: r.periodeFin },
  });
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
  await assertMembreDe('workpaper', workpaperId, userId, 'déclarer l’IPE d’un papier');
  const wp = await q1<{ engagement_id: string; tenant_id: string; code: string; status: string }>(
    `select w.engagement_id::text, e.tenant_id::text, w.code, w.status
     from workpaper w join engagement e on e.id = w.engagement_id where w.id = $1`,
    [workpaperId]);
  if (wp.status === 'signed') {
    throw new Error('Ce papier est visé : l’information produite par l’entité ne se modifie plus.');
  }
  await refuserSiScelle(wp.engagement_id);

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

  if (s.utilisee) {
    /* « OUI » PASSE PAR LE RAPPORT (0036) : le rapport du même nom et du même
       arrêté est repris s'il existe, créé sinon, puis désigné par le papier —
       avec le refus de réutilisation qui va avec. */
    const nomFichier = s.evidenceId
      ? (await q1<{ filename: string }>(`select filename from evidence where id = $1`, [s.evidenceId])).filename
      : (await q1<{ filename: string }>(`select filename from import_file where id = $1`, [s.importFileId])).filename;
    const nom = s.rapportCode?.trim() || nomFichier;
    const existant = await q01<{ id: string; evidence_id: string | null; import_file_id: string | null; nature: string; exhaustivite: string; exactitude: string }>(
      `select id::text, evidence_id::text, import_file_id::text, nature, exhaustivite, exactitude
       from ipe_rapport where engagement_id = $1 and nom = $2 and periode_fin = $3::date`,
      [wp.engagement_id, nom, s.dateDocument]);
    if (existant) {
      /* LE MÊME RAPPORT, OU UN REFUS — jamais une reprise muette qui jetterait
         le fichier et les textes saisis (revue hostile n°6). */
      const meme = (existant.evidence_id ?? null) === (s.evidenceId ?? null)
        && (existant.import_file_id ?? null) === (s.importFileId ?? null)
        && existant.nature === (s.nature === 'systeme' ? 'systeme' : 'manuelle')
        && existant.exhaustivite === s.exhaustivite!.trim() && existant.exactitude === s.exactitude!.trim();
      if (!meme) {
        throw new Error(`Le rapport « ${nom} » arrêté au ${s.dateDocument} existe déjà dans ce dossier avec une autre documentation `
          + '(fichier, nature ou éléments testés) : désignez-le tel quel, ou nommez autrement le vôtre — rien ne s’écrase en silence.');
      }
    }
    const rapportId = existant?.id ?? (await creerRapport(wp.engagement_id, {
      nom, codeRapport: s.rapportCode ?? null, periodeFin: s.dateDocument!,
      nature: s.nature === 'systeme' ? 'systeme' : 'manuelle',
      evidenceId: s.evidenceId ?? null, importFileId: s.importFileId ?? null,
      exhaustivite: s.exhaustivite!, exactitude: s.exactitude!, redigeParIa: s.redigeParIa ?? false,
    }, userId)).id;
    await utiliserRapport(workpaperId, rapportId, s.dateDocument!, userId, s.approprie ?? null);
    return;
  }
  await q(
    `insert into ipe (workpaper_id, utilisee, rapport_id, nature, rapport_code, evidence_id, import_file_id,
                      exhaustivite, exactitude, date_document, approprie, redige_par_ia,
                      valide_par, valide_le)
     values ($1, false, null, null, null, null, null, null, null, null, null, $2, $3, now())
     on conflict (workpaper_id) do update set
       utilisee = false, rapport_id = null, nature = null, rapport_code = null, evidence_id = null,
       import_file_id = null, exhaustivite = null, exactitude = null, date_document = null,
       approprie = null, redige_par_ia = excluded.redige_par_ia,
       valide_par = excluded.valide_par, valide_le = now()`,
    [workpaperId, s.redigeParIa ?? false, userId]);

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
  nature: 'manuelle' | 'systeme' | 'systeme_modifie'; rapportCode?: string | null; nomFichier: string;
}): { exhaustivite: string; exactitude: string } {
  const src = o.nature === 'systeme'
    ? `l’état « ${o.nomFichier} »${o.rapportCode ? ` (rapport ${o.rapportCode})` : ''}`
    : o.nature === 'systeme_modifie'
      ? `l’état « ${o.nomFichier} »${o.rapportCode ? ` (rapport ${o.rapportCode})` : ''}, généré par le système puis MODIFIÉ à la main (les modifications se rapprochent à part)`
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
