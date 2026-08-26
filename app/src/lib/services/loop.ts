import { q, q01 } from '@/lib/db/client';

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
  libelle: string;
  /** Ce que cette étape fait, en une phrase relisible par un auditeur. */
  quoi: string;
  /** Éléments qui ont franchi l'étape. */
  franchi: number;
  /** Éléments arrêtés ici, en attente de quelque chose. */
  enAttente: number;
  /** Ce qu'on attend, nommément — jamais « en cours ». */
  attendQuoi: string;
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
  /** Ce qui empêche la boucle de se fermer, en toutes lettres. */
  obstacles: string[];
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
      obstacles: ['aucun échantillon tiré sur ce poste — la boucle n’a pas commencé'],
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
      code: 'selection', libelle: 'Sélection', versEtape: 'demande',
      quoi: 'Les éléments tirés de la population, par la méthode du cabinet.',
      franchi: selectionnes, enAttente: 0, attendQuoi: '',
    },
    {
      code: 'demande', libelle: 'Demande au client', versEtape: 'depot',
      quoi: 'Chaque élément sélectionné devient une ligne de demande, nommée.',
      franchi: demandes, enAttente: selectionnes - demandes,
      attendQuoi: 'éléments sélectionnés sans demande émise',
    },
    {
      code: 'depot', libelle: 'Réponse du client', versEtape: 'lecture',
      quoi: 'Le client dépose la pièce par le portail, ou répond à une demande d’explication. Une pièce qui n’a pas pu être obtenue sort d’ici par une limitation consignée, pas par l’oubli.',
      franchi: deposes, enAttente: demandes - deposes,
      attendQuoi: 'demandes émises restées sans réponse',
    },
    {
      code: 'lecture', libelle: 'Lecture de la pièce', versEtape: 'rapprochement',
      quoi: 'L’extraction relève les champs ; une date ambiguë est refusée, jamais devinée.',
      franchi: lus, enAttente: deposes - lus,
      attendQuoi: 'pièces déposées non encore lues',
    },
    {
      code: 'rapprochement', libelle: 'Rapprochement', versEtape: 'ecart',
      quoi: 'Les champs relevés sont confrontés à l’écriture : montant, date, tiers, référence.',
      franchi: rapproches, enAttente: lus - rapproches,
      attendQuoi: 'pièces lues non encore rapprochées',
    },
    {
      code: 'ecart', libelle: 'Écart', versEtape: 'clarification',
      quoi: 'Un contrôle qui échoue crée un écart nommé — il ne disparaît pas dans un taux.',
      franchi: ecarts, enAttente: 0,
      attendQuoi: '',
    },
    {
      code: 'clarification', libelle: 'Clarification', versEtape: 'resolution',
      quoi: 'L’écart REPART en demande : c’est ce qui fait de cette suite une boucle.',
      franchi: clarifies, enAttente: Math.max(0, ecartsOuverts - clarifies),
      attendQuoi: 'écarts ouverts sans demande de clarification',
    },
    {
      code: 'resolution', libelle: 'Résolution probante', versEtape: 'cumul',
      quoi: 'Un écart ne se clôt qu’avec explication, pièce liée et suite donnée.',
      franchi: resolus, enAttente: ecartsOuverts,
      attendQuoi: 'écarts non résolus',
    },
    {
      code: 'cumul', libelle: 'Cumul et évaluation', versEtape: null,
      quoi: 'Ce qui reste une anomalie entre dans l’état des anomalies et pèse sur la conclusion.',
      franchi: cumules, enAttente: 0, attendQuoi: '',
    },
  ];

  const bloquante = etapes.find((e) => e.enAttente > 0) ?? null;
  const obstacles = etapes
    .filter((e) => e.enAttente > 0)
    .map((e) => `${e.libelle} : ${e.enAttente} ${e.attendQuoi}`);

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
