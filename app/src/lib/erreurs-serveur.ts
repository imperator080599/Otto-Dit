import { after } from 'next/server';
import { q, q01 } from '@/lib/db/client';

// L'ÉCRITURE D'UNE EXCEPTION DE RENDU DANS `server_error` (Groupe 0, item 106).
//
// Ce module est chargé par `instrumentation.ts` UNIQUEMENT dans le runtime
// Node, par l'import dynamique conditionnel que Next documente — le
// middleware (Edge) compile la même `instrumentation.ts` et ne doit jamais
// tirer `db/client` (pglite, node:fs).
//
// CE QUE L'ÉCRITURE NE GARANTIT PAS, ET POURQUOI. Next appelle
// `onRequestError` SANS attendre sa promesse sur le chemin des erreurs de
// rendu ; dans une fonction serverless, la réponse peut partir — et la
// fonction être gelée — avant que l'INSERT ne soit validé. `after()` demande
// à la plateforme de garder la fonction vivante jusqu'à la fin du travail ;
// hors d'un contexte de requête, il jette, et on écrit alors directement.
// L'écriture reste donc « au mieux » : un digest affiché sans ligne en base
// se lit comme « non résolu », jamais comme « jamais arrivé ».

const UUID = /\/eng\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export interface Requete { path: string; method: string }
export interface Contexte { routePath: string }

export function empreinte(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export async function ecrireErreur(err: unknown, request: Requete, context: Contexte): Promise<void> {
  const e = err as { message?: string; stack?: string; digest?: string };
  const message = String(e?.message ?? err).slice(0, 2000);
  const stack = typeof e?.stack === 'string' ? e.stack.slice(0, 8000) : null;
  /* Le digest de Next est celui que l'ÉCRAN affiche : c'est lui que le
     fondateur collera. Sans digest (erreur hors rendu), une empreinte du
     message tient lieu de clé, pour que la ligne reste retrouvable. */
  const digest = e?.digest ?? `m-${empreinte(message)}`;
  const engagementId = request.path.match(UUID)?.[1] ?? null;
  const travail = async () => {
    try {
      const tenant = engagementId
        ? await q01<{ tenant_id: string }>(`select tenant_id::text from engagement where id = $1`, [engagementId])
          .catch(() => null)
        : null;
      await q(
        `insert into server_error (digest, route, path, method, engagement_id, tenant_id, release_sha, message, stack)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [digest, context.routePath, request.path.slice(0, 500), request.method, engagementId,
          tenant?.tenant_id ?? null, process.env.VERCEL_GIT_COMMIT_SHA ?? null, message, stack],
      );
    } catch (ecriture) {
      console.error('server_error : impossible d’écrire l’exception —', ecriture instanceof Error ? ecriture.message : ecriture);
    }
  };
  try {
    after(travail());
  } catch {
    await travail();
  }
}
