import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q01 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import {
  catalogueParId, publierMethodologie, contenuDuDepot, designerMethodologie,
  catalogueDeLaMission, oublierMethodologies,
} from '@/lib/methodology/depot';

// INCIDENT DU 2026-09-07 (Lot 3, tranche 1) — cinq déploiements Vercel de
// suite en ERROR : « CATALOGUE INVALIDE : procédure X : champ « nature »
// manquant » pour les 56 procédures, dans deploy:reconstruire, sur la base
// de démonstration DÉJÀ SEMÉE. Cause RÉELLE (journal de build de
// dpl_DKFbMaPBVCPyqHfHVSH67p869ymD, mesurée, pas théorisée) : `nature` est
// devenu un champ REQUIS de methodology/schema.json, mais le contenu JSONB
// déjà publié dans firm_methodology (semé un jour ancien, avant ce champ) ne
// change jamais — `migrate()` rejoue les migrations SQL, jamais le contenu
// d'une méthodologie déjà publiée. `catalogueParId` REVALIDE au chargement,
// par conception (depot.ts) : la méthode publiée est devenue invalide sans
// qu'aucun code n'ait changé — l'ÉVOLUTION DU SCHÉMA seule suffit. Le premier
// appel qui charge le catalogue (ici, l'enrichissement du monde) fait tomber
// tout le build.
//
// Cas connu mauvais (règle 17) : on reproduit ICI, en base fraîche, l'état
// exact qu'un vieux semis produit — une méthodologie publiée dont le contenu
// n'a plus `nature` — et on prouve que (a) catalogueParId lève bien dessus,
// puis (b) la republication automatique ajoutée à deploy:reconstruire.ts (la
// même séquence d'appels, extraite ici pour être testable sans réseau : la
// garde dbKind()!=='pg' du script interdit de le lancer sous PGlite) répare
// et redésigne, sans jamais éditer la ligne périmée (règle 26, même principe
// que les migrations : « republier crée une ligne, jamais une édition »).

describe('incident 2026-09-07 : une méthode publiée périmée par évolution du schéma se répare au déploiement', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
  }, 120000);

  it('catalogueParId lève sur une méthode dont le contenu publié n’a plus `nature` (cas connu mauvais)', async () => {
    const depot = await contenuDuDepot();
    const perime = structuredClone(depot) as Record<string, unknown>;
    const proceduresFile = perime['procedures.json'] as { procedures: Array<Record<string, unknown>> };
    for (const p of proceduresFile.procedures) delete p.nature;

    await q(`update firm_methodology set content = $1::jsonb where id = $2`,
      [JSON.stringify(perime), IDS.methodology]);
    oublierMethodologies();

    await expect(catalogueParId(IDS.methodology)).rejects.toThrow(/CATALOGUE INVALIDE/);
    await expect(catalogueParId(IDS.methodology)).rejects.toThrow(/champ « nature » manquant/);
  });

  it('la séquence de réparation (celle de deploy:reconstruire.ts) republie et redésigne — puis le catalogue charge de nouveau', async () => {
    // Étape 1 : reproduire la péremption (indépendant du test précédent : chaque fichier vitest a sa propre base).
    const depot = await contenuDuDepot();
    const perime = structuredClone(depot) as Record<string, unknown>;
    const proceduresFile = perime['procedures.json'] as { procedures: Array<Record<string, unknown>> };
    for (const p of proceduresFile.procedures) delete p.nature;
    await q(`update firm_methodology set content = $1::jsonb where id = $2`,
      [JSON.stringify(perime), IDS.methodology]);
    oublierMethodologies();

    const avant = await q<{ methodology_id: string }>(
      `select methodology_id from engagement where tenant_id = $1`, [IDS.tenant],
    );
    expect(avant.every((e) => e.methodology_id === IDS.methodology)).toBe(true);

    // Étape 2 : LA MÊME séquence que deploy:reconstruire.ts — trouvée ici en
    // dur, pas importée, car le script vit derrière la garde dbKind()!=='pg'
    // et n'exporte pas sa boucle de réparation comme une fonction séparée ;
    // toute divergence entre les deux copies serait attrapée par CE test
    // cessant de reproduire l'incident réel.
    const lignes = await q<{ id: string; tenant_id: string; label: string }>(
      `select id, tenant_id, label from firm_methodology`,
    );
    let repare = 0;
    for (const ligne of lignes) {
      try {
        await catalogueParId(ligne.id);
      } catch {
        const auteur = await q01<{ id: string }>(
          `select id from app_user where tenant_id = $1 order by id limit 1`, [ligne.tenant_id],
        );
        expect(auteur).not.toBeNull();
        const fraiche = await publierMethodologie({
          tenantId: ligne.tenant_id,
          label: `${ligne.label} (republiée automatiquement — schéma évolué, test)`,
          contenu: await contenuDuDepot(),
          actorUserId: auteur!.id,
        });
        const engs = await q<{ id: string }>(
          `select id from engagement where methodology_id = $1`, [ligne.id],
        );
        for (const eng of engs) {
          await designerMethodologie({ engagementId: eng.id, methodologyId: fraiche.id, actorUserId: auteur!.id });
        }
        repare++;
      }
    }
    expect(repare).toBeGreaterThan(0);

    // Étape 3 : le catalogue charge de nouveau, pour la mission qui en dépend.
    const cat = await catalogueDeLaMission(IDS.engNep);
    expect(cat.procedures.find((p) => p.code === 'RAPPRO')?.nature).toBe('rapprochement');

    // Étape 4 : la mission a bien été REDÉSIGNÉE (nouvelle ligne), jamais
    // l'ancienne éditée en place — la ligne périmée existe TOUJOURS, telle quelle.
    const apres = await q01<{ methodology_id: string }>(
      `select methodology_id from engagement where id = $1`, [IDS.engNep],
    );
    expect(apres!.methodology_id).not.toBe(IDS.methodology);
    const ancienneTelleQuelle = await q01<{ content: { 'procedures.json': { procedures: Array<{ code: string; nature?: string }> } } }>(
      `select content from firm_methodology where id = $1`, [IDS.methodology],
    );
    expect(ancienneTelleQuelle!.content['procedures.json'].procedures.find((p) => p.code === 'RAPPRO')?.nature)
      .toBeUndefined();
  });
});
