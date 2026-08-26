import { optionsCreation } from '@/lib/services/engagement';
import { creerAction } from './actions';

// LA CRÉATION DU DOSSIER, sur l'accueil — parce que c'est là qu'on arrive.
//
// Le formulaire ne porte aucune règle : l'isolation, le doublon, le référentiel
// obligatoire et la méthode en vigueur sont vérifiés par le service. L'écran
// se contente de proposer ce qui existe et d'afficher le refus.

export async function NouvelleMission({ tenantId, erreur }: { tenantId: string; erreur?: string }) {
  const { entites, exercices } = await optionsCreation(tenantId);
  return (
    <div className="panel">
      <details>
        <summary><strong>Créer un dossier</strong></summary>
        {erreur && (
          <p style={{ marginTop: 8 }}>
            <span className="badge amber">refusé</span> {erreur}
          </p>
        )}
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
              <option value="statutory_audit">audit légal</option>
              <option value="sox_component">composante SOX</option>
              <option value="integrated">intégré</option>
            </select>
            <select name="pack" defaultValue="nep-fr">
              <option value="nep-fr">NEP (France)</option>
              <option value="pcaob-sox">PCAOB / SOX</option>
            </select>
            <select name="language" defaultValue="fr">
              <option value="fr">français</option>
              <option value="en">anglais</option>
            </select>
          </p>
          <p className="row" style={{ gap: 8 }}>
            <input name="name" placeholder="nom du dossier (facultatif)" style={{ flex: 1, minWidth: 260 }} />
            <button className="btn">Créer</button>
          </p>
        </form>
        <p className="faint">
          Le dossier naît en <strong>setup</strong>, avec la méthode <strong>en vigueur</strong> de
          votre cabinet désignée : sans elle, il ne pourrait rien planifier et personne ne saurait
          pourquoi. La première étape est ensuite l’<strong>acceptation</strong> — aucun travail ne
          se planifie avant elle.
        </p>
      </details>
    </div>
  );
}
