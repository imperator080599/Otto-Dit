import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireMember } from '@/lib/core/auth';
import { ask, runCatalogue, type AskResult } from '@/lib/services/query/ask';
import { CATALOG } from '@/lib/services/query/catalog';
import { tr, locale } from '@/lib/i18n';

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
  /* LE TROISIÈME MÉCANISME DE TRADUCTION EST MORT (revue n°3). Cet écran
     portait son propre `t(fr, en)` — deux littéraux par phrase, invisibles à
     tout détecteur, et une langue prise sur la MISSION là où toutes les autres
     la prennent sur le CABINET. Il lit le catalogue comme les autres. */
  const t = await tr();
  /* Le catalogue de requêtes porte ses libellés dans les deux langues : c'est du
     CONTENU (la méthode), pas de l'interface. Il se lit dans la locale servie. */
  const l = await locale();

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
        <h2>{t('commun.interroger')}</h2>
        <p className="faint">
          {t('ask.explication')}
        </p>
        <form action={askAction} className="row" style={{ gap: 8 }}>
          <input
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder={t('ask.exemple')}
            style={{ flex: 1, minWidth: 320 }}
          />
          <button className="btn">{t('ask.interroger')}</button>
        </form>
      </div>

      {result?.status === 'answered' && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>
              {result.label} <span className="badge gray">{result.rows.length}</span>
            </h2>
            <span className="badge violet">
              {t('ask.traduction')}:{' '}
              {result.planner === 'rules'
                ? t('ask.regleDeterministe')
                : result.planner === 'llm'
                  ? t('ask.iaValidee')
                  : t('ask.choixExplicite')}
            </span>
          </div>
          <p className="faint mono" style={{ fontSize: 12 }}>
            {t('ask.requeteExecutee')}: {result.templateId}
            {result.params.map((p) => ` · ${p.label} = ${p.value}`).join('')}
          </p>
          {result.rows.length === 0 ? (
            <p className="muted">{t('ask.aucunEnregistrement')}</p>
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
                      <td>{r.href && <Link href={r.href}>{t('ask.ouvrir')} →</Link>}</td>
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
          <h2>{t('ask.questionNonTraduite')} <span className="badge red">{t('commun.refuse')}</span></h2>
          <p>{result.message}</p>
          <p className="faint mono" style={{ fontSize: 12 }}>{t('ask.motif')}: {result.reason}</p>
        </div>
      )}

      <div className="panel">
        <h2>{t('ask.ceQuOttoSaitInterroger')} <span className="badge gray">{CATALOG.length}</span></h2>
        <p className="faint">
          {t('ask.catalogueFerme')}
        </p>
        <table className="data">
          <tbody>
            {CATALOG.map((tpl) => (
              <tr key={tpl.id}>
                <td><Link href={`/eng/${id}/ask?tpl=${tpl.id}`}>{tpl.label[l]}</Link></td>
                <td className="faint">« {tpl.examples[l]} »</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
