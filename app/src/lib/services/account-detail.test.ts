import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import {
  importerDetailDeCompte, rapprocherDetailDeCompte, detailsDeCompteDuDossier, attenduGlPourPoste,
} from './account-detail';

// PLAN D'AUTONOMIE, PARTIE B, ÉTAPE 2 — LE RAPPROCHEMENT. Le détail que le
// client fournit se rapproche du grand livre AU CENTIME (même mécanique que
// balances-aux.ts, ADR-107) ; un écart non nul EXIGE une explication écrite
// (POP-02) avant que le rapprochement ne se conclue.

const octets = (s: string) => new TextEncoder().encode(s);

describe('détail du compte — le rapprochement (plan d’autonomie, étape 2)', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
  }, 180000);

  it('un détail dont le total FAIT le solde se rapproche sans écart, sans explication requise', async () => {
    const attendu = await attenduGlPourPoste(IDS.engNep, 'REVENUE');
    // Une seule ligne, montant EXACT (mesuré, pas deviné) — le cas simple.
    const csv = `référence;libellé;montant\nCLIENT-001;Ligne unique reconstituant le solde;${(attendu / 100).toFixed(2)}`;
    const importId = await importerDetailDeCompte({
      engagementId: IDS.engNep, fsliCode: 'REVENUE', filename: 'detail.csv', contenu: octets(csv), userId: IDS.users.karim,
    });
    const [detail] = await detailsDeCompteDuDossier(IDS.engNep, 'REVENUE');
    expect(detail.id).toBe(importId);
    expect(detail.totalCents).toBe(attendu);
    expect(detail.glAttenduCents).toBe(attendu);
    expect(detail.ecartCents).toBe(0);
    expect(detail.rapprochee).toBe(false); // le rapprochement est un geste séparé, pas automatique
    await rapprocherDetailDeCompte(importId, IDS.users.lea); // aucune explication passée : l'écart est nul
    const [apres] = await detailsDeCompteDuDossier(IDS.engNep, 'REVENUE');
    expect(apres.rapprochee).toBe(true);
    expect(apres.ecartExplication).toBeNull(); // jamais '' (revue hostile : le formulaire web passe '', pas undefined)

    /* CAS CONNU MAUVAIS (règle 17), POP-03 : un rapprochement déjà conclu ne
       se réécrit pas — même en substance (aucun écart cette fois), même
       identiquement à la circularisation et au reste du dépôt. */
    await expect(rapprocherDetailDeCompte(importId, IDS.users.karim, 'Une autre personne tente de reconclure.'))
      .rejects.toThrow(/POP-03.*déjà conclu/);
  });

  /* CAS CONNU MAUVAIS (règle 17) : POP-02. Un écart non nul sans
     explication, « RAS », ou toute autre non-explication DÉGÉNÉRÉE (« - »,
     « n/a » — ce que la revue hostile du 2026-09-06 a trouvé : la première
     version ne bloquait QUE le mot « RAS » littéral, malgré un commentaire
     prétendant reprendre « même refus, mêmes mots » que la circularisation,
     dont la vraie règle est un PLANCHER de longueur, pas une liste de mots)
     doivent tous être refusés — seule une vraie phrase referme le
     rapprochement. */
  it('POP-02 : un écart non nul sans explication SUBSTANTIELLE est refusé (pas seulement « RAS »)', async () => {
    const attendu = await attenduGlPourPoste(IDS.engNep, 'REVENUE');
    const faux = (attendu + 12_345) / 100; // décalé exprès d'un montant non nul
    const csv = `référence;libellé;montant\nCLIENT-002;Ligne volontairement décalée;${faux.toFixed(2)}`;
    const importId = await importerDetailDeCompte({
      engagementId: IDS.engNep, fsliCode: 'REVENUE', filename: 'detail-ecart.csv', contenu: octets(csv), userId: IDS.users.karim,
    });
    const [detail] = await detailsDeCompteDuDossier(IDS.engNep, 'REVENUE');
    expect(detail.ecartCents).toBe(12_345);
    for (const degenere of [undefined, 'RAS', 'ras', '-', 'n/a', 'x']) {
      await expect(rapprocherDetailDeCompte(importId, IDS.users.lea, degenere), `motif « ${degenere} » n'aurait pas dû passer`)
        .rejects.toThrow(/POP-02.*une explication d.écart se rédige/);
    }
    await rapprocherDetailDeCompte(importId, IDS.users.lea, 'Facture régularisée post-clôture, pièce jointe.');
    const [apres] = await detailsDeCompteDuDossier(IDS.engNep, 'REVENUE');
    expect(apres.rapprochee).toBe(true);
    expect(apres.ecartExplication).toMatch(/régularisée/);
  });

  /* CAS CONNU MAUVAIS (règle 17), le parseur : ligne mal formée, référence
     dupliquée, en-tête incorrect — chacun nommé, aucun avalé en silence. */
  it('refuse un fichier mal formé, en NOMMANT la ligne', async () => {
    await expect(importerDetailDeCompte({
      engagementId: IDS.engNep, fsliCode: 'REVENUE', filename: 'vide.csv', contenu: octets(''), userId: IDS.users.karim,
    })).rejects.toThrow(/vide/);

    await expect(importerDetailDeCompte({
      engagementId: IDS.engNep, fsliCode: 'REVENUE', filename: 'entete.csv',
      contenu: octets('référence;montant\nX;10'), userId: IDS.users.karim,
    })).rejects.toThrow(/trois colonnes/);

    await expect(importerDetailDeCompte({
      engagementId: IDS.engNep, fsliCode: 'REVENUE', filename: 'nombre.csv',
      contenu: octets('référence;libellé;montant\nX;Ligne;pas-un-nombre'), userId: IDS.users.karim,
    })).rejects.toThrow(/ligne 2.*n'est pas un nombre/);

    await expect(importerDetailDeCompte({
      engagementId: IDS.engNep, fsliCode: 'REVENUE', filename: 'doublon.csv',
      contenu: octets('référence;libellé;montant\nX;Un;10\nX;Deux;20'), userId: IDS.users.karim,
    })).rejects.toThrow(/apparaît deux fois/);

    await expect(importerDetailDeCompte({
      engagementId: IDS.engNep, fsliCode: 'CODE_INCONNU', filename: 'poste.csv',
      contenu: octets('référence;libellé;montant\nX;Un;10'), userId: IDS.users.karim,
    })).rejects.toThrow(/aucun compte/);
  });

  /* CAS CONNU MAUVAIS (règle 17) — retrouvé par la revue hostile du
     2026-09-06 : Intl.NumberFormat('fr-FR') sépare les milliers par
     U+00A0 ou U+202F selon la version d'ICU (même famille que D-J3N-11,
     le comparateur d'hydratation). Un montant à quatre chiffres, tel qu'un
     export français réel le produirait, ne doit PAS être refusé. Écrit en
     \u-échappé plutôt qu'en caractère littéral : les deux espaces se
     ressemblent trop pour se relire ou se diffuser correctement. */
  it('un montant séparé par une espace insécable (NBSP ou NNBSP) se lit, pas seulement l’espace ASCII', async () => {
    for (const espace of [' ', ' ', ' ']) {
      const csv = `référence;libellé;montant\nCLIENT-ESP;Montant à quatre chiffres;12${espace}345,67`;
      const importId = await importerDetailDeCompte({
        engagementId: IDS.engNep, fsliCode: 'REVENUE', filename: 'espace.csv', contenu: octets(csv), userId: IDS.users.karim,
      });
      const detail = (await detailsDeCompteDuDossier(IDS.engNep, 'REVENUE')).find((d) => d.id === importId)!;
      expect(detail.totalCents, `espace U+${espace.codePointAt(0)?.toString(16)}`).toBe(1_234_567);
    }
  });
});
