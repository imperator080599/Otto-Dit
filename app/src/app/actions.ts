'use server';

import { redirect } from 'next/navigation';
import { conduire } from '@/lib/core/sonde';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/core/auth';
import {
  creerMission, creerClient, creerExercice, preverifierMission, lireDateFr, EngagementRuleError,
  CLASSES, BENCHMARKS, type Classe, type BenchmarkPrefere, type Kind,
} from '@/lib/services/engagement';

// Action dans son propre fichier (ADR-078). Le refus repart à l'écran : une
// règle qui échoue en silence ne se distingue pas d'un bouton cassé.
//
// LA CRÉATION EN UN ÉCRAN (Groupe 1, item 1.1) : un client existant ou NEUF,
// un exercice existant ou NEUF par sa date de clôture, la nature, la classe,
// le référentiel, la langue, le référentiel de seuil préféré, le nom. Chaque
// pièce passe par le service qui porte sa règle ; ici on ne fait qu'assembler.
//
// TROIS ÉCRITURES, PAS DE TRANSACTION — ET CE QU'ON FAIT À LA PLACE. Les
// services parlent à la connexion partagée, pas à un exécuteur de
// transaction ; « s'arrêter au premier refus » n'annule donc rien de ce qui
// précède (revue hostile n°4). Tout refus qui peut être connu AVANT d'écrire
// l'est donc ici, avant la première écriture : la nature, le référentiel, la
// langue et la méthode en vigueur (`preverifierMission`), la date, et les
// deux choix contradictoires du formulaire, un client neuf avec un exercice
// existant. Ce qui reste : deux créations simultanées du même client — dit au
// registre, pas caché — et un refus de `creerClient` (devise, pays) qui
// survient avant toute écriture aussi, puisque c'est la première.

export async function creerAction(formData: FormData): Promise<never> {
  const u = await requireUser();
  const champ = (n: string) => String(formData.get(n) ?? '').trim();
  let id = '';
  let erreur = '';
  try {
    /* SOUS LA SONDE (core/sonde.ts) : conduit, puis annulé — rien d'écrit. */
    await conduire(async () => {
      const kind = champ('kind') || 'statutory_audit';
      const packs = [champ('pack') || 'nep-fr'];
      const language = champ('language') || 'fr';
      await preverifierMission({ tenantId: u.tenant_id, kind, packs, language });
      const classe = (champ('classe') || 'autre') as Classe;
      if (!CLASSES.includes(classe)) throw new EngagementRuleError('classe de mission inconnue');
      const benchmark = (champ('benchmark') || 'auto') as BenchmarkPrefere;
      if (!BENCHMARKS.includes(benchmark)) throw new EngagementRuleError('référentiel de seuil inconnu');

      /* UN CHOIX OU L'AUTRE, JAMAIS LES DEUX EN SILENCE. Un client existant
         choisi ET un nom tapé : le nom disparaissait sans un mot ; même chose
         pour un exercice existant et une date de clôture saisie. */
      const clientNeuf = champ('entity_id') === '__nouveau__';
      if (!clientNeuf && champ('entity_name')) {
        throw new EngagementRuleError('un client existant est choisi ET un nom de client neuf est saisi — l’un ou l’autre');
      }
      if (clientNeuf && !champ('entity_name')) {
        throw new EngagementRuleError('un client neuf se nomme — saisissez son nom');
      }
      const exerciceNeuf = champ('period_id') === '__nouveau__' || !champ('period_id');
      /* Un client NEUF n'a aucun exercice : tout exercice existant choisi est
         celui d'un autre client, et le refus viendrait APRÈS la création du
         client — un orphelin, par le chemin par défaut du formulaire (revue
         hostile n°5). Refusé ici, avant la première écriture. */
      if (clientNeuf && !exerciceNeuf) {
        throw new EngagementRuleError('un client neuf n’a pas encore d’exercice — choisissez « nouvel exercice » et saisissez sa date de clôture');
      }
      if (!exerciceNeuf && champ('period_end')) {
        throw new EngagementRuleError('un exercice existant est choisi ET une date de clôture est saisie — l’un ou l’autre');
      }
      let fin: string | null = null;
      if (exerciceNeuf) {
        fin = lireDateFr(champ('period_end'));
        if (!fin) throw new EngagementRuleError('la date de clôture se saisit au format jj/mm/aaaa (années 1990 à 2100)');
      }

      let entityId = champ('entity_id');
      if (clientNeuf) {
        entityId = (await creerClient({
          tenantId: u.tenant_id, name: champ('entity_name'),
          currency: champ('entity_currency') || 'EUR', actorUserId: u.id,
        })).id;
      }
      let periodId = champ('period_id');
      if (exerciceNeuf) {
        periodId = (await creerExercice({ tenantId: u.tenant_id, entityId, endDate: fin!, actorUserId: u.id })).id;
      }
      const row = await creerMission({
        tenantId: u.tenant_id,
        entityId,
        periodId,
        kind: kind as Kind,
        name: champ('name'),
        packs,
        accountingMap: 'pcg',
        language: language as 'fr' | 'en',
        classe,
        benchmarkPrefere: benchmark,
        actorUserId: u.id,
      });
      id = row.id;
    });
  } catch (e) {
    if (!(e instanceof EngagementRuleError)) throw e;
    erreur = e.message;
  }
  revalidatePath('/');
  // Un dossier neuf s'ouvre sur son ACCEPTATION : c'est par là qu'il commence.
  redirect(erreur ? `/?erreur=${encodeURIComponent(erreur)}` : `/eng/${id}/acceptance`);
}
