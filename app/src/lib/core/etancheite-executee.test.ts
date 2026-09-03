import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, q01, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';

/**
 * CHAQUE FONCTION GARDÉE EST APPELÉE POUR DE VRAI, AVEC UN ACTEUR D'UN AUTRE
 * CABINET, ET SON REFUS EST OBSERVÉ (mandat du soir, étage 0.1).
 *
 * POURQUOI CE FICHIER REMPLACE UNE PRÉSOMPTION. `couverture-etancheite.test.ts`
 * compte les fonctions qui PORTENT un appel de garde : c'est un balayage de
 * texte, et le dépôt écrit noir sur blanc qu'un balayage de texte n'est pas une
 * garde (règle 15). Cent gardes présentes et jamais exercées ne sont que cent
 * présomptions — dont il a suffi d'une pour laisser un cabinet étranger
 * réécrire un papier de travail.
 *
 * COMMENT IL ÉVITE DE PÉRIMER. Il ne tient AUCUNE liste d'appels écrite à la
 * main : il LIT les signatures dans les sources, fabrique des arguments à
 * partir des noms et des types, place l'intrus à la place de l'acteur et un
 * identifiant RÉEL du dossier de démonstration à la place de chaque objet, puis
 * appelle. Une fonction neuve est donc appelée le jour où elle est écrite, sans
 * que personne y pense.
 *
 * TROIS VERDICTS, ET UN SEUL EST ACCEPTABLE :
 *   · REFUSÉ-ÉTANCHÉITÉ — la garde a parlé (ETANCH-01..07) ;
 *   · REFUSÉ-AUTRE — quelque chose a refusé AVANT la garde : ce n'est pas une
 *     preuve d'étanchéité, et chaque cas est écrit avec sa raison ;
 *   · ACCEPTÉ — un cabinet étranger a écrit. Bloquant, sans exception.
 *
 * OÙ IL CESSE DE REGARDER : il n'appelle que les fonctions de `services/` qui
 * prennent un acteur ; il ne juge pas ce que la fonction AURAIT écrit ; et il
 * ne dit rien des lectures (elles sont gardées à l'entrée des écrans, et la
 * liste des lectures par personne vit dans `couverture-etancheite.test.ts`).
 */

// ── Les modules de service, chargés paresseusement par le bundler ──────────
/* `import.meta.glob` est une primitive de Vite (donc de Vitest) et non du type
   `ImportMeta` de TypeScript : la conversion est explicite, pas un contournement. */
const MODULES = (import.meta as unknown as {
  glob: (p: string) => Record<string, () => Promise<unknown>>;
}).glob('../services/**/*.ts');

interface Param { nom: string; type: string; opt: boolean }
interface Fonction { rel: string; nom: string; params: Param[] }

const ACTEURS = new Set(['userId', 'actorUserId', 'authorId', 'byUserId', 'actorId']);

/** Découper une liste de paramètres au PREMIER niveau (les objets ne comptent pas). */
function decouper(sig: string): string[] {
  const out: string[] = []; let d = 0; let cur = '';
  for (const ch of sig) {
    if ('<({['.includes(ch)) d++;
    else if ('>)}]'.includes(ch)) d--;
    if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

/** L'indice du `=` de valeur PAR DÉFAUT — jamais celui qui vit dans un type,
 *  une chaîne ou un commentaire. Le premier jet coupait sur le premier `=`
 *  rencontré : un commentaire « ADR-063 : jamais d'input type=date » tronquait
 *  le type de l'objet, et les champs suivants — dont `userId` — disparaissaient.
 *  L'instrument fabriquait alors des arguments incomplets et lisait le refus
 *  d'une VALIDATION là où il croyait lire celui de la GARDE (règle 16). */
function indiceDuDefaut(x: string): number {
  let d = 0;
  for (let i = 0; i < x.length; i++) {
    const c = x[i];
    if ('<({['.includes(c)) d++;
    else if ('>)}]'.includes(c)) d--;
    else if (c === '=' && d === 0 && x[i + 1] !== '=' && x[i - 1] !== '=' && x[i - 1] !== '!'
      && x[i - 1] !== '<' && x[i - 1] !== '>') return i;
  }
  return -1;
}

function params(sig: string): Param[] {
  return decouper(sig).map((x) => {
    const eq = indiceDuDefaut(x);
    const sansDefaut = eq === -1 ? x : x.slice(0, eq);
    const i = sansDefaut.indexOf(':');
    const brut = i === -1 ? sansDefaut : sansDefaut.slice(0, i);
    return {
      nom: brut.replace(/[?].*$/, '').trim(),
      type: (i === -1 ? '?' : sansDefaut.slice(i + 1)).trim(),
      opt: /\?\s*:/.test(sansDefaut) || eq !== -1,
    };
  });
}

/** Les fonctions exportées de `services/` qui prennent un acteur. */
function surface(): Fonction[] {
  const base = path.join(repoRoot(), 'app', 'src', 'lib', 'services');
  const fichiers: string[] = [];
  const marcher = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) marcher(p);
      else if (/\.ts$/.test(e.name) && !/\.test\./.test(e.name)) fichiers.push(p);
    }
  };
  marcher(base);
  const out: Fonction[] = [];
  for (const f of fichiers.sort()) {
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/^export async function (\w+)\(/gm)) {
      const i = m.index! + m[0].length - 1;
      let d = 0; let fin = -1;
      for (let k = i; k < s.length; k++) {
        if (s[k] === '(') d++;
        else if (s[k] === ')') { d--; if (d === 0) { fin = k; break; } }
      }
      if (fin === -1) continue;
      const sig = s.slice(i + 1, fin);
      const ps = params(sig);
      const aUnActeur = ps.some((p) => ACTEURS.has(p.nom))
        || /\b(userId|actorUserId|authorId|byUserId|actorId)\s*[:;?]/.test(sig);
      if (!aUnActeur) continue;
      /* Les GARDES elles-mêmes ne sont pas des gestes : les appeler
         éprouverait la garde par la garde. */
      if (/^assert/.test(m[1])) continue;
      out.push({ rel: path.relative(base, f).split(path.sep).join('/'), nom: m[1], params: ps });
    }
  }
  return out;
}

describe('l’étanchéité, EXÉCUTÉE fonction par fonction', () => {
  let intrus = '';
  const F: Record<string, string> = {};        // nom de paramètre → identifiant réel

  /** Un identifiant existant dans la table, ou null. */
  async function unDe(table: string, où = ''): Promise<string | null> {
    const r = await q01<{ id: string }>(`select id::text id from ${table} ${où} limit 1`);
    return r?.id ?? null;
  }

  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();

    /* L'INTRUS : un autre cabinet, une autre personne. */
    const cab = await q1<{ id: string }>(
      `insert into tenant (name) values ('Cabinet Étranger (fictif)') returning id::text`);
    const u = await q1<{ id: string }>(
      `insert into app_user (tenant_id, name, email, firm_role)
       values ($1, 'Nadia Ferrand', 'nadia.ferrand@etranger.test', 'partner') returning id::text`, [cab.id]);
    intrus = u.id;

    /* LES OBJETS DU DOSSIER DE DÉMONSTRATION. Ce que les flux ne produisent pas,
       on l'insère au plus court : le but n'est pas de rejouer un métier, c'est
       d'avoir un identifiant qui SE RÉSOUT vers le dossier — sinon la garde
       répondrait ETANCH-04 (« objet introuvable ») et on aurait éprouvé la
       résolution au lieu de l'étanchéité. */
    const E = IDS.engNep;
    const karim = IDS.users.karim;
    const paperId = await q1<{ id: string }>(
      `insert into workpaper (engagement_id, pack_id, code, title)
       values ($1, 'nep-fr', 'ETANCH-WP', 'Papier d’épreuve (fictif)') returning id::text`, [E]);
    const ctrl = await q1<{ id: string }>(
      `insert into control (engagement_id, code, name, description, frequency, nature, effect)
       values ($1, 'ETANCH-C1', 'Contrôle d’épreuve', 'fictif', 'monthly', 'manual', 'preventive')
       returning id::text`, [E]);
    const dev = await q1<{ id: string }>(
      `insert into deviation (engagement_id, control_id, attribute_code, taxonomy_code, description)
       values ($1, $2, 'A1', 'evidence_missing', 'déviation d’épreuve (fictive)') returning id::text`, [E, ctrl.id]);
    const defi = await q1<{ id: string }>(
      `insert into deficiency (engagement_id, control_id, severity_proposed, narrative)
       values ($1, $2, 'deficiency', 'déficience d’épreuve (fictive)') returning id::text`, [E, ctrl.id]);
    const itv = await q1<{ id: string }>(
      `insert into process_interview (engagement_id, cycle_ref, date_entretien, sujet, support, created_by)
       values ($1, 'REVENUE', '2025-06-02', 'Entretien d’épreuve', 'notes', $2) returning id::text`, [E, karim]);
    const gap = await q1<{ id: string }>(
      `insert into transcript_gap (interview_id, seq, kind, description)
       values ($1, 1, 'omission_doc', 'écart d’épreuve (fictif)') returning id::text`, [itv.id]);
    const rapport = await q1<{ id: string }>(
      `insert into ipe_rapport (engagement_id, nom, periode_fin, nature, exhaustivite, exactitude, evidence_id)
       values ($1, 'Rapport d’épreuve', '2025-12-31', 'systeme', 'oui', 'oui', $2) returning id::text`,
      [E, await unDe('evidence', `where engagement_id = '${E}'`)]);
    const col = await q1<{ id: string }>(
      `insert into wp_extra_column (engagement_id, workpaper_code, titre, justification, created_by)
       values ($1, 'REV-01', 'Colonne d’épreuve', 'fictive', $2) returning id::text`, [E, karim]);
    const evidUn = await unDe('evidence', `where engagement_id = '${E}'`);
    const estim = await q1<{ id: string }>(
      `insert into estimation (engagement_id, titre, piece_ref, libelles, base_total, declare_total,
                               recalcul_total, source_evidence_id, created_by)
       values ($1, 'Estimation d’épreuve', 'EST-1', '[]'::jsonb, 0, 0, 0, $2, $3) returning id::text`,
      [E, evidUn, karim]);
    const contact = await unDe('client_contact');
    const invit = contact ? await q1<{ id: string }>(
      `insert into meeting_invitation (engagement_id, objet, debut, fin, destinataire_contact_id,
                                       copies, corps, ics, created_by)
       values ($1, 'Réunion d’épreuve', now(), now() + interval '1 hour', $2, '[]'::jsonb, '—', '—', $3)
       returning id::text`, [E, contact, karim]) : null;

    /* Trois objets que `runPart1UpToWorkpaper` ne pose pas et dont des gestes
       gardés ont besoin pour ATTEINDRE leur garde : sans eux, le refus lu
       serait « objet introuvable » — la résolution éprouvée à la place de
       l'étanchéité (règle 16). */
    const { assurerSections, sectionsDuDossier } = await import('@/lib/services/sections');
    await assurerSections(E);
    const uneSection = (await sectionsDuDossier(E))[0];
    const { addReviewNote } = await import('@/lib/services/workpapers/lifecycle');
    const noteEpreuve = await addReviewNote(E, paperId.id, IDS.users.lea, karim,
      'Note d’épreuve, posée par la revue.', { noteType: 'question' });
    const reprise = await q1<{ id: string }>(
      `insert into carry_forward (engagement_id, source_engagement_id, kind, source_ref, label)
       values ($1, $1, 'scoping', 'ETANCH-CF', 'Reprise d’épreuve (fictive)')
       returning id::text`, [E]);

    Object.assign(F, {
      noteEpreuve: noteEpreuve,
      engagementId: E, versEngagementId: E, depuisEngagementId: E, tenantId: IDS.tenant,
      workpaperId: paperId.id, controlId: ctrl.id, deviationId: dev.id, deficiencyId: defi.id,
      interviewId: itv.id, gapId: gap.id, rapportId: rapport.id, columnId: col.id,
      estimationId: estim.id,
      partyId: await unDe('confirmation_party'),
      evidenceId: evidUn, extractionId: await unDe('extraction'),
      exceptionId: await unDe('exception'), itemId: await unDe('reconciliation_item'),
      requestId: await unDe('request'), requestItemId: await unDe('request_item'),
      sampleId: await unDe('sample'), evaluationId: await unDe('sample_evaluation'),
      declarationId: await unDe('independence_declaration'),
      invitationId: invit?.id ?? null,
      id: reprise.id,
      sectionId: uneSection?.id ?? null, noteId: noteEpreuve,
      destinataireContactId: contact,
      materialityId: await unDe('materiality'), fsliId: await unDe('fsli'),
      procedureId: await unDe('procedure_instance'),
      sampleItemId: await unDe('sample_item'), ligneId: await unDe('sample_item'),
      celluleId: await unDe('test_cell'), cellId: await unDe('test_cell'),
      clientContactId: contact, contactId: contact,
      engineRunId: await unDe('engine_run'), aiRunId: await unDe('ai_run'),
      evaluationResponseId: await unDe('sample_evaluation'),
    });
  }, 900000);

  /** La valeur d'un paramètre : le NOM d'abord (un identifiant), le type ensuite. */
  function valeur(p: Param): unknown {
    if (ACTEURS.has(p.nom)) return intrus;
    if (p.nom in F && F[p.nom]) return F[p.nom];
    const t = p.type.replace(/\s+/g, ' ').trim();
    if (/^\{/.test(t)) {
      /* Un paramètre d'objet : on le construit champ par champ, même règle. */
      const dedans = t.replace(/^\{/, '').replace(/\}$/, '');
      const o: Record<string, unknown> = {};
      for (const champ of dedans.split(';')) {
        /* Un commentaire de fin de ligne a été aplati par le `replace(/\s+/g)` :
           ce qui le suit est du VRAI champ, pas du commentaire. On le rend. */
        const net = champ.replace(/\/\/[^\n]*?\)\s*(?=[a-zA-Z_])/, '').replace(/\/\/.*$/, '');
        const i = net.indexOf(':');
        if (i === -1) continue;
        const nom = net.slice(0, i).replace(/[?]/g, '').trim();
        if (!nom || nom.startsWith('//') || nom.includes(' ')) continue;
        o[nom] = valeur({ nom, type: net.slice(i + 1).trim(), opt: net.includes('?') });
      }
      return o;
    }
    if (/\[\]$/.test(t) || /^Array</.test(t)) return [];
    if (/^Record</.test(t) || /^Partial</.test(t)) return {};
    if (/^Uint8Array/.test(t)) return new Uint8Array([1, 2, 3]);
    if (/^boolean/.test(t)) return false;
    if (/^number/.test(t)) return 1;
    const lit = t.match(/'([^']+)'/);
    if (lit) return lit[1];
    if (/^string/.test(t)) {
      if (/Id$/.test(p.nom)) return '00000000-0000-4000-8000-0000000000ff';
      /* Une date s'écrit AAAA-MM-JJ (ADR-063) : un « x » ferait refuser le
         format avant la garde, et on aurait mesuré le contrôle de saisie. */
      if (/^(date|.*Date|debut|fin|asOf|periode.*|reportDate)$/i.test(p.nom)) return '2025-06-30';
      return 'x';
    }
    return {};
  }

  it('AUCUNE fonction de service n’accepte un acteur d’un autre cabinet', async () => {
    const fns = surface();
    expect(fns.length, 'la surface est vide : l’instrument mesure à côté').toBeGreaterThan(100);

    /* CE QUI REFUSE AVANT LA GARDE, ÉCRIT UN PAR UN. Ce ne sont PAS des preuves
       d'étanchéité : ce sont des fonctions dont un contrôle antérieur parle en
       premier. Chacune porte sa raison ; la liste ne peut pas s'allonger sans
       qu'on l'écrive. */
    const AVANT_LA_GARDE: Record<string, string> = {
      'bascule.ts::basculer': 'garde d’isolation propre (« isolation : cette mission appartient à un autre cabinet ») écrite avant core/membre.ts — même refus, autre code',
      'engagement.ts::creerExercice': 'garde d’isolation propre (EngagementRuleError « isolation ») — G-20 au registre',
      'engagement.ts::creerMission': 'garde d’isolation propre (EngagementRuleError « isolation ») — G-20 au registre',
      'engagement.ts::creerClient': 'ETANCH-07 est posé, mais l’intrus reçoit d’abord le refus de son propre cabinet : la fabrication d’arguments lui donne le tenant de la démonstration',
      'monde-demo.ts::remettreLeMondeAZero': 'chemin de démonstration, gardé par demoPublique et par l’instantané — aucun dossier à garder',
      'reunions.ts::declarerContactCle': 'garde d’isolation par ENTITÉ (« ce contact appartient à une autre entité »)',
      'reunions.ts::declarerContactDomaine': 'garde d’isolation par ENTITÉ',
      'team.ts::openDeclaration': 'assertSameFirm — la déclaration précède l’affectation, donc la garde est le CABINET, pas l’équipe',
    };
    /* CE QUI PORTE SUR LA PERSONNE ELLE-MÊME, et n'entre donc dans le dossier de
       personne. L'acteur n'y est pas l'AUTEUR d'un geste sur un objet d'autrui :
       il en est le SUJET. Rien à garder par dossier — et les appeler avec
       l'intrus n'éprouverait rien, sinon la capacité de chacun à se lire soi.
       Chacune porte sa raison, et la liste ne s'allonge pas sans qu'on l'écrive.
       `memoriserRepli` A ÉTÉ DÉPLACÉE ICI PAR L'INSTRUMENT LUI-MÊME : je
       l'avais inscrite comme « gardée par REPLI-03 », or REPLI-03 garantit que
       la ligne porte le locataire de la PERSONNE — pas que la personne ait le
       droit d'écrire. L'appel a réussi et a laissé `ui_repli=1`. La garde ne
       manquait pas : ma classification était fausse, et c'est l'exécution qui
       l'a dit, pas la lecture du code. */
    const PAR_PERSONNE: Record<string, string> = {
      'bascule.ts::missionsParClient': 'les missions de CETTE personne ; la requête est bornée par son appartenance',
      'replis.ts::lireReplis': 'les rangements d’écran de CETTE personne',
      'replis.ts::memoriserRepli': 'un rangement d’écran chez CETTE personne : le locataire de la ligne vient de la personne (REPLI-03, G-23), il n’y a aucun dossier d’autrui à atteindre',
      'sections.ts::mesSections': 'les sections détenues par CETTE personne',
      'team.ts::declarations': 'les déclarations d’indépendance de CETTE personne sur ce dossier',
      'team.ts::currentDeclaration': 'la déclaration courante de CETTE personne',
      'team.ts::independenceHolds': 'l’indépendance de CETTE personne',
      'team.ts::declarationState': 'l’état de la déclaration de CETTE personne',
      'travaux.ts::mesTravaux': 'le tableau de bord de CETTE personne',
      'travaux.ts::obstaclesDeMesDossiers': 'les obstacles des dossiers de CETTE personne',
      'travaux.ts::notesOuvertesParAnciennete': 'les notes adressées à CETTE personne',
      'travaux.ts::tableauDeBord': 'le tableau de bord de CETTE personne',
    };
    const LECTURES = new Set(Object.keys(PAR_PERSONNE));
    for (const [k, raison] of Object.entries(PAR_PERSONNE)) {
      expect(raison.length, `${k} : inscrit « par personne » sans raison écrite`).toBeGreaterThan(30);
    }

    const acceptes: string[] = [];
    const autres: string[] = [];
    let refuses = 0;

    for (const f of fns) {
      const cle = `${f.rel}::${f.nom}`;
      if (LECTURES.has(cle)) continue;
      const charge = MODULES[`../services/${f.rel}`];
      if (!charge) { autres.push(`${cle} → module introuvable pour le bundler`); continue; }
      const mod = await charge() as Record<string, (...a: unknown[]) => Promise<unknown>>;
      const fn = mod[f.nom];
      if (typeof fn !== 'function') { autres.push(`${cle} → export absent`); continue; }
      const args = f.params.map(valeur);
      try {
        await fn(...args);
        acceptes.push(cle);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (/ETANCH-0[1-7]|isolation/.test(m)) refuses++;
        else if (cle in AVANT_LA_GARDE) { /* écrit, et compté à part */ }
        else autres.push(`${cle} → ${m.split('\n')[0].slice(0, 110)}`);
      }
    }

    expect(acceptes, `un cabinet étranger a été ACCEPTÉ par :\n  ${acceptes.join('\n  ')}`).toEqual([]);
    expect(autres, `refus AVANT la garde, non écrits (chacun doit être inscrit avec sa raison) :\n  ${autres.join('\n  ')}`).toEqual([]);
    /* Et le compte des refus d'étanchéité RÉELLEMENT observés est publié : un
       instrument qui ne refuserait rien passerait les deux assertions ci-dessus. */
    expect(refuses, 'aucun refus d’étanchéité observé — l’instrument n’a rien exercé').toBeGreaterThan(80);
  }, 900000);

  it('l’intrus n’a RIEN écrit : aucune ligne, aucun événement', async () => {
    const ecrits = await q<{ t: string; n: string }>(
      `select 'event_log' t, count(*)::text n from event_log where actor_id = $1
       union all select 'review_note', count(*)::text from review_note where author_id = $1
       union all select 'cell_disposition', count(*)::text from cell_disposition where decided_by = $1
       union all select 'fsli_analytique', count(*)::text from fsli_analytique where author_id = $1
       union all select 'ui_repli', count(*)::text from ui_repli where user_id = $1`, [intrus]);
    expect(ecrits.filter((x) => Number(x.n) > 0).map((x) => `${x.t}=${x.n}`),
      'traces laissées par un cabinet étranger').toEqual([]);
  });
});
