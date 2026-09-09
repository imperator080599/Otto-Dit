import Link from 'next/link';
import { requireMember } from '@/lib/core/auth';
import { motDuPack } from '@/lib/packs';
import { frameworkSet } from '@/lib/services/fsli';
import { obstaclesAuVisa, type Famille } from '@/lib/services/obstacles';
import { assurerSections, sectionsDuDossier, ECHELLE, type Statut } from '@/lib/services/sections';
import { requestsEnAttente } from '@/lib/services/requests';
import { listDeviations } from '@/lib/services/sox';
import { tr, type CleLibelle } from '@/lib/i18n';
import { FAMILLES } from '../familles';

// LE SUIVI DE MISSION — le tableau de bord (mandat contrôle interne, §5,
// §7.4) : « avancement par poste, ce qui bloque le visa, l'âge des demandes
// en attente, les écarts non conclus. Tout compteur mène quelque part. »
//
// UNE VUE PURE. Rien de neuf en base (§5 : « rien de neuf tant qu'une vue
// suffit ») — les quatre panneaux lisent des services qui existaient déjà
// (`sectionsDuDossier`, `obstaclesAuVisa`, `listDeviations`) ou une lecture
// neuve mais sans table neuve (`requestsEnAttente`, `control_id` ajouté à
// `listDeviations`).
//
// PAS L'ÉCRAN `/eng/[id]` (assignations, « my work ») NI `/eng/[id]/dashboard`
// (traceur de demandes, dépense IA) : un troisième angle, celui du manager qui
// veut voir CE QUI RESTE avant le visa, en un écran, sans naviguer huit.
//
// PREMIER ÉCRAN DANS LE NOUVEAU LANGAGE (mandat du 2026-09-09, §5) : la classe
// `.epure` pose la source de jetons séparée de `:root` — les écrans EXISTANTS
// ne changent pas, la repasse rétroactive reste un lot séparé que le
// fondateur déclenche. Seul le CONTENU de cet écran porte `.epure` ; le rail
// et le bandeau restent partagés, donc inchangés.

export const dynamic = 'force-dynamic';

const cleStatut = (s: Statut) => `statut.${s}` as CleLibelle;

export default async function SuiviPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await tr();
  await requireMember(id);
  const fs = await frameworkSet(id);

  await assurerSections(id);
  const sections = await sectionsDuDossier(id);
  const postes = sections.filter((s) => s.kind === 'poste');
  const posteAcheve = (st: Statut) => st === 'completed' || st === 'reviewed';
  const posteAchevesN = postes.filter((p) => posteAcheve(p.statut)).length;
  const avancementPct = postes.length ? Math.round((posteAchevesN / postes.length) * 100) : 0;

  const obstacles = await obstaclesAuVisa(id);
  const parFamille = new Map<Famille, number>();
  for (const o of obstacles) parFamille.set(o.famille, (parFamille.get(o.famille) ?? 0) + 1);

  const demandes = await requestsEnAttente(id);
  const demandePlusAgee = demandes[demandes.length - 1];

  const deviations = (await listDeviations(id)).filter((d) => d.status !== 'resolved');

  return (
    <div className="epure">
      <h1 className="epure-titre">{t('suivi.titre')}</h1>
      <p className="epure-soustitre">{t('suivi.sousTitre')}</p>

      <div className="epure-grille">
        <a href="#suivi-postes" className="epure-carte" style={{ textDecoration: 'none' }}>
          <span className="epure-label">{t('suivi.avancement')}</span>
          <div className={`epure-chiffre ${avancementPct === 100 ? 'ok' : ''}`}>{avancementPct}%</div>
          <span className="epure-mono">{t('suivi.postesAcheves', { n: posteAchevesN, total: postes.length })}</span>
        </a>

        <Link href={`/eng/${id}/obstacles`} className="epure-carte" style={{ textDecoration: 'none' }}>
          <span className="epure-label">{motDuPack(fs.assurance_packs, 'obstacles')}</span>
          <div className={`epure-chiffre ${obstacles.length > 0 ? 'bloquant' : 'ok'}`}>{obstacles.length}</div>
          <span className="epure-mono">
            {obstacles.length === 0 ? t('suivi.rienNeBloque') : t('suivi.familles', { n: parFamille.size })}
          </span>
        </Link>

        <Link href={`/eng/${id}/requests`} className="epure-carte" style={{ textDecoration: 'none' }}>
          <span className="epure-label">{t('suivi.demandesEnAttente')}</span>
          <div className={`epure-chiffre ${demandes.length > 0 ? 'bloquant' : 'ok'}`}>{demandes.length}</div>
          <span className="epure-mono">
            {demandePlusAgee ? t('suivi.plusAgee', { n: demandePlusAgee.ageJours }) : t('suivi.aucune')}
          </span>
        </Link>

        <a href="#suivi-ecarts" className="epure-carte" style={{ textDecoration: 'none' }}>
          <span className="epure-label">{t('suivi.ecartsNonConclus')}</span>
          <div className={`epure-chiffre ${deviations.length > 0 ? 'bloquant' : 'ok'}`}>{deviations.length}</div>
          <span className="epure-mono">{deviations.length === 0 ? t('suivi.aucun') : t('suivi.aVoirPlusBas')}</span>
        </a>
      </div>

      <div id="suivi-postes" className="epure-carte">
        <h2 className="epure-titre" style={{ fontSize: 16, fontWeight: 600 }}>{t('suivi.avancementParPoste')}</h2>
        {postes.length === 0 ? (
          <p className="epure-liste-vide">{t('suivi.aucunPoste')}</p>
        ) : postes.map((p) => (
          <div key={p.id} className="epure-liste-item">
            <Link href={p.href}>{p.label}</Link>
            <span className={`epure-badge ${ECHELLE[p.statut].classe === 'blue' ? 'violet' : ECHELLE[p.statut].classe === 'green' ? 'vert' : ECHELLE[p.statut].classe === 'amber' ? 'ambre' : 'gris'}`}>
              {t(cleStatut(p.statut))}
            </span>
          </div>
        ))}
      </div>

      <div className="epure-carte">
        <h2 className="epure-titre" style={{ fontSize: 16, fontWeight: 600 }}>{motDuPack(fs.assurance_packs, 'obstacles')}</h2>
        {obstacles.length === 0 ? (
          <p className="epure-liste-vide">{t('suivi.rienNeBloque')}</p>
        ) : [...parFamille.entries()].map(([famille, n]) => (
          <div key={famille} className="epure-liste-item">
            <Link href={`/eng/${id}/${obstacles.find((o) => o.famille === famille)!.ou}`}>
              {t(FAMILLES[famille].titre)}
            </Link>
            <span className="epure-badge rouge">{n}</span>
          </div>
        ))}
      </div>

      <div className="epure-carte">
        <h2 className="epure-titre" style={{ fontSize: 16, fontWeight: 600 }}>{t('suivi.demandesEnAttente')}</h2>
        {demandes.length === 0 ? (
          <p className="epure-liste-vide">{t('suivi.aucuneDemandeEnAttente')}</p>
        ) : demandes.map((d) => (
          <div key={d.id} className="epure-liste-item">
            <Link href={`/eng/${id}/requests/${d.id}`}>
              <span className="epure-mono">R-{String(d.seqNo).padStart(3, '0')}</span> {d.title}
            </Link>
            <span className={`epure-badge ${d.ageJours > 14 ? 'rouge' : d.ageJours > 7 ? 'ambre' : 'gris'}`}>
              {t('suivi.jours', { n: d.ageJours })}
            </span>
          </div>
        ))}
      </div>

      <div id="suivi-ecarts" className="epure-carte">
        <h2 className="epure-titre" style={{ fontSize: 16, fontWeight: 600 }}>{t('suivi.ecartsNonConclus')}</h2>
        {deviations.length === 0 ? (
          <p className="epure-liste-vide">{t('suivi.aucunEcart')}</p>
        ) : deviations.map((d) => (
          <div key={d.id} className="epure-liste-item">
            <Link href={`/eng/${id}/rcm/${d.control_id}`}>
              <span className="epure-mono">{d.control_code}</span> {d.instance_label ?? d.attribute_code}
            </Link>
            <span className="epure-badge ambre">{d.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
