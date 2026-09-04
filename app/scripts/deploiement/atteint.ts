/**
 * LE SHA POUSSÉ DOIT DEVENIR LE SHA SERVI, DANS UN DÉLAI BORNÉ — SINON C'EST ROUGE.
 *
 * POURQUOI CETTE GARDE EXISTE. Le 3 septembre, trois tranches ont été poussées
 * sur `main`, la suite verte et le parcours cliqué vert à chaque fois. Les trois
 * déploiements ont ÉCHOUÉ (une migration déjà appliquée que j'avais éditée), et
 * rien ne l'a dit : le travail `url` de la CI ne se déclenche que sur un
 * déploiement RÉUSSI, donc un échec ne produit AUCUN signal. Le fondateur a
 * ouvert l'URL pendant vingt-quatre heures sans rien voir de neuf.
 *
 * CE QUE CETTE GARDE MESURE, ET RIEN D'AUTRE : ce que l'instance SERT. Elle ne
 * demande rien à Vercel, ne lit aucun événement, ne fait confiance à aucun
 * statut — elle interroge `/api/sante` et compare le SHA. Une chaîne de
 * déploiement peut mentir de dix façons ; l'octet servi, non.
 *
 * OÙ ELLE S'ARRÊTE DE REGARDER, dit ici :
 *   · elle ne dit RIEN de la santé de ce qui est servi (c'est le travail du
 *     balayage et de l'acceptation) — seulement de son IDENTITÉ ;
 *   · elle ne distingue pas « le build a échoué » de « le build est lent » :
 *     elle dit « au bout de N minutes, l'instance sert encore X ». La cause se
 *     lit dans le journal de build, et le message le dit ;
 *   · un déploiement qui réussit APRÈS le délai la laisse rouge : c'est voulu.
 *     Un déploiement qu'il faut attendre plus longtemps que le délai est un
 *     déploiement dont personne ne sait s'il arrivera.
 */

export interface Observation {
  seconde: number;
  servi: string | null;
  erreur?: string;
}

export interface Verdict {
  atteint: boolean;
  attendu: string;
  dernierServi: string | null;
  secondes: number;
  observations: Observation[];
  message: string;
}

const court = (s: string | null) => (s ? s.slice(0, 7) : '(aucun)');

/** Interroge `/api/sante` et rend le SHA servi, ou null si on n'a pas pu le lire. */
export async function shaServi(url: string, lire: typeof fetch = fetch): Promise<{ sha: string | null; erreur?: string }> {
  try {
    const r = await lire(`${url.replace(/\/+$/, '')}/api/sante`, {
      headers: { accept: 'application/json' },
    });
    if (!r.ok) return { sha: null, erreur: `HTTP ${r.status}` };
    const j = (await r.json()) as { sha?: string; version?: { sha?: string } };
    return { sha: j.sha ?? j.version?.sha ?? null };
  } catch (e) {
    return { sha: null, erreur: (e as Error).message.slice(0, 120) };
  }
}

export async function attendreLeSha(o: {
  url: string;
  attendu: string;
  minutes: number;
  intervalleMs?: number;
  lire?: typeof fetch;
  dormir?: (ms: number) => Promise<void>;
  maintenant?: () => number;
}): Promise<Verdict> {
  const intervalle = o.intervalleMs ?? 20_000;
  const dormir = o.dormir ?? ((ms: number) => new Promise<void>((r) => { setTimeout(r, ms); }));
  const maintenant = o.maintenant ?? (() => Date.now());
  const debut = maintenant();
  const limite = o.minutes * 60_000;
  const observations: Observation[] = [];

  for (;;) {
    const ecoule = maintenant() - debut;
    const { sha, erreur } = await shaServi(o.url, o.lire);
    observations.push({ seconde: Math.round(ecoule / 1000), servi: sha, erreur });
    if (sha === o.attendu) {
      return {
        atteint: true, attendu: o.attendu, dernierServi: sha,
        secondes: Math.round(ecoule / 1000), observations,
        message: `l’instance sert ${court(sha)} — le SHA poussé, atteint en ${Math.round(ecoule / 1000)} s`,
      };
    }
    if (ecoule + intervalle > limite) {
      return {
        atteint: false, attendu: o.attendu, dernierServi: sha,
        secondes: Math.round(ecoule / 1000), observations,
        message: `au bout de ${o.minutes} min, l’instance sert ENCORE ${court(sha)} `
          + `au lieu de ${court(o.attendu)}${erreur ? ` (dernière lecture : ${erreur})` : ''}. `
          + 'Une tranche poussée et non déployée n’existe pas pour le fondateur. '
          + 'La cause se lit dans le journal de build du déploiement, pas ici.',
      };
    }
    await dormir(intervalle);
  }
}

/* ── conduite en ligne de commande ────────────────────────────────────────── */
if (process.argv[1]?.endsWith('atteint.ts')) {
  const [, , url, attendu, ...reste] = process.argv;
  const minutes = Number(reste.find((a) => a.startsWith('--minutes='))?.split('=')[1] ?? 12);
  if (!url || !attendu) {
    console.error('usage : atteint.ts <url> <sha> [--minutes=12]');
    process.exit(2);
  }
  const v = await attendreLeSha({ url, attendu, minutes });
  for (const ob of v.observations) {
    console.log(`  ${String(ob.seconde).padStart(4)} s · servi ${court(ob.servi)}${ob.erreur ? ` · ${ob.erreur}` : ''}`);
  }
  console.log(v.atteint ? `OK — ${v.message}` : `ÉCHEC — ${v.message}`);
  process.exit(v.atteint ? 0 : 1);
}
