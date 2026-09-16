import { q, q1 } from '@/lib/db/client';
import { obstaclesAuVisa, type Famille } from './obstacles';
import { travaux, type Achevement } from './completion';
import { jalons, type Jalon } from './acceptance';

/* Lot 7, H-4 tranche 1 (`docs/REGISTRE_IDEES.md` §H, ligne 272) : « le
 * reporting en trois périmètres d'audience — équipe, direction, comité ».
 * ÉQUIPE existe déjà (`/eng/[id]/page.tsx`, `travaux.ts::tableauDeBord`) ;
 * DIRECTION existe déjà (`/eng/[id]/dashboard`). Il manquait COMITÉ — la
 * communication à la gouvernance (« those charged with governance »).
 *
 * Explicitement HORS SCOPE (le registre le dit) : un tableau de bord qui
 * piloterait l'ENTITÉ elle-même — c'est du GRC, pas de l'audit. Cet écran ne
 * pilote rien : il AGRÈGE ce que le dossier sait déjà de lui-même.
 *
 * MÉCANIQUE, pas contenu (règle 9/14) : zéro nouvelle table, zéro LLM (règle
 * 6), zéro procédure nouvelle — une lecture pure sur des services et des
 * tables qui existent tous depuis avant cette tranche (`obstaclesAuVisa`,
 * `completion.ts`, `acceptance.ts::jalons`, `exception`, `deficiency`,
 * `workpaper`). R16 (backlog reporté) reste tenu : cet écran ne RÉDIGE
 * jamais la communication elle-même — `completion_item.nature='gouvernance'`
 * porte déjà ce geste humain (`conclure()`, `completion.ts`), ce module se
 * contente de le RELIRE à côté du reste.
 *
 * CE QUE CETTE FONCTION NE VÉRIFIE PAS (règle 19) : elle ne recalcule aucun
 * obstacle elle-même — `obstaclesAuVisa` reste la SEULE liste (règle citée
 * dans `obstacles.ts`) ; dupliquer son calcul ici créerait exactement la
 * divergence que ce fichier dénonce. Elle ne dit pas non plus si la
 * communication a été EFFECTIVEMENT envoyée hors du produit (un e-mail réel
 * est interdit, CLAUDE.md §2) — seulement si le travail `gouvernance` du
 * dossier est conclu, avec quel texte.
 */

export interface SyntheseComite {
  visaPossible: boolean;
  obstaclesTotal: number;
  parFamille: { famille: Famille; n: number }[];
  ecarts: { ouverts: number; total: number; escalades: number };
  deficiences: { severite: string; n: number }[];
  achevement: Achevement[];
  papiers: { signes: number; total: number };
  jalonsEnRetard: number;
  jalonProchain: Jalon | null;
}

export async function syntheseComite(engagementId: string): Promise<SyntheseComite> {
  const obstacles = await obstaclesAuVisa(engagementId);
  const parFamilleMap = new Map<Famille, number>();
  for (const o of obstacles) parFamilleMap.set(o.famille, (parFamilleMap.get(o.famille) ?? 0) + 1);

  const exc = await q1<{ total: string; open: string; escalated: string }>(
    `select count(*) total,
            count(*) filter (where status in ('open','clarification_requested','explained')) open,
            count(*) filter (where status = 'escalated') escalated
     from exception where engagement_id = $1`,
    [engagementId],
  );
  const defs = await q<{ severity: string; n: string }>(
    `select coalesce(severity_final, severity_proposed) severity, count(*) n
     from deficiency where engagement_id = $1 group by 1`,
    [engagementId],
  );
  const ach = await travaux(engagementId);
  const wps = await q1<{ signed: string; total: string }>(
    `select count(*) filter (where status = 'signed') signed, count(*) total
     from workpaper where engagement_id = $1 and status <> 'outdated'`,
    [engagementId],
  );
  const tousJalons = await jalons(engagementId);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const enRetard = tousJalons.filter((j) => j.due_date && !j.done_at && j.due_date < aujourdhui);
  const prochain = tousJalons
    .filter((j) => j.due_date && !j.done_at && j.due_date >= aujourdhui)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0] ?? null;

  return {
    visaPossible: obstacles.length === 0,
    obstaclesTotal: obstacles.length,
    parFamille: [...parFamilleMap.entries()].map(([famille, n]) => ({ famille, n })),
    ecarts: { ouverts: Number(exc.open), total: Number(exc.total), escalades: Number(exc.escalated) },
    deficiences: defs.map((d) => ({ severite: d.severity, n: Number(d.n) })),
    achevement: ach,
    papiers: { signes: Number(wps.signed), total: Number(wps.total) },
    jalonsEnRetard: enRetard.length,
    jalonProchain: prochain,
  };
}
