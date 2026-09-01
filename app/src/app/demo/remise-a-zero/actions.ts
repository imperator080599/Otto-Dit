'use server';

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/core/auth';
import { remettreLeMondeAZero } from '@/lib/services/monde-demo';

export async function remettreAZeroAction(): Promise<void> {
  const user = await getSessionUser();
  let ok = false;
  try {
    await remettreLeMondeAZero({ userId: user?.id ?? null });
    ok = true;
  } catch (e) {
    /* Le refus est RENDU, jamais avalé ni servi en page 500 (règle 13). */
    redirect(`/demo/remise-a-zero?erreur=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
  if (ok) redirect('/?remis=1');
}
