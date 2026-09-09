import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { listExceptions, draftClarificationRequest } from '@/lib/services/matching';
import { now, DAY_MS } from '@/lib/core/clock';
import { executer } from '@/app/refus';
import { BandeauRefus } from '@/app/bandeau-refus';
import { tr, type CleLibelle } from '@/lib/i18n';

// LE KANBAN DES ÉCARTS (mandat contrôle interne, §5, §7.4, seconde moitié) —
// « Le kanban ne possède aucun objet. Colonnes dérivées des états réels du
// travail ; déplacer une carte exécute le geste métier correspondant, jamais
// un changement d'étiquette décoratif. » L'objet choisi : `exception`
// (matching.ts) — c'est le seul dont le cycle de vie porte PLUSIEURS gestes
// RÉELS déjà câblés (draftClarificationRequest, resolveException,
// escalateToMisstatement, tous sur /exceptions), contrairement à
// `section_state.statut` (DÉRIVÉ, jamais posé — en faire un kanban aurait
// été exactement le décor que le mandat interdit) ou `deviation` (un seul
// geste réel câblé). Recherche complète dans STATUS.md.
//
// AUCUN GLISSER-DÉPOSER. Ce dépôt n'en a nulle part ailleurs, et deux des
// gestes réels (résoudre, escalader) exigent une donnée probante — une
// explication, une corroboration NEP 500 — qu'aucun glissement ne peut
// porter honnêtement. « Déplacer une carte » est donc un LIEN, pas un geste
// de souris : chaque carte porte les liens vers ses gestes réels suivants,
// et le lien MÈNE au formulaire déjà construit et déjà éprouvé sur
// `/exceptions` (ancre `#x-<id>`, posée là-bas) — AUCUN formulaire n'est
// dupliqué ici. Le seul geste exécuté DEPUIS ce tableau est celui qui ne
// prend aucune donnée par carte : `draftClarificationRequest` est un geste
// DE LOT (« rédige la demande pour tous les écarts ouverts »), jamais un
// geste par carte — le représenter comme un glissement individuel aurait
// menti sur sa vraie forme, dans l'autre sens (une fausse granularité).
//
// CE QUI N'EST PAS UNE COLONNE : `scope_limitation` (0009_probative_gates,
// `recordScopeLimitation` dans matching.ts) est un état RÉEL du même champ,
// mais AUCUN écran ne l'appelle encore — un geste sans chemin humain
// (SEMEUR_VS_CHEMIN). L'ouvrir ici aurait été une colonne vide en
// permanence : le décor exact que le mandat du semeur nomme. Enregistré au
// registre (R71, docs/BACKLOG_REPORTE.md) plutôt que masqué en silence — et
// la lecture /api/sante de cette tranche compte CES cartes à part pour ne
// jamais les perdre d'une somme totale.

export const dynamic = 'force-dynamic';

const COLONNES = ['open', 'clarification_requested', 'explained', 'resolved', 'escalated'] as const;
type Colonne = (typeof COLONNES)[number];

const CLE_COLONNE: Record<Colonne, CleLibelle> = {
  open: 'kanban.colOuvert', clarification_requested: 'kanban.colClarification',
  explained: 'kanban.colExplique', resolved: 'kanban.colResolu', escalated: 'kanban.colEscalade',
};
const CLASSE_COLONNE: Record<Colonne, string> = {
  open: 'rouge', clarification_requested: 'ambre', explained: 'violet', resolved: 'vert', escalated: 'ambre',
};

export default async function KanbanPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { id } = await params;
  const t = await tr();
  const { erreur } = await searchParams;
  await requireMember(id);
  const exceptions = await listExceptions(id);
  const t0 = await now();

  const parColonne = new Map<Colonne, typeof exceptions>();
  for (const c of COLONNES) parColonne.set(c, []);
  for (const x of exceptions) {
    if ((COLONNES as readonly string[]).includes(x.status)) {
      parColonne.get(x.status as Colonne)!.push(x);
    }
  }
  const ouverts = parColonne.get('open')!;

  async function draftAction() {
    'use server';
    return executer(`/eng/${id}/kanban`, async () => {
      const { user } = await requireMember(id);
      const rid = await draftClarificationRequest(id, user.id);
      const { redirect } = await import('next/navigation');
      redirect(`/eng/${id}/requests/${rid}`);
    });
  }

  return (
    <div className="epure">
      <BandeauRefus erreur={erreur} />
      <h1 className="epure-titre">{t('kanban.titre')}</h1>
      <p className="epure-soustitre">{t('kanban.sousTitre')}</p>

      <div className="epure-grille" style={{ alignItems: 'start' }}>
        {COLONNES.map((col) => {
          const cartes = parColonne.get(col)!;
          return (
            <div key={col} className="epure-carte" data-colonne={col}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="epure-label">{t(CLE_COLONNE[col])}</span>
                <span className={`epure-badge ${CLASSE_COLONNE[col]}`}>{cartes.length}</span>
              </div>
              {col === 'open' && ouverts.length > 0 && (
                <form action={draftAction} style={{ margin: '8px 0' }}>
                  <button className="btn small secondary">{t('kanban.redigerEnLot', { n: ouverts.length })}</button>
                </form>
              )}
              {cartes.length === 0 ? (
                <p className="epure-liste-vide">{t('kanban.aucune')}</p>
              ) : cartes.map((x) => (
                <div key={x.id} className="epure-liste-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }} data-carte={x.id}>
                  <span className="epure-mono">{x.taxonomy_code}</span>
                  <span>{x.description.slice(0, 90)}{x.description.length > 90 ? '…' : ''}</span>
                  {col === 'clarification_requested' && (
                    <span className="faint">{t('kanban.enAttenteDepuis', { n: Math.floor((t0.getTime() - new Date(x.created_at).getTime()) / DAY_MS) })}</span>
                  )}
                  {(col === 'open' || col === 'explained') && (
                    <Link href={`/eng/${id}/exceptions#x-${x.id}`}>{t('kanban.resoudreOuEscalader')}</Link>
                  )}
                  {(col === 'resolved' || col === 'escalated') && x.resolution && (
                    <span className="faint">↳ {x.resolution.slice(0, 70)}</span>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
