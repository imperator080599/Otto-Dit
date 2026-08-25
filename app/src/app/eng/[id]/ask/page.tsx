import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireMember } from '@/lib/core/auth';
import { frameworkSet } from '@/lib/services/fsli';
import { ask, runCatalogue, type AskResult } from '@/lib/services/query/ask';
import { CATALOG } from '@/lib/services/query/catalog';

// ADR-017 — « Interroger ». The answer is a view of stored records with links, or an
// explicit refusal. There is no prose path: nothing on this page is model-written.

export default async function AskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; tpl?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { user } = await requireMember(id);
  const lang = (await frameworkSet(id)).language;
  const t = (fr: string, en: string) => (lang === 'fr' ? fr : en);

  let result: AskResult | null = null;
  if (sp.tpl) result = await runCatalogue(id, sp.tpl, {}, user.id);
  else if (sp.q) result = await ask(id, sp.q, user.id);

  async function askAction(formData: FormData) {
    'use server';
    await requireMember(id);
    redirect(`/eng/${id}/ask?q=${encodeURIComponent(String(formData.get('q') ?? ''))}`);
  }

  return (
    <div>
      <div className="panel">
        <h2>{t('Interroger le dossier', 'Query the file')}</h2>
        <p className="faint">
          {t(
            'Votre question est traduite en une requête du catalogue, exécutée sur le dossier, et le résultat est une liste d’enregistrements cliquables. OTTO ne rédige jamais la réponse : si la question ne se traduit pas, il le dit.',
            'Your question is translated into a catalogue query, executed against the file, and the result is a list of clickable records. OTTO never writes the answer: if the question does not translate, it says so.',
          )}
        </p>
        <form action={askAction} className="row" style={{ gap: 8 }}>
          <input
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder={t('quelles demandes sont en retard de plus de 10 jours ?', 'which requests are more than 10 days late?')}
            style={{ flex: 1, minWidth: 320 }}
          />
          <button className="btn">{t('Interroger', 'Ask')}</button>
        </form>
      </div>

      {result?.status === 'answered' && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>
              {result.label} <span className="badge gray">{result.rows.length}</span>
            </h2>
            <span className="badge violet">
              {t('traduction', 'translation')}:{' '}
              {result.planner === 'rules'
                ? t('règle déterministe (sans IA)', 'deterministic rule (no AI)')
                : result.planner === 'llm'
                  ? t('IA — requête validée contre le catalogue', 'AI — query validated against the catalogue')
                  : t('choix explicite', 'explicit choice')}
            </span>
          </div>
          <p className="faint mono" style={{ fontSize: 12 }}>
            {t('Requête exécutée', 'Executed query')}: {result.templateId}
            {result.params.map((p) => ` · ${p.label} = ${p.value}`).join('')}
          </p>
          {result.rows.length === 0 ? (
            <p className="muted">{t('Aucun enregistrement ne correspond.', 'No records match.')}</p>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c.key} className={c.kind === 'money' ? 'num' : undefined}>{c.label}</th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.id}>
                      {result.columns.map((c) => (
                        <td key={c.key} className={c.kind === 'money' ? 'num' : undefined} style={{ maxWidth: 360 }}>
                          {c.kind === 'badge' ? <span className="badge gray">{r.cells[c.key]}</span> : r.cells[c.key]}
                        </td>
                      ))}
                      <td>{r.href && <Link href={r.href}>{t('ouvrir', 'open')} →</Link>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {result?.status === 'refused' && (
        <div className="panel">
          <h2>{t('Question non traduite', 'Question not translated')} <span className="badge red">{t('refus', 'refused')}</span></h2>
          <p>{result.message}</p>
          <p className="faint mono" style={{ fontSize: 12 }}>{t('motif', 'reason')}: {result.reason}</p>
        </div>
      )}

      <div className="panel">
        <h2>{t('Ce qu’OTTO sait interroger', 'What OTTO can query')} <span className="badge gray">{CATALOG.length}</span></h2>
        <p className="faint">
          {t(
            'Catalogue fermé : chaque requête est écrite et revue par un humain. L’IA choisit une entrée, jamais le SQL.',
            'Closed catalogue: every query is human-written and reviewed. The AI picks an entry, never the SQL.',
          )}
        </p>
        <table className="data">
          <tbody>
            {CATALOG.map((tpl) => (
              <tr key={tpl.id}>
                <td><Link href={`/eng/${id}/ask?tpl=${tpl.id}`}>{tpl.label[lang]}</Link></td>
                <td className="faint">« {tpl.examples[lang]} »</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
