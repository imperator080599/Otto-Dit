import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@/lib/db/client';
import { CHEMINS_SANS_LOCATAIRE, tableVisee } from '@/lib/db/sans-locataire';

/**
 * LA LISTE DES CHEMINS SANS LOCATAIRE, ÉPROUVÉE CONTRE LE CODE (mandat du jour
 * n°3, §1.1 ; docs/PLAN_RLS.md addendum A.4).
 *
 * CE QUE CE FICHIER VÉRIFIE, ET IL LE DIT : la PRÉSENCE des appels dans les
 * fichiers, pas leur exécution. C'est un balayage de texte — il répond à « ce
 * chemin est-il déclaré et posé ? », jamais à « cette règle s'applique-t-elle ? »
 * (règle 15). Le REFUS, lui, est observé pour de vrai dans tenant.test.ts, qui
 * arme le garde et le fait lever LOC-01.
 *
 * CE QU'IL AJOUTE À LA LISTE : les deux sens. Une clé annoncée câblée et absente
 * du code rougit ; une clé annoncée « à câbler » et présente rougit aussi ; et
 * un point d'entrée public qui ne pose NI session NI dérogation rougit s'il
 * n'est pas dans la liste écrite ci-dessous.
 */
describe('les chemins sans locataire', () => {
  const app = path.join(repoRoot(), 'app');
  const src = path.join(app, 'src');

  const fichiers: string[] = [];
  const marcher = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) marcher(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) fichiers.push(p);
    }
  };
  marcher(src);
  const texte = new Map(fichiers.map((f) => [f, fs.readFileSync(f, 'utf8')]));

  /** Les appels réellement posés dans le code, clé par clé. */
  const posees = new Map<string, string[]>();
  for (const [f, t] of texte) {
    /* Le module qui PORTE la liste cite des clés d'exemple dans ses
       commentaires et dans son propre message de refus : le balayage ne
       s'inspecte pas lui-même. */
    if (path.basename(f) === 'sans-locataire.ts') continue;
    for (const m of t.matchAll(/sansLocataire\(\s*'([^']+)'/g)) {
      posees.set(m[1], [...(posees.get(m[1]) ?? []), path.relative(app, f)]);
    }
  }

  it('toute clé POSÉE dans le code est ÉCRITE dans la liste', () => {
    const ecrites = new Set(CHEMINS_SANS_LOCATAIRE.map((c) => c.cle));
    const inconnues = [...posees.entries()].filter(([c]) => !ecrites.has(c))
      .map(([c, f]) => `${c} (${f.join(', ')})`);
    expect(inconnues, 'dérogations posées sans être écrites').toEqual([]);
  });

  it('toute clé annoncée « câblée » est POSÉE, et toute clé « à câbler » ne l’est pas', () => {
    const manquantes = CHEMINS_SANS_LOCATAIRE
      .filter((c) => c.etat === 'cable' && !posees.has(c.cle)).map((c) => c.cle);
    expect(manquantes, 'clés annoncées câblées, absentes du code — une déclaration qui ne correspond à rien').toEqual([]);
    const enTrop = CHEMINS_SANS_LOCATAIRE
      .filter((c) => c.etat === 'a-cabler' && posees.has(c.cle)).map((c) => c.cle);
    expect(enTrop, 'clés annoncées « à câbler » et pourtant posées — la liste ment sur l’état').toEqual([]);
  });

  /**
   * COMBIEN D'ÉCRANS SURVIVRAIENT À L'ARMEMENT DU GARDE ? AUCUN — et le premier
   * jet de ce test répondait « deux découverts » (revue hostile n°9, constat 3).
   *
   * IL COMPTAIT QUATRE MARQUEURS DE TEXTE — `sansLocataire(`, `requireUser(`,
   * `requireMember(`, `getSessionUser(` — et déclarait couvert tout fichier qui
   * en portait un. Or `requireUser` et `getSessionUser` prouvent qu'une SESSION
   * existe, jamais qu'un LOCATAIRE est posé. L'écran d'accueil porte les deux
   * marqueurs ET lit `engagement` hors de toute portée : sous garde armé il
   * lève LOC-01, et le test le disait couvert. Le fichier écrivait lui-même, à
   * propos de `portalSession(`, que compter un marqueur « couvrirait la dette
   * au lieu de la montrer » — puis faisait exactement cela avec quatre autres.
   *
   * LE CRITÈRE EST DONC LE SEUL VRAI : poser un locataire, c'est appeler
   * `withTenant(` ou `sansLocataire(`. Rien d'autre ne compte. Et le résultat
   * est celui que la tranche doit dire en face : **le câblage de l'étape 1
   * n'est pas fait**, `withTenant` n'a aucun appelant de production, donc
   * presque tout point d'entrée est DÉCOUVERT. Ce n'est pas un détail à
   * excuser dans une liste : c'est le compte, il est publié, et il ne peut que
   * baisser.
   */
  function pointsDentree(): string[] {
    return fichiers.filter((f) => {
      const r = path.relative(src, f);
      return /^app[\\/].*(route|page)\.tsx?$/.test(r);
    });
  }
  function poseUnLocataire(t: string): boolean {
    return /sansLocataire\(|withTenant\(/.test(t);
  }

  it('L’INSTRUMENT VOIT LA VÉRITÉ : la plupart des points d’entrée ne posent AUCUN locataire', () => {
    const entrees = pointsDentree();
    /* 52 points d'entrée au 2026-09-03 (les `page.tsx` et `route.ts` de
       src/app, /eng compris). Le plancher n'est pas décoratif : un balayage
       qui n'en trouve plus qu'une poignée aurait cessé de mesurer. */
    expect(entrees.length, 'le balayage n’a trouvé presque aucun point d’entrée — instrument muet').toBeGreaterThan(40);
    const nus = entrees.filter((f) => !poseUnLocataire(texte.get(f)!));
    /* Le plancher empêche qu'on « améliore » le chiffre en élargissant le
       critère ; le plafond descendra quand le câblage sera fait. */
    expect(nus.length, 'points d’entrée sans locataire posé').toBeGreaterThan(30);
    expect(nus.length).toBeLessThanOrEqual(entrees.length);
    expect(entrees.length - nus.length, 'aucun point d’entrée ne pose de locataire : le câblage a disparu').toBeGreaterThanOrEqual(4);
  });

  it('LE CAS CONNU MAUVAIS DE CE CRITÈRE : l’écran d’accueil porte une session ET une dérogation, et reste DÉCOUVERT', () => {
    /* C'est le fichier exact sur lequel l'ancien critère se trompait. On
       vérifie les deux choses à la fois : il porte bien `getSessionUser(` (donc
       l'ancien critère l'aurait déclaré couvert) et il lit hors de la portée de
       sa seule dérogation (`missionsParClient`, hors de `sansLocataire`). */
    const accueil = [...texte.entries()].find(([f]) => path.relative(src, f) === path.join('app', 'page.tsx'));
    expect(accueil, 'src/app/page.tsx introuvable — le cas connu mauvais a disparu').toBeDefined();
    const t = accueil![1];
    expect(/getSessionUser\(/.test(t), 'l’écran d’accueil ne porte plus de session : le cas mauvais a changé').toBe(true);
    expect(/sansLocataire\('choix-identite'/.test(t)).toBe(true);
    /* La lecture qui SORT de la dérogation : elle n'est pas dans le bloc. */
    const bloc = t.slice(t.indexOf("sansLocataire('choix-identite'"), t.indexOf("sansLocataire('choix-identite'") + 400);
    expect(/missionsParClient\(/.test(t), 'l’accueil ne lit plus les missions').toBe(true);
    expect(/missionsParClient\(/.test(bloc), 'missionsParClient est passé SOUS la dérogation — mettez à jour ce cas mauvais').toBe(false);
  });

  /**
   * TOUTE POSE DE `otto.tenant_id` EST ÉCRITE (revue hostile n°9, constat 15).
   * Le commentaire du garde affirmait « il n'existe pas d'autre chemin dans ce
   * dépôt, et le test le vérifie » — il en existait un, et aucun test ne
   * vérifiait rien. Celui-ci le fait.
   */
  const POSES_CONNUES: Record<string, string> = {
    'src/lib/db/tenant.ts': 'withTenant — la pose de référence, dans la transaction',
    'src/lib/db/tenant.test.ts': 'les cas de fuite, qui posent le locataire à la main sous un rôle sans BYPASSRLS',
    'scripts/deploy/reconstruire.ts': 'la tentative de fuite du build, sous otto_lecteur_demo — un script, sous postgres, chemin « scripts »',
  };

  it('aucune pose de `otto.tenant_id` hors des chemins ÉCRITS', () => {
    const racine = path.join(repoRoot(), 'app');
    const vus: string[] = [];
    const marcher = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.next' || e.name === '.data') continue;
        const q = path.join(d, e.name);
        if (e.isDirectory()) marcher(q);
        else if (/\.(ts|tsx|mjs|sql)$/.test(e.name)
          && /set_config\(\s*'otto\.tenant_id'/.test(fs.readFileSync(q, 'utf8'))) {
          vus.push(path.relative(racine, q).split(path.sep).join('/'));
        }
      }
    };
    marcher(racine);
    expect(vus.length, 'aucune pose trouvée — le balayage ne voit plus rien').toBeGreaterThan(1);
    expect(vus.filter((v) => !(v in POSES_CONNUES)), 'poses de locataire hors de la liste écrite').toEqual([]);
    for (const k of Object.keys(POSES_CONNUES)) {
      expect(vus.includes(k), `${k} ne pose plus de locataire — retirez-le de la liste`).toBe(true);
    }
  });

  it('le refus NOMME la table visée — sinon il n’est pas diagnosticable', () => {
    expect(tableVisee(`select count(*) from engagement where id = $1`)).toBe('engagement');
    expect(tableVisee(`insert into event_log (a) values (1)`)).toBe('event_log');
    expect(tableVisee(`update app_user set name = $1`)).toBe('app_user');
    expect(tableVisee(`select 1`)).toBe('(table indéterminée)');
  });
});
