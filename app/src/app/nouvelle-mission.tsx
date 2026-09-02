import { optionsCreation, CLASSES, BENCHMARKS } from '@/lib/services/engagement';
import { creerAction } from './actions';
import { tr } from '@/lib/i18n';
import { BandeauRefus } from './bandeau-refus';

// LA CRÉATION DU DOSSIER, sur l'accueil — parce que c'est là qu'on arrive.
//
// EN UN ÉCRAN, EN MOINS DE DEUX MINUTES (Groupe 1, item 1.1) : le client —
// existant, ou neuf par son nom — l'exercice — existant, ou neuf par sa date
// de clôture au format français — la nature, la classe, le référentiel, la
// langue, le référentiel de seuil préféré, et le nom. Le formulaire ne porte
// aucune règle : l'isolation, le doublon, le chevauchement d'exercices, le
// référentiel obligatoire et la méthode en vigueur sont vérifiés par le
// service. L'écran se contente de proposer ce qui existe et d'afficher le
// refus. Le dossier neuf s'ouvre sur son acceptation, avec le rail entier et
// ses raisons de grisé.

export async function NouvelleMission({ tenantId, erreur }: { tenantId: string; erreur?: string }) {
  const { entites, exercices } = await optionsCreation(tenantId);
  const t = await tr();
  const fr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
  return (
    <div className="panel">
      {/* LE REFUS S'AFFICHE OÙ L'ON EST : un bandeau dans un repli FERMÉ est un
          refus que personne ne lit. Le repli s'ouvre avec le refus. */}
      <details open={Boolean(erreur)}>
        <summary><strong>{t('nouveau.titre')}</strong></summary>
        <BandeauRefus erreur={erreur} />
        <form action={creerAction} className="mt">
          <p className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <label className="faint">{t('nm.client')}</label>
            <select name="entity_id" required>
              {entites.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              <option value="__nouveau__">{t('nm.nouveauClient')}</option>
            </select>
            <input name="entity_name" placeholder={t('nm.nomDuClient')} style={{ minWidth: 220 }} />
            <input name="entity_currency" placeholder={t('nm.devise')} defaultValue="EUR" style={{ width: 70 }} />
          </p>
          <p className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <label className="faint">{t('nm.exercice')}</label>
            {/* LES EXERCICES SONT GROUPÉS PAR CLIENT : l'écran n'a pas de script
                pour filtrer la liste selon le client choisi ; le groupe rend
                lisible à qui appartient chaque exercice. La RÈGLE, elle, est
                dans l'action : un client neuf avec un exercice existant est
                refusé avant toute écriture. */}
            <select name="period_id" required>
              {entites.map((e) => {
                const siens = exercices.filter((p) => p.entity_id === e.id);
                return siens.length === 0 ? null : (
                  <optgroup key={e.id} label={e.name}>
                    {siens.map((p) => (
                      <option key={p.id} value={p.id}>{p.label} ({fr(p.start_date)} → {fr(p.end_date)})</option>
                    ))}
                  </optgroup>
                );
              })}
              <option value="__nouveau__">{t('nm.nouvelExercice')}</option>
            </select>
            <input name="period_end" placeholder={t('nm.clotureLe')} style={{ width: 170 }} />
          </p>
          <p className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <label className="faint">{t('nm.nature')}</label>
            <select name="kind" defaultValue="statutory_audit">
              <option value="statutory_audit">{t('nm.auditLegal')}</option>
              <option value="sox_component">{t('nm.composanteSox')}</option>
              <option value="integrated">{t('nm.integre')}</option>
            </select>
            <label className="faint">{t('nm.classe')}</label>
            <select name="classe" defaultValue="autre">
              {CLASSES.map((c) => <option key={c} value={c}>{t(`nm.classe.${c}`)}</option>)}
            </select>
            <label className="faint">{t('nm.referentiel')}</label>
            <select name="pack" defaultValue="nep-fr">
              <option value="nep-fr">{t('nm.packNep')}</option>
              <option value="pcaob-sox">{t('nm.packPcaob')}</option>
            </select>
            <label className="faint">{t('nm.langue')}</label>
            <select name="language" defaultValue="fr">
              <option value="fr">{t('nm.langueFr')}</option>
              <option value="en">{t('nm.langueEn')}</option>
            </select>
            <label className="faint">{t('nm.benchmark')}</label>
            <select name="benchmark" defaultValue="auto">
              {BENCHMARKS.map((b) => <option key={b} value={b}>{t(`nm.benchmark.${b}`)}</option>)}
            </select>
          </p>
          <p className="row" style={{ gap: 8 }}>
            <input name="name" placeholder={t('nouveau.nom')} style={{ flex: 1, minWidth: 260 }} />
            <button className="btn">{t('nm.creer')}</button>
          </p>
        </form>
      </details>
    </div>
  );
}
