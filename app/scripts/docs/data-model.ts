import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// npm run docs:modele [-- --figer] : docs/04_DATA_MODEL.md §5–§9 sont ENGENDRÉS depuis la DDL
// introspectée sur une PGlite éphémère (toutes les migrations rejouées en mémoire, jamais la
// base locale de développement) — jamais tapés de mémoire (règle 21, AUD-23). §1–§4 restent
// RÉDIGÉS : ce script les recopie VERBATIM depuis le fichier déjà commité (tout ce qui précède
// « ## 5. » y reste éditable à la main, comme avant) — seul ce qui suit est régénéré à chaque
// passage. Sans option, le script COMPARE et échoue si le fichier a divergé de la DDL (même
// patron que `npm run gardes`) ; `--figer` le réécrit.
//
// OÙ CE SCRIPT CESSE DE REGARDER (règle 19) : il énumère colonnes, contraintes, index et
// politiques RLS — pas les DÉCLENCHEURS (triggers), pas les vues, pas les fonctions ; une table
// dont toute la logique vit dans un trigger (ex. l'append-only de `signoff`) n'a ici qu'une ligne
// de colonnes, sa garde réelle reste documentée en prose dans la section qu'elle regroupe. Les 26
// tables déjà couvertes par §1–§4 (TABLES_SECTION_1_4 ci-dessous) ne sont jamais réémises ici,
// même si leur DDL a changé — les tenir à jour dans la prose de §1–§4 reste un geste humain.

const ici = path.dirname(fileURLToPath(import.meta.url));
const CIBLE = path.join(ici, '..', '..', '..', 'docs', '04_DATA_MODEL.md');

process.env.OTTO_DB = 'memory';

/* eslint-disable @typescript-eslint/no-var-requires */

/** Les tables déjà nommées en prose dans §1–§4 du fichier — jamais réémises par la DDL, pour ne
 *  pas dupliquer ce qu'un humain rédige à la main (le fichier lui-même reste la preuve : elles
 *  y sont TOUTES citées comme `` `nom` `` dans les tableaux de §1–§4). */
const TABLES_SECTION_1_4 = new Set([
  'tenant', 'app_user', 'entity', 'corp_group', 'component', 'referral_instruction', 'period',
  'engagement', 'engagement_member', 'client_contact',
  'import_file', 'tb_snapshot', 'account', 'gl_entry', 'coa_map_rule', 'fsli', 'reconciliation',
  'materiality', 'risk', 'procedure',
  'request', 'request_item', 'reminder', 'inbound_email', 'evidence', 'extraction',
  'procedure_instance',
]);

/** Regroupement des tables restantes sous les titres §5–§8 déjà en usage dans ce fichier avant
 *  ce script. Une table qui n'apparaît dans AUCUN groupe tombe dans le groupe§10 (« Autres
 *  tables, non classées ») plutôt que d'être tue (règle 13) — c'est le filet, pas un manque à
 *  corriger en secret : `docs:modele` ne fait jamais disparaître une table trouvée en base.*/
const GROUPES: Record<string, string[]> = {
  '5. Sampling & testing': [
    'sample', 'sample_item', 'sample_evaluation', 'match', 'exception', 'followup',
    'misstatement', 'account_detail_import', 'account_detail_row', 'aux_balance_file',
    'aux_balance_row', 'cell_disposition', 'test_cell', 'test_column', 'test_grid',
    'test_line_conclusion', 'reconciliation_item', 'confirmation_campaign', 'confirmation_party',
  ],
  '6. ICFR / SOX set': [
    'process', 'process_model', 'process_step', 'process_ctrl', 'process_change_decision',
    'process_interview', 'walkthrough', 'control', 'control_test', 'control_instance',
    'control_fsli', 'control_risk', 'control_design_factor', 'control_iuc', 'control_iuc_preuve',
    'control_oe_procedure', 'control_population_reconciliation', 'control_task',
    'control_task_procedure', 'control_walkthrough_gap', 'control_walkthrough_transcript',
    'rcm_row', 'deviation', 'deficiency', 'itgc_area', 'interview_participant',
    'interview_transcript', 'transcript_gap', 'attribute_def', 'attribute_result',
  ],
  '7. Documentation': [
    'workpaper', 'workpaper_edit', 'wp_attachment', 'wp_extra_column', 'wp_extra_cell',
    'review_note', 'review_note_reply', 'signoff', 'ipe', 'ipe_rapport', 'export_record',
    'section_state', 'section_visit', 'section_watch', 'ui_repli',
  ],
  '7bis. Run identity & verification': [
    'engine_run', 'verification_run', 'verification_check',
  ],
  '8. Infrastructure': [
    'event_log', 'ai_run', 'notification', 'app_state', 'file_archive', 'blob_store',
    'server_error', 'engagement_lock_verdict', 'rls_definer_justifiee', '_migrations',
    'fsli_assertion_risk', 'fsli_assertion_risk_decision', 'risk_factor_declared',
    'risk_factor_observed', 'risk_question_answer', 'fsli_materiality_bascule', 'fsli_analytique',
    'fs_line', 'fs_tie', 'carry_forward', 'completion_item', 'firm_methodology',
    'gl_entry_supersession', 'proposition',
  ],
};

const GROUPES_10 = '10. Autres tables (non classées par ce script)';

interface Colonne { column_name: string; data_type: string; is_nullable: string; column_default: string | null }
interface Fk { conname: string; col: string; ref_table: string; ref_col: string; ondelete: string }
interface Idx { indexname: string; indexdef: string }
interface Politique { policyname: string; cmd: string; roles: string }

async function introspecter() {
  const { getDb } = await import('../../src/lib/db/client');
  const { migrate } = await import('../../src/lib/db/migrate');
  const db = await getDb();
  await migrate(db);

  const tables = (await db.query<{ relname: string }>(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname = 'public' order by 1`,
  )).rows.map((r) => r.relname);

  const parTable = new Map<string, {
    colonnes: Colonne[]; pk: string[]; fks: Fk[]; index: Idx[]; politiques: Politique[];
  }>();

  for (const t of tables) {
    const colonnes = (await db.query<Colonne>(
      `select column_name, data_type, is_nullable, column_default
       from information_schema.columns where table_schema='public' and table_name=$1
       order by ordinal_position`,
      [t],
    )).rows;

    const pk = (await db.query<{ attname: string }>(
      `select a.attname from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
       where c.conrelid = $1::regclass and c.contype = 'p'`,
      [t],
    )).rows.map((r) => r.attname);

    const fks = (await db.query<Fk>(
      `select c.conname, a.attname as col, rc.relname as ref_table, ra.attname as ref_col,
              case c.confdeltype when 'r' then 'restrict' when 'c' then 'cascade'
                when 'n' then 'set null' when 'd' then 'set default' else 'no action' end as ondelete
       from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       join pg_class rc on rc.oid = c.confrelid
       join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = c.confkey[1]
       where c.conrelid = $1::regclass and c.contype = 'f'
       order by c.conname`,
      [t],
    )).rows;

    const index = (await db.query<Idx>(
      `select indexname, indexdef from pg_indexes
       where schemaname='public' and tablename=$1 and indexname not like '%_pkey'
       order by indexname`,
      [t],
    )).rows;

    const politiques = (await db.query<Politique>(
      `select policyname, cmd, roles::text from pg_policies
       where schemaname='public' and tablename=$1 order by policyname`,
      [t],
    )).rows;

    parTable.set(t, { colonnes, pk, fks, index, politiques });
  }

  await db.close();
  return { tables, parTable };
}

function rendreTable(
  nom: string,
  d: { colonnes: Colonne[]; pk: string[]; fks: Fk[]; index: Idx[]; politiques: Politique[] },
): string {
  const out: string[] = [`### \`${nom}\``, ''];
  out.push('| Colonne | Type | Nullable | Défaut |');
  out.push('|---|---|---|---|');
  for (const c of d.colonnes) {
    const pk = d.pk.includes(c.column_name) ? ' (PK)' : '';
    out.push(
      `| ${c.column_name}${pk} | ${c.data_type} | ${c.is_nullable === 'YES' ? 'oui' : 'non'} `
      + `| ${c.column_default ?? '—'} |`,
    );
  }
  if (d.fks.length > 0) {
    out.push('');
    out.push('FK : ' + d.fks.map(
      (f) => `\`${f.col}\` → \`${f.ref_table}(${f.ref_col})\` on delete ${f.ondelete}`,
    ).join(' ; '));
  }
  if (d.index.length > 0) {
    out.push('');
    out.push('Index : ' + d.index.map((i) => `\`${i.indexname}\``).join(', '));
  }
  if (d.politiques.length > 0) {
    out.push('');
    out.push('Politiques RLS : ' + d.politiques.map(
      (p) => `\`${p.policyname}\` (${p.cmd}, ${p.roles})`,
    ).join(' ; '));
  }
  out.push('');
  return out.join('\n');
}

export async function engendrer(): Promise<string> {
  const { tables, parTable } = await introspecter();
  const nonClassees = tables.filter(
    (t) => !TABLES_SECTION_1_4.has(t) && !Object.values(GROUPES).some((g) => g.includes(t)),
  );

  const enTete = fs.readFileSync(CIBLE, 'utf8').split(/\n(?=## 5\. )/)[0];

  const corps: string[] = [];
  for (const [titre, tabs] of Object.entries(GROUPES)) {
    const presentes = tabs.filter((t) => tables.includes(t)).sort();
    corps.push(`## ${titre}\n`);
    for (const t of presentes) corps.push(rendreTable(t, parTable.get(t)!));
  }
  corps.push(
    '## 9. Immutability, versioning, lock, retention\n',
    'Ces invariants sont des RÈGLES, pas une forme de table — non introspectables depuis la DDL '
    + 'seule (rien ne stocke littéralement « re-import supersedes »). Rédigés à la main, tenus à '
    + 'jour par la même discipline que §1–§4, reproduits ici verbatim par ce générateur pour que '
    + 'le fichier entier reste un seul artefact engendré :\n',
  );
  /* Ancré sur « 1. **Append-only** », jamais sur le titre de section : la phrase d'intro
     ci-dessus est ÉCRITE PAR CE SCRIPT à chaque passage, donc capturer « tout ce qui suit le
     titre » se recapturerait lui-même au passage suivant (trouvé en s'auto-testant, règle 17 —
     la première version dupliquait cette phrase à chaque `--figer`). */
  const ancien = fs.readFileSync(CIBLE, 'utf8');
  const m = ancien.match(/\n(1\. \*\*Append-only\*\*[\s\S]*?)(?=\n## |\n$)/);
  corps.push(m ? m[1].trim() : '(règles non trouvées dans le fichier précédent — à restaurer)');
  corps.push('');

  if (nonClassees.length > 0) {
    corps.push(`## ${GROUPES_10}\n`);
    corps.push(
      'Trouvées en base sans groupe assigné dans `scripts/docs/data-model.ts` — jamais tues '
      + '(règle 13). Ajouter la table à un groupe de `GROUPES` (ou à `TABLES_SECTION_1_4` si '
      + 'elle est déjà décrite en prose plus haut) fait disparaître cette section.\n',
    );
    for (const t of nonClassees.sort()) corps.push(rendreTable(t, parTable.get(t)!));
  }

  return enTete.trimEnd() + '\n\n' + corps.join('\n').trimEnd() + '\n';
}

async function main() {
  const md = await engendrer();
  if (process.argv.includes('--figer')) {
    fs.writeFileSync(CIBLE, md);
    console.log(`docs/04_DATA_MODEL.md écrit — ${md.split('\n### ').length - 1} table(s) documentée(s) en §5–§10.`);
    return;
  }
  const actuel = fs.existsSync(CIBLE) ? fs.readFileSync(CIBLE, 'utf8') : '';
  if (actuel !== md) {
    console.error(
      'docs/04_DATA_MODEL.md a DIVERGÉ de la DDL — lancez `npm run docs:modele -- --figer` '
      + 'et relisez le diff.',
    );
    process.exit(1);
  }
  console.log('docs/04_DATA_MODEL.md à jour avec la DDL courante.');
}

if (process.argv[1]?.endsWith('data-model.ts')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
