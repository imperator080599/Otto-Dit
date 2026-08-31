import { NextResponse } from 'next/server';
import { q01 } from '@/lib/db/client';
import { demoPublique } from '@/lib/core/demo-public';
import { dbKind } from '@/lib/db/client';

// LA SANTÉ DE L'INSTANCE DÉPLOYÉE — `/api/sante`.
//
// POURQUOI CE CHEMIN EXISTE (revue utilisateur n°1). 529 tests, 78 routes
// balayées et 144 étapes cliquées s'exécutent en local, sur PGlite, avec le
// dépôt entier sur le disque. Le déploiement, lui, tourne dans une fonction
// serverless qui n'emporte QUE les fichiers tracés, sur un Postgres réseau.
// Trois écrans ont rendu 500 en ligne pendant que tout était vert ici, pour un
// dossier oublié dans le traçage — et personne ne l'a su avant qu'un humain
// clique.
//
// Ce chemin exécute, DANS la fonction déployée, les lectures dont dépend chaque
// famille d'écrans, et dit laquelle échoue. Il ne remplace pas le balayage des
// écrans (`npm run fumee`, qui les OUVRE vraiment) : il est ce qu'on peut
// interroger en un seul appel, y compris depuis un réseau qui ne peut pas
// atteindre l'application.

export const dynamic = 'force-dynamic';

interface Lecture { nom: string; ok: boolean; detail: string }

async function essayer(nom: string, fn: () => Promise<unknown>): Promise<Lecture> {
  try {
    const v = await fn();
    const detail = Array.isArray(v) ? `${v.length} élément(s)`
      : v === null || v === undefined ? 'vide'
        : typeof v === 'object' ? 'objet' : String(v);
    return { nom, ok: true, detail };
  } catch (e) {
    return { nom, ok: false, detail: e instanceof Error ? e.message.split('\n')[0].slice(0, 300) : String(e) };
  }
}

export async function GET() {
  if (!demoPublique()) {
    return new NextResponse('Ce chemin n’existe que sur la démonstration publique.', { status: 404 });
  }
  const eng = await q01<{ id: string }>(
    `select id::text from engagement where kind = 'statutory_audit' order by created_at limit 1`)
    .catch(() => null);

  const lectures: Lecture[] = [];
  lectures.push(await essayer('base : une mission existe', async () => eng?.id ?? null));

  /* LA MÉTHODE DU CABINET — la lecture qui manquait, et qui a cassé trois
     écrans : elle importe un fichier du DÉPÔT à l'exécution. */
  lectures.push(await essayer('méthode du cabinet (methodology/valider.mjs)', async () => {
    const { catalogueDeLaMission } = await import('@/lib/methodology/depot');
    return eng ? (await catalogueDeLaMission(eng.id)).procedures.length : 'aucune mission';
  }));

  if (eng) {
    const id = eng.id;
    lectures.push(await essayer('acceptation', async () => {
      const { currentAcceptation } = await import('@/lib/services/acceptance');
      return currentAcceptation(id);
    }));
    lectures.push(await essayer('équipe et indépendance', async () => {
      const { anciennetes } = await import('@/lib/services/team');
      return anciennetes(id);
    }));
    lectures.push(await essayer('obstacles au visa', async () => {
      const { obstaclesAuVisa } = await import('@/lib/services/obstacles');
      return obstaclesAuVisa(id);
    }));
    lectures.push(await essayer('postes (FSLI) et périmètre', async () => {
      const { listFslis } = await import('@/lib/services/fsli');
      return listFslis(id);
    }));
    lectures.push(await essayer('circularisations', async () => {
      const { rapprochement } = await import('@/lib/services/circularisations');
      return (await rapprochement(id, 'banque')).lignes;
    }));
    lectures.push(await essayer('papiers de travail', async () => {
      const { listWorkpapers } = await import('@/lib/services/workpapers/lifecycle');
      return listWorkpapers(id);
    }));
    lectures.push(await essayer('rail de destinations', async () => {
      const { railDuDossier } = await import('@/lib/services/rail');
      const { frameworkSet } = await import('@/lib/services/fsli');
      return railDuDossier(id, (await frameworkSet(id)).assurance_packs);
    }));
    lectures.push(await essayer('magasin de pièces (blob_store)', async () => {
      const r = await q01<{ n: string }>(`select count(*) n from blob_store`);
      return r ? `${r.n} objet(s)` : 'vide';
    }));
  }

  const cassees = lectures.filter((l) => !l.ok);
  return NextResponse.json({
    instance: { base: dbKind(), demoPublique: demoPublique() },
    verdict: cassees.length === 0 ? 'toutes les lectures passent' : `${cassees.length} lecture(s) CASSÉE(S)`,
    lectures,
  }, { status: cassees.length === 0 ? 200 : 500 });
}
