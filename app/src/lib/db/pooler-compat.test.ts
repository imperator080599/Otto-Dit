import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// LE POOLER DE TRANSACTION NE PARDONNE PAS LES FONCTIONNALITÉS DE SESSION
// (DA-12). Le runtime hébergé passe par le pooler Supabase en mode
// transaction (port 6543) : pg_advisory_lock (portée SESSION), les requêtes
// préparées nommées et LISTEN/NOTIFY y meurent en silence ou en erreur — en
// production seulement. Ce test interdit leur entrée dans src/ : la variante
// TRANSACTION (pg_advisory_xact_lock) reste la seule permise, et un besoin
// de session futur se traite par connexion dédiée, documentée en DA-12.

const RACINE = path.join(__dirname, '..', '..');

function fichiers(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...fichiers(p));
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('compatibilité pooler de transaction (DA-12)', () => {
  it('aucune fonctionnalité de session dans src/ — verrou session, préparée nommée, listen/notify', () => {
    const infractions: string[] = [];
    for (const f of fichiers(RACINE)) {
      const s = fs.readFileSync(f, 'utf8');
      const rel = path.relative(RACINE, f);
      // pg_advisory_lock( — mais PAS pg_advisory_xact_lock(
      if (/pg_advisory_(?:unlock|lock)\s*\(/.test(s)) infractions.push(`${rel} : verrou consultatif de SESSION`);
      if (/\blisten\s+[a-z_"']/i.test(s) && /notify/i.test(s)) infractions.push(`${rel} : LISTEN/NOTIFY`);
      if (/query\s*\(\s*\{\s*name\s*:/.test(s)) infractions.push(`${rel} : requête préparée NOMMÉE`);
      infractions.push(...reglagesDeSession(s).map((x) => `${rel} : ${x}`));
    }
    expect(infractions, 'fonctionnalités de session interdites sur le pooler de transaction — DA-12').toEqual([]);
  });

  /* LA RÈGLE S'ÉPROUVE CONTRE UN CAS CONNU MAUVAIS (règle 17) : le code exact
     qui a vécu dans acceptance.ts — un drapeau posé en session par une requête,
     lu par la garde dans une autre — doit être dénoncé ; la forme corrigée
     (réglage LOCAL dans une transaction) ne doit pas l'être. */
  it('dénonce un réglage de SESSION, et accepte le réglage LOCAL', () => {
    const session = ["set_config(…, false) : réglage de SESSION — sur le pooler, la requête suivante peut partir sur une autre connexion"];
    expect(reglagesDeSession("await q(`select set_config('otto.derive_milestone', 'on', false)`);")).toEqual(session);
    /* Les formes que la première version laissait passer (revue hostile) :
       arguments non littéraux, retour à la ligne avant SET, RESET, DISCARD,
       SET SESSION AUTHORIZATION — et le réglage LOCAL hors transaction. */
    expect(reglagesDeSession("await q(`select set_config($1, $2, false)`, [cle, val]);")).toEqual(session);
    expect(reglagesDeSession("await run(`set search_path to public`);")).toEqual(['SET sans LOCAL : réglage de SESSION']);
    expect(reglagesDeSession("await run(`begin;\n  set role otto_lecteur_demo`);")).toEqual(['SET sans LOCAL : réglage de SESSION']);
    expect(reglagesDeSession("await run(`reset role`);")).toEqual(['RESET sans LOCAL : réglage de SESSION']);
    expect(reglagesDeSession("await run(`discard all`);")).toEqual(['DISCARD sans LOCAL : réglage de SESSION']);
    expect(reglagesDeSession("await run(`set session authorization otto`);")).toEqual(['SET sans LOCAL : réglage de SESSION']);
    expect(reglagesDeSession("await q(`select set_config('otto.x', 'on', true)`);"))
      .toEqual(['set_config(…, true) par q() : hors transaction, le réglage LOCAL meurt avec la requête']);
    expect(reglagesDeSession("await run(`select set_config('otto.derive_milestone', 'on', true)`);")).toEqual([]);
    expect(reglagesDeSession("await t.query(`set local role otto_lecteur_demo`);")).toEqual([]);
    expect(reglagesDeSession("do update set role = 'domaine'")).toEqual([]);
    expect(reglagesDeSession("`update engagement_milestone set due_date = $3`")).toEqual([]);
  });
});

/**
 * UN RÉGLAGE DE SESSION N'EXISTE PAS SUR UN POOLER DE TRANSACTION (Groupe 0,
 * item 106 : « bannir le SET nu au profit de set_config(clé, valeur, true) »).
 * `set_config(…, false)` et `SET x = y` (sans LOCAL) posent un réglage sur LA
 * connexion ; la requête suivante peut en prendre une autre, et le réglage
 * n'y est pas. Ce n'est pas une erreur : c'est un comportement qui dépend de
 * la charge, donc invisible en test et intermittent en ligne.
 */
export function reglagesDeSession(code: string): string[] {
  const out: string[] = [];
  const sans = code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  /* set_config(…, false) — quels que soient les deux premiers arguments
     (littéraux, paramètres `$1`, variables) : c'est le troisième qui compte. */
  if (/set_config\(([^()]|\([^()]*\))*,\s*false\s*\)/.test(sans)) {
    out.push('set_config(…, false) : réglage de SESSION — sur le pooler, la requête suivante peut partir sur une autre connexion');
  }
  /* set_config(…, true) HORS transaction est INERTE : la transaction implicite
     de la requête se termine avec elle. Il ne vaut que dans `tx()` / `run(` /
     `t.query(` — un `q(` ou `q1(` qui le porte ne règle rien. */
  for (const m of sans.matchAll(/\b(q|q1|q01)\(\s*[`'"][^`'"]*set_config\(([^()]|\([^()]*\))*,\s*true\s*\)/g)) {
    out.push(`set_config(…, true) par ${m[1]}() : hors transaction, le réglage LOCAL meurt avec la requête`);
    break;
  }
  /* `SET`, `RESET`, `DISCARD` en tête d'un ordre SQL — au début de la chaîne
     ou après un `;` — hors `SET LOCAL` ; jamais le `set` d'un UPDATE ni d'un
     `on conflict … do update set`. `SET SESSION AUTHORIZATION` est de session
     par définition. DANS LES CHAÎNES QU'ON ENVOIE À LA BASE SEULEMENT : le
     catalogue de libellés porte « Reset to zero » en prose, et une première
     version l'a dénoncé — un détecteur qui crie faux se fait taire. */
  for (const appel of sans.matchAll(/\b(?:q|q1|q01|run|exec|query)\(\s*([`'"])([\s\S]*?)\1/g)) {
    const sql = appel[2];
    let vu = false;
    for (const m of sql.matchAll(/(?:^|;)\s*(set|reset|discard)\s+(?!local\b)(\w+)/gi)) {
      const verbe = m[1].toLowerCase(); const cible = m[2];
      if (verbe !== 'set' || /^(role|search_path|session|timezone|statement_timeout|lock_timeout|transaction|time)$/i.test(cible)
        || /^[a-z_]+\.[a-z_]+$/i.test(cible)) {
        out.push(`${verbe.toUpperCase()} sans LOCAL : réglage de SESSION`);
        vu = true;
        break;
      }
    }
    if (vu) break;
  }
  return out;
}
