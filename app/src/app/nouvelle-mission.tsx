import { optionsCreation } from '@/lib/services/engagement';
import { creerAction } from './actions';
import { tr } from '@/lib/i18n';
import { BandeauRefus } from './bandeau-refus';

// LA CRÉATION DU DOSSIER, sur l'accueil — parce que c'est là qu'on arrive.
//
// Le formulaire ne porte aucune règle : l'isolation, le doublon, le référentiel
// obligatoire et la méthode en vigueur sont vérifiés par le service. L'écran
// se contente de proposer ce qui existe et d'afficher le refus.

export async function NouvelleMission({ tenantId, erreur }: { tenantId: string; erreur?: string }) {
  const { entites, exercices } = await optionsCreation(tenantId);
  const t = await tr();
  return (
    <div className="panel">
      <details>
        <summary><strong>{t('nouveau.titre')}</strong></summary>
        <BandeauRefus erreur={erreur} />
        <form action={creerAction} className="mt">
          <p className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <select name="entity_id" required>
              {entites.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select name="period_id" required>
              {exercices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.start_date.slice(0, 10).split('-').reverse().join('/')} →{' '}
                  {p.end_date.slice(0, 10).split('-').reverse().join('/')})
                </option>
              ))}
            </select>
            <select name="kind" defaultValue="statutory_audit">
              <option value="statutory_audit">{t('nm.auditLegal')}</option>
              <option value="sox_component">{t('nm.composanteSox')}</option>
              <option value="integrated">{t('nm.integre')}</option>
            </select>
            <select name="pack" defaultValue="nep-fr">
              <option value="nep-fr">{t('nm.packNep')}</option>
              <option value="pcaob-sox">{t('nm.packPcaob')}</option>
            </select>
            <select name="language" defaultValue="fr">
              <option value="fr">{t('nm.langueFr')}</option>
              <option value="en">{t('nm.langueEn')}</option>
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
