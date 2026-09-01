import { q, q01 } from '@/lib/db/client';
import { motif, type Motif } from './motif';
import type { CleLibelle } from '@/lib/i18n/catalogue';

// LA BOUCLE, COMME OBJET (point 7).
//
// CE QUI EXISTAIT DÉJÀ : la demande, le portail, le dépôt, l'extraction, le
// vouching, l'écart, la demande de clarification, la résolution probante, le
// cumul. Chaque maillon, séparément, testé.
//
// CE QUI N'EXISTAIT PAS : la boucle. Personne ne pouvait la VOIR tourner, ni
// dire où elle était bloquée, ni combien de tours elle avait faits. Un produit
// dont la thèse est « la constatation circule » et qui ne montre pas la
// circulation demande qu'on le croie sur parole.
//
// LA BOUCLE EST UNE BOUCLE parce que l'écart REPART en demande : un écart
// génère une demande de clarification, qui génère un dépôt, qui relance le
// rapprochement. Ce n'est pas une file d'étapes, c'est un cycle — et c'est le
// nombre de TOURS qui le prouve.
//
// RIEN N'EST STOCKÉ ICI. Tout est dérivé de l'état réel : un compteur tenu à
// part diverge un jour de ce qu'il compte, et c'est toujours le compteur qu'on
// croit.

export type EtapeCode =
  | 'selection' | 'demande' | 'depot' | 'lecture'
  | 'rapprochement' | 'ecart' | 'clarification' | 'resolution' | 'cumul';

export interface Etape {
  code: EtapeCode;
  /* LE LIBELLÉ ET LA PHRASE SONT DES CLÉS, pas des mots (revue n°3) : la
     boucle est un écran, et un écran ne porte plus de littéral. */
  libelle: CleLibelle;
  /** Ce que cette étape fait, en une phrase relisible par un auditeur. */
  quoi: CleLibelle;
  /** Éléments qui ont franchi l'étape. */
  franchi: number;
  /** Éléments arrêtés ici, en attente de quelque chose. */
  enAttente: number;
  /** Ce qu'on attend, nommément — jamais « en cours ». */
  attendQuoi: CleLibelle | '';
  /** L'étape suivante à laquelle ceux qui sont franchis passent. */
  versEtape: EtapeCode | null;
}

export interface Boucle {
  fsliCode: string;
  etapes: Etape[];
  /** Le nombre de TOURS : combien de fois un écart a relancé une demande. */
  tours: number;
  /** L'étape qui bloque, s'il y en a une. */
  bloqueA: EtapeCode | null;
  /** Ce qui empêche la boucle de se fermer, en motifs catalogués. */
  obstacles: Motif[];
  /** La boucle est-elle fermée : tout sélectionné est conclu. */
  fermee: boolean;
}

const RIEN = { n: '0' };

async function compte(sql: string, params: unknown[]): Promise<number> {
  const r = await q01<{ n: string }>(sql, params);
  return Number((r ?? RIEN).n);
}

/**
 * SORTI DE LA FILE AUTREMENT QUE PAR UN DOCUMENT.
 *
 * Deux manières, et elles valent pour TOUTES les étapes qui suivent le dépôt :
 *   · une demande d'EXPLICATION à laquelle le client a répondu — il n'y a
 *     aucun document à lire ni à rapprocher, et en attendre un la laisserait
 *     éternellement ouverte ;
 *   · une LIMITATION DE PÉRIMÈTRE consignée avec ses procédures alternatives —
 *     la pièce n'a pas pu être obtenue, c'est documenté, l'élément est CONCLU.
 *
 * Ne pas l'appliquer aux étapes suivantes déplaçait simplement le blocage d'un
 * cran : le dépôt se débouchait, la lecture se bouchait. Un élément qui a
 * quitté la file l'a quittée pour de bon.
 */
const SORTI_AUTREMENT = `(
  (ri.kind = 'explanation' and btrim(coalesce(ri.client_note, '')) <> '')
  or exists (select 1 from exception x
             where x.sample_item_id = si.id and x.status = 'scope_limitation')
)`;

/**
 * L'état de la boucle sur un poste.
 *
 * Chaque compte est une requête sur l'état réel. Les étapes sont ordonnées, et
 * `enAttente` d'une étape est le nombre d'éléments qui l'ont atteinte sans la
 * franchir — c'est ce chiffre-là qui dit où ça coince, pas un pourcentage
 * d'avancement.
 */
export async function boucle(engagementId: string, fsliCode: string): Promise<Boucle> {
  /* L'ÉCHANTILLON DU POSTE, et le lien passe par la PROCÉDURE.
     La première version joignait `fsli` sur son code sans que rien ne
     contraigne l'échantillon : la jointure était décorative, et chaque poste du
     périmètre recevait l'échantillon du chiffre d'affaires. Seize postes
     affichaient donc la boucle d'un seul, et bloquaient la clôture pour des
     travaux qui n'existaient pas chez eux. Une jointure qui ne joint rien est
     pire qu'une jointure absente : elle a l'air d'être là. */
  const ech = await q01<{ id: string }>(
    `select s.id from sample s
     join procedure_instance pi on pi.id = s.procedure_id
     where s.engagement_id = $1 and s.status = 'drawn' and pi.fsli_code = $2
     order by s.created_at desc limit 1`,
    [engagementId, fsliCode],
  );
  if (!ech) {
    return {
      fsliCode, tours: 0, bloqueA: 'selection', fermee: false,
      obstacles: [motif('loop.aucunEchantillon')],
      etapes: etapesVides(),
    };
  }
  const sid = ech.id;

  const selectionnes = await compte(`select count(*) n from sample_item where sample_id = $1`, [sid]);
  const demandes = await compte(
    `select count(distinct si.id) n from sample_item si
     join request_item ri on ri.sample_item_id = si.id
     where si.sample_id = $1`, [sid]);
  /* « LE CLIENT A RÉPONDU » — et répondre ne veut pas dire déposer un fichier.
     Trois manières de sortir de cette file, et les trois comptent :
       · une PIÈCE déposée ;
       · une EXPLICATION donnée, quand la demande en appelait une (une demande
         d'explication n'attend aucun document, et l'attendre quand même la
         laisserait éternellement ouverte) ;
       · une LIMITATION DE PÉRIMÈTRE consignée, avec ses procédures
         alternatives — la pièce n'a pas pu être obtenue, c'est documenté, et
         l'élément est CONCLU, pas en attente.
     Ne compter que les pièces ferait dire à la boucle qu'un travail reste à
     faire alors qu'il est fait et documenté — et le dossier ne pourrait jamais
     se clore. */
  const deposes = await compte(
    `select count(distinct si.id) n from sample_item si
     join request_item ri on ri.sample_item_id = si.id
     where si.sample_id = $1
       and (
         exists (select 1 from evidence e
                 where e.request_item_id = ri.id and e.quarantined = false)
         or ${SORTI_AUTREMENT}
       )`, [sid]);
  const lus = await compte(
    `select count(distinct si.id) n from sample_item si
     join request_item ri on ri.sample_item_id = si.id
     where si.sample_id = $1
       and (
         exists (select 1 from evidence e
                 join extraction ex on ex.evidence_id = e.id
                 where e.request_item_id = ri.id and e.quarantined = false)
         or ${SORTI_AUTREMENT}
       )`, [sid]);
  const rapproches = await compte(
    `select count(distinct si.id) n from sample_item si
     left join match m on m.sample_item_id = si.id
     left join request_item ri on ri.sample_item_id = si.id
     where si.sample_id = $1
       and (m.status in ('matched', 'exception') or ${SORTI_AUTREMENT})`, [sid]);
  const conformes = await compte(
    `select count(*) n from match m join sample_item si on si.id = m.sample_item_id
     where si.sample_id = $1 and m.status = 'matched'`, [sid]);

  const ecarts = await compte(
    `select count(*) n from exception x join sample_item si on si.id = x.sample_item_id
     where si.sample_id = $1`, [sid]);
  const ecartsOuverts = await compte(
    `select count(*) n from exception x join sample_item si on si.id = x.sample_item_id
     where si.sample_id = $1 and x.status in ('open', 'clarification_requested')`, [sid]);
  const clarifies = await compte(
    `select count(distinct x.id) n from exception x
     join sample_item si on si.id = x.sample_item_id
     join request_item ri on ri.exception_id = x.id
     where si.sample_id = $1`, [sid]);
  const resolus = await compte(
    `select count(*) n from exception x join sample_item si on si.id = x.sample_item_id
     where si.sample_id = $1 and x.status in ('resolved', 'explained', 'escalated')`, [sid]);
  const cumules = await compte(
    `select count(*) n from misstatement where engagement_id = $1`, [engagementId]);

  /* LES TOURS. Une demande dont un élément porte un `exception_id` est une
     demande NÉE d'un écart : c'est la boucle qui repart. Le compter est ce qui
     distingue un cycle d'une file. */
  const tours = await compte(
    `select count(distinct ri.request_id) n from request_item ri
     join exception x on x.id = ri.exception_id
     where x.engagement_id = $1 and ri.exception_id is not null`,
    [engagementId],
  );

  const etapes: Etape[] = [
    {
      code: 'selection', libelle: 'loop.etape.selection', versEtape: 'demande',
      quoi: 'loop.quoi.selection',
      franchi: selectionnes, enAttente: 0, attendQuoi: '',
    },
    {
      code: 'demande', libelle: 'loop.etape.demande', versEtape: 'depot',
      quoi: 'loop.quoi.demande',
      franchi: demandes, enAttente: selectionnes - demandes,
      attendQuoi: 'loop.attend.demande',
    },
    {
      code: 'depot', libelle: 'loop.etape.depot', versEtape: 'lecture',
      quoi: 'loop.quoi.depot',
      franchi: deposes, enAttente: demandes - deposes,
      attendQuoi: 'loop.attend.depot',
    },
    {
      code: 'lecture', libelle: 'loop.etape.lecture', versEtape: 'rapprochement',
      quoi: 'loop.quoi.lecture',
      franchi: lus, enAttente: deposes - lus,
      attendQuoi: 'loop.attend.lecture',
    },
    {
      code: 'rapprochement', libelle: 'loop.etape.rapprochement', versEtape: 'ecart',
      quoi: 'loop.quoi.rapprochement',
      franchi: rapproches, enAttente: lus - rapproches,
      attendQuoi: 'loop.attend.rapprochement',
    },
    {
      code: 'ecart', libelle: 'loop.etape.ecart', versEtape: 'clarification',
      quoi: 'loop.quoi.ecart',
      franchi: ecarts, enAttente: 0,
      attendQuoi: '',
    },
    {
      code: 'clarification', libelle: 'loop.etape.clarification', versEtape: 'resolution',
      quoi: 'loop.quoi.clarification',
      franchi: clarifies, enAttente: Math.max(0, ecartsOuverts - clarifies),
      attendQuoi: 'loop.attend.clarification',
    },
    {
      code: 'resolution', libelle: 'loop.etape.resolution', versEtape: 'cumul',
      quoi: 'loop.quoi.resolution',
      franchi: resolus, enAttente: ecartsOuverts,
      attendQuoi: 'loop.attend.resolution',
    },
    {
      code: 'cumul', libelle: 'loop.etape.cumul', versEtape: null,
      quoi: 'loop.quoi.cumul',
      franchi: cumules, enAttente: 0, attendQuoi: '',
    },
  ];

  const bloquante = etapes.find((e) => e.enAttente > 0) ?? null;
  const obstacles = etapes
    .filter((e) => e.enAttente > 0)
    .map((e) => motif('loop.etapeEnAttente', { etape: { cle: e.libelle }, n: e.enAttente, quoi: e.attendQuoi ? { cle: e.attendQuoi } : '' }));

  /* La boucle est fermée quand tout ce qui a été sélectionné est conclu :
     rapproché sans écart, ou avec un écart résolu. Un élément qui n'est ni
     l'un ni l'autre laisse la boucle ouverte, même si les compteurs ont l'air
     pleins. */
  const fermee = selectionnes > 0 && conformes + resolus >= selectionnes && ecartsOuverts === 0;

  return { fsliCode, etapes, tours, bloqueA: bloquante?.code ?? null, obstacles, fermee };
}

function etapesVides(): Etape[] {
  return [];
}

/**
 * Les tours de la boucle, en clair : quelles demandes sont nées d'un écart, et
 * de quel écart.
 *
 * C'est la preuve visible que la boucle tourne. Sans elle, « la constatation
 * circule » reste une phrase.
 */
export async function tours(engagementId: string) {
  return q<{
    request_id: string; seq_no: number; title: string; request_status: string;
    exception_id: string; taxonomy_code: string; exception_status: string;
    description: string; created_at: string;
  }>(
    `select r.id as request_id, r.seq_no, r.title, r.status as request_status,
            x.id as exception_id, x.taxonomy_code, x.status as exception_status,
            x.description, ri.created_at::text as created_at
     from request_item ri
     join request r on r.id = ri.request_id
     join exception x on x.id = ri.exception_id
     where x.engagement_id = $1
     order by ri.created_at`,
    [engagementId],
  );
}
