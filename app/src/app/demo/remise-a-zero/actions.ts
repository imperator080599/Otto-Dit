'use server';

import { conduire } from '@/lib/core/sonde';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/core/auth';
import { assertPeutRemettreAZero, remettreLeMondeAZero } from '@/lib/services/monde-demo';

/* P2-03a (AUD-07) : L'ACTION, PAS SEULEMENT LA PAGE. `remise-a-zero/page.tsx` appelle déjà
   `requireUser()`, mais cette action-ci — le geste RÉEL, atteignable par un POST direct sur
   son endpoint Next (le header `Next-Action`, sans passer par la page) — ne lisait la session
   qu'avec `getSessionUser()` et TOLÉRAIT son absence (`userId: user?.id ?? null`) : un POST sans
   cookie tronquait quand même la totalité du monde de démonstration, pour tous les cabinets.
   `requireUser()` REDIRIGE avant que `userId` n'existe si personne n'est connecté — même
   sans page devant. Le rôle est vérifié ICI (`assertPeutRemettreAZero`, monde-demo.ts — extraite
   pour être éprouvée directement, règle 17), jamais supposé par la présence d'un lien dans
   l'écran (l'écran suit le service, règle P2-02). */
export async function remettreAZeroAction(): Promise<void> {
  const user = await requireUser();
  let ok = false;
  try {
    assertPeutRemettreAZero(user.firm_role);
    await conduire(() => remettreLeMondeAZero({ userId: user.id }));
    ok = true;
  } catch (e) {
    /* Le refus est RENDU, jamais avalé ni servi en page 500 (règle 13). */
    redirect(`/demo/remise-a-zero?erreur=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
  if (ok) redirect('/?remis=1');
}
