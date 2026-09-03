import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/core/auth';
import { q } from '@/lib/db/client';
import { vuePoste, type EtatBloc, type BlocPoste } from '@/lib/services/poste';
import { visiter } from '@/lib/services/sections';
import { modeSonde } from '@/lib/core/sonde';
import { notesPourEcran } from '@/lib/services/workpapers/lifecycle';
import { fmtEur } from '@/lib/kernel/canon';
import { tr, locale } from '@/lib/i18n';
import type { CleLibelle } from '@/lib/i18n/catalogue';
import { Annotable } from '@/app/annotable';
import { Repli } from '@/app/repli';
import { AncresNav } from '@/app/ancres-nav';
import { BandeauRefus } from '@/app/bandeau-refus';
import { poserNoteAncreeAction, repondreNoteAction, transitionNoteAction } from '../../notes/actions';
import { phraseOrigineN1, signe, pct } from '@/lib/services/analytique-vue';
import { enregistrerAnalytiqueAction, proposerAnalytiqueAction } from './actions';

// L'ANATOMIE D'UNE PAGE DE POSTE (mandat de la soirée, §2) — telle qu'un
// cabinet la tient.
//
//   2.1  L'EN-TÊTE : le poste, l'exercice, l'origine des chiffres N-1 ; à
//        droite, les trois VISAS compacts (nom, date, état) — un visa périmé se
//        lit là, jamais en bas de page.
//   2.2  LA LEADSHEET : compte · intitulé · solde N · solde N-1 · variation ·
//        variation % · XREF. La variation renvoie à la revue analytique du
//        dossier ; sous la leadsheet, LA REVUE ANALYTIQUE du poste, éditable —
//        le même objet que la section du dossier, versionné, jamais effacé.
//   2.3  LES SOUS-SECTIONS, repliables et mémorisées : processus, contrôle
//        interne, risques, échantillon, testing, papiers (référence, visa,
//        date, lien), écarts (avec le papier), demandes au client.
//        « Ce qui reste ouvert » disparaît : ce qu'il comptait vit dans les
//        sections qui le portent, et le compte de notes ouvertes en en-tête.
//   2.4  LES ONGLETS sont une navigation par ANCRES : soulignée, pas encadrée,
//        avec l'état de chaque section — un repère et un mot, pas une couleur.

export const dynamic = 'force-dynamic';

/* Le repère de forme d'un état — la couleur n'est jamais seule, et ici elle
   n'est pas du tout : un état n'est pas un problème. */
const REPERE: Record<EtatBloc, string> = { fait: '●', en_cours: '◐', a_faire: '○', sans_objet: '–' };
const WP_BADGE: Record<string, string> = { draft: 'gray', in_review: 'blue', reviewed: 'amber', signed: 'green', outdated: 'red' };

export default async function PostePage({
  params, searchParams,
}: {
  params: Promise<{ id: string; code: string }>;
  searchParams: Promise<{ erreur?: string; propose?: string; texte?: string; run?: string }>;
}) {
  const { id, code } = await params;
  const sp = await searchParams;
  const membreCourant = await requireMember(id);
  const { user } = membreCourant;
  /* QUI REGARDE, ET CE QU'IL PEUT (1.3, ADR-028) : seul un réviseur de la
     mission clôt une note, et jamais l'auteur. Le panneau latéral n'invente
     pas la règle — il reçoit la réponse du serveur et, quand le geste n'est
     pas offert, il écrit pourquoi. */
  const moi = { id: membreCourant.user.id, peutClore: ['manager', 'partner'].includes(membreCourant.membership.eng_role) };
  const t = await tr();
  const l = await locale();
  const ref = decodeURIComponent(code);
  const v = await vuePoste(id, ref);
  if (!v) notFound();

  /* « Recent » est un journal de CONSULTATION : il se remplit en ouvrant —
     sauf sous la SONDE, qui ne laisse rien, pas même une visite (le témoin
     compte section_visit ; revue hostile de la soirée). */
  if (!(await modeSonde())) await visiter(id, 'poste', ref, user.id);

  const base = `/eng/${id}`;
  const chemin = [base, 'poste', encodeURIComponent(ref)].join('/');
  const eur = (cents: number) => fmtEur(cents, l);
  const marques = await notesPourEcran(id);
  const membres = await q<{ id: string; nom: string }>(
    `select u.id::text id, u.name nom from engagement_member m join app_user u on u.id = m.user_id
     where m.engagement_id = $1 and m.exited_on is null order by u.name`,
    [id],
  );
  const etat = (b: BlocPoste) => ({ repere: REPERE[b.etat], libelle: t(`poste.etat.${b.etat}` as CleLibelle) });
  const bloc = (cle: BlocPoste['cle']) => v.blocs.find((b) => b.cle === cle)!;
  /* PROCESSUS et CONTRÔLE INTERNE se comptent sur le DOSSIER (le lien poste ↔
     cycle n'est pas modélisé, poste.ts le dit) : l'état par section le dit
     aussi, sinon chaque poste lirait « fait » sur le travail d'un autre. */
  const resume = (b: BlocPoste) => t(b.resume.cle, b.resume.vars)
    + (b.cle === 'processus' || b.cle === 'controle-interne' ? ` · ${t('poste.resume.dossierEntier')}` : '');
  const propose = sp.propose === '1' && Boolean(sp.texte);
  const rev = v.analytique;

  /* Une cellule annotable de la leadsheet : l'ancre est l'identité métier —
     le poste, le compte, la colonne — jamais la ligne du tableau. */
  const cellule = (numero: string, champ: 'solde' | 'variation', libelle: string, contenu: React.ReactNode) => (
    <Annotable moi={moi} repondre={repondreNoteAction} transitionner={transitionNoteAction}
      ancre={{ kind: 'compte', aRef: `${ref}|${numero}`, field: champ, label: `${numero} · ${libelle}` }}
      marques={marques[`compte|${ref}|${numero}|${champ}`] ?? []}
      membres={membres} engagementId={id} chemin={chemin} notesHref={`${base}/notes`}
      action={poserNoteAncreeAction}>
      {contenu}
    </Annotable>
  );
  const tiret = <span className="faint">—</span>;
  /* La variation renvoie à la revue analytique du DOSSIER (§2.2). */
  const variation = (c: (typeof v.comptes)[number]) => (c.variationCents === null ? tiret
    : cellule(c.number, 'variation', t('poste.variation'),
      <Link href={`${base}/analytique#${encodeURIComponent(ref)}`} title={t('poste.variationVersAnalytique')}>{signe(c.variationCents, eur)}</Link>));

  return (
    <div className="stack poste" data-poste={ref}>
      <BandeauRefus erreur={sp.erreur} />

      {/* 2.1 — L'EN-TÊTE, visas à droite. */}
      <header className="entete-poste" data-entete-poste>
        <div>
          <h2>{v.fsli.name}</h2>
          <div className="faint entete-poste-sous">
            <span className="mono">{v.fsli.code}</span>
            {' · '}{t(v.fsli.statement === 'BS' ? 'rail.groupe.bilan' : 'rail.groupe.resultat')}
            {' · '}{t('poste.exercice', { periode: v.periode.n })}
            {' · '}<Link href={`${base}/notes`} data-notes-ouvertes={v.notes}>{t('poste.notesOuvertes', { n: v.notes })}</Link>
            {' · '}<Link href={`${base}/reconciliation`}>{t('poste.trialBalance')}</Link>
          </div>
          <p className="faint" style={{ margin: '4px 0 0' }} data-origine-n1={v.origineN1.source}>{phraseOrigineN1(t, v.origineN1)}</p>
        </div>
        <div className="visas" data-visas aria-label={t('poste.visas')}>
          {v.visas.map((visa) => (
            <div key={visa.role} className={`visa ${visa.etat}`} data-visa={visa.role} data-visa-etat={visa.etat}>
              <span className="visa-role">{t(`visa.role.${visa.role}` as CleLibelle)}</span>
              <span className="visa-nom">{visa.nom ?? '—'}</span>
              <span className="visa-quand">{visa.quand ? visa.quand.slice(0, 10) : ' '}</span>
              <span className="visa-etat">
                {t(`poste.visa.${visa.etat}` as CleLibelle)}
                {visa.papier && <>{' · '}<Link href={`${base}/workpapers/${visa.papier.id}`}>{visa.papier.code}</Link></>}
              </span>
            </div>
          ))}
        </div>
      </header>

      {/* 2.4 — LA NAVIGATION PAR ANCRES. */}
      <AncresNav libelle={t('poste.ancres')}
        sections={v.blocs.map((b) => ({ id: b.cle, titre: t(b.titre), repere: REPERE[b.etat], etat: `${t(`poste.etat.${b.etat}` as CleLibelle)} — ${resume(b)}` }))} />

      {/* 2.2 — LA LEADSHEET N / N-1. */}
      <Repli cle="poste.leadsheet" id="leadsheet" titre={t('poste.leadsheet')} etat={etat(bloc('leadsheet'))} resume={resume(bloc('leadsheet'))}>
        <div className="table-scroll">
          <table className="data leadsheet" data-leadsheet>
            <thead>
              <tr>
                <th>{t('poste.account')}</th>
                <th>{t('poste.caption')}</th>
                <th className="num">{t('poste.soldeN')}</th>
                <th className="num">{t('poste.soldeN1')}</th>
                <th className="num">{t('poste.variation')}</th>
                <th className="num">{t('poste.variationPct')}</th>
                {/* La liste complète des papiers se rejoint par l'en-tête XREF :
                    elle porte le geste « rédiger le papier ». */}
                <th><Link href={`${base}/workpapers`}>{t('poste.xref')}</Link></th>
              </tr>
            </thead>
            <tbody>
              {v.comptes.map((c) => (
                <tr key={c.number} data-compte={c.number} className={c.presence === 'n1_seul' ? 'grise' : ''}>
                  <td className="mono">
                    {/* D'OÙ VIENT LE MONTANT : le compte renvoie à la balance
                        générale rapprochée du grand livre. */}
                    <Link href={`${base}/reconciliation`}>{c.number}</Link>
                  </td>
                  <td>
                    {c.label}
                    {c.presence !== 'les_deux' && <span className="faint"> · {t(`poste.presence.${c.presence}` as CleLibelle)}</span>}
                  </td>
                  <td className="num" data-solde-n>{cellule(c.number, 'solde', t('poste.soldeN'), eur(c.balanceCents))}</td>
                  <td className="num" data-solde-n1>{c.balanceN1Cents === null ? tiret : eur(c.balanceN1Cents)}</td>
                  <td className="num" data-variation>{variation(c)}</td>
                  <td className="num" data-variation-pct>{pct(c.variationPct, l)}</td>
                  <td className="mono">
                    {c.xref.length === 0 ? <span className="faint">—</span>
                      : c.xref.map((x, i) => (
                        <span key={x.id}>
                          {i > 0 && ' · '}
                          <Link href={`${base}/workpapers/${x.id}`}>{x.code}</Link>
                        </span>
                      ))}
                  </td>
                </tr>
              ))}
              {v.comptes.length === 0 && (
                <tr><td colSpan={7} className="faint">—</td></tr>
              )}
            </tbody>
            {v.comptes.length > 0 && (
              <tfoot>
                <tr data-leadsheet-total>
                  <th colSpan={2}>{t('poste.total')}</th>
                  <th className="num">{eur(v.totalCents)}</th>
                  <th className="num">{v.totalN1Cents === null ? '—' : eur(v.totalN1Cents)}</th>
                  <th className="num">{v.variationCents === null ? '—' : signe(v.variationCents, eur)}</th>
                  <th className="num">{pct(v.variationPct, l)}</th>
                  <th />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Repli>

      {/* 2.2 — LA REVUE ANALYTIQUE DU POSTE, sous la leadsheet. */}
      <div className="panel">
            <h2>{t('poste.analytique')}</h2>
        <p className="faint" style={{ marginTop: 0 }}>
          {t('poste.analytique.aide')} <Link href={`${base}/analytique#${encodeURIComponent(ref)}`}>{t('poste.analytique.globale')}</Link>
        </p>
        {rev && (
          <p className="faint" data-analytique-provenance data-analytique-version={rev.version}>
            {t('poste.analytique.redigee', { v: rev.version, qui: rev.auteur, quand: rev.quand.slice(0, 16) })}
            {' · '}{t(`poste.analytique.origine.${rev.origine}` as CleLibelle)}
            {rev.anterieures > 0 && <>{' · '}{t('poste.analytique.versions', { n: rev.anterieures })}</>}
          </p>
        )}
        {rev?.perimee && (
          <div className="panel warn" data-analytique-perimee>
            <span className="badge amber">{t('ana.perimee')}</span> {t('poste.analytique.perimee')}
          </div>
        )}
        {propose && (
          <div className="panel" data-analytique-propose>
            <span className="badge violet">OTTO</span> {t('poste.analytique.propose')}
          </div>
        )}
        {!rev && !propose && <p className="faint" data-analytique-vide>{t('poste.analytique.vide')}</p>}
        <form action={enregistrerAnalytiqueAction} data-analytique-form>
          <input type="hidden" name="engagement_id" value={id} />
          <input type="hidden" name="code" value={ref} />
          <input type="hidden" name="origine" value={propose ? 'proposee_validee' : 'humaine'} />
          <input type="hidden" name="engine_run_id" value={propose ? sp.run ?? '' : ''} />
          <textarea name="texte" className="analytique-texte" rows={5}
            defaultValue={sp.texte ?? rev?.texte ?? ''}
            placeholder={t('poste.analytique.placeholder')} data-analytique-texte />
          <div className="row mt" style={{ justifyContent: 'space-between' }}>
            <button type="submit" className="btn small" data-analytique-enregistrer>{t('poste.analytique.enregistrer')}</button>
          </div>
        </form>
        <form action={proposerAnalytiqueAction} className="mt">
          <input type="hidden" name="engagement_id" value={id} />
          <input type="hidden" name="code" value={ref} />
          <button type="submit" className="btn secondary small" data-analytique-proposer>{t('poste.analytique.proposer')}</button>
        </form>
      </div>

      {/* 2.3 — LES ÉTAPES DU TRAVAIL, chacune une sous-section repliable. */}
      {(['processus', 'controle-interne', 'risques', 'echantillon', 'testing'] as const).map((cle) => {
        const b = bloc(cle);
        return (
          <Repli key={cle} cle={`poste.${cle}`} id={cle} titre={t(b.titre)} etat={etat(b)} resume={resume(b)}>
            {cle === 'risques' && v.risques.length > 0 && (
              <table className="data" data-risques-du-poste>
                <thead><tr><th>{t('poste.risque.assertion')}</th><th>{t('poste.risque.niveau')}</th><th>{t('poste.risque.retenu')}</th></tr></thead>
                <tbody>
                  {v.risques.map((r) => (
                    <tr key={r.assertion}>
                      <td>{r.assertion}</td>
                      <td>{r.level}</td>
                      <td>{r.retained_level ?? <span className="faint">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {b.href && (
              <p className="row" style={{ marginBottom: 0 }}>
                <Link href={b.href} className="btn secondary small" data-ouvrir={cle}>{t('poste.ouvrir')} — {t(b.titre)}</Link>
              </p>
            )}
          </Repli>
        );
      })}

      {/* 2.3 — LES PAPIERS DU POSTE : référence, état de visa, date, lien. */}
      <Repli cle="poste.papiers" id="papiers" titre={t('col.workpapers')} etat={etat(bloc('papiers'))} resume={resume(bloc('papiers'))}>
        {v.papiers.length === 0 ? (
          <p className="faint" style={{ margin: 0 }}>{t('poste.papier.aucun')} <Link href={`${base}/workpapers`}>{t('poste.xref')}</Link></p>
        ) : (
          <table className="data" data-papiers-du-poste>
            <thead>
              <tr><th>{t('poste.xref')}</th><th>{t('col.title')}</th><th>{t('col.status')}</th><th>{t('poste.visas')}</th><th>{t('col.when')}</th></tr>
            </thead>
            <tbody>
              {v.papiers.map((w) => (
                <tr key={w.id} data-papier={w.code} data-papier-statut={w.status}>
                  <td className="mono"><Link href={`${base}/workpapers/${w.id}`}>{w.code}</Link> <span className="faint">v{w.version}</span></td>
                  <td>{w.title}</td>
                  <td><span className={`badge ${WP_BADGE[w.status] ?? 'gray'}`}>{w.status}</span></td>
                  <td className="faint">
                    {w.visas.length === 0 ? '—' : w.visas.map((s) => `${t(`visa.role.${s.role}` as CleLibelle)} ${s.nom} ${s.quand.slice(0, 10)}`).join(' · ')}
                  </td>
                  <td className="mono faint">{w.quand.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Repli>

      {/* 2.3 — LES ÉCARTS DU POSTE, avec le papier qui les porte. */}
      <Repli cle="poste.ecarts" id="ecarts" titre={t('poste.section.ecarts')} etat={etat(bloc('ecarts'))} resume={resume(bloc('ecarts'))}>
        {v.ecarts.liste.length === 0 ? (
          <p className="faint" style={{ margin: 0 }}>{t('poste.ecart.aucun')}</p>
        ) : (
          <table className="data" data-ecarts-du-poste>
            <thead>
              <tr><th>{t('poste.exceptions')}</th><th>{t('col.status')}</th><th>{t('poste.ecart.papier')}</th></tr>
            </thead>
            <tbody>
              {v.ecarts.liste.map((x) => (
                <tr key={x.id} data-ecart={x.id}>
                  <td>
                    <Link href={`${base}/exceptions`}><span className="mono">{x.taxonomy_code}</span></Link>
                    {x.piece_ref && <span className="mono faint"> {x.piece_ref}</span>}
                    <div className="faint">{x.description}</div>
                  </td>
                  <td>
                    {['resolved', 'scope_limitation'].includes(x.status)
                      ? <span className="badge gray">{x.status}</span>
                      : <span className="badge red">{x.status}</span>}
                  </td>
                  <td className="mono">
                    {x.papier ? <Link href={`${base}/workpapers/${x.papier.id}`} data-ecart-papier>{x.papier.code}</Link> : <span className="faint">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="faint" style={{ marginBottom: 0 }} data-ecarts-comptes={`${v.ecarts.ouverts}/${v.ecarts.total}`}>
          {t('poste.resume.ecarts', { ouverts: v.ecarts.ouverts, total: v.ecarts.total })}
          {' · '}<Link href={`${base}/exceptions`}>{t('poste.ecart.dossier', { ouverts: v.ecarts.dossierOuverts, total: v.ecarts.dossierTotal })}</Link>
        </p>
      </Repli>

      {/* 2.3 — LES DEMANDES AU CLIENT DU POSTE. */}
      <Repli cle="poste.demandes" id="demandes" titre={t('rail.demandes')} etat={etat(bloc('demandes'))} resume={resume(bloc('demandes'))}>
        {v.demandes.length === 0 ? (
          <p className="faint" style={{ margin: 0 }}>{t('poste.demande.aucune')} <Link href={`${base}/requests`}>{t('rail.demandes')}</Link></p>
        ) : (
          <table className="data" data-demandes-du-poste>
            <thead>
              <tr><th>#</th><th>{t('col.title')}</th><th>{t('col.status')}</th><th>{t('col.due')}</th><th>{t('rail.demandes')}</th></tr>
            </thead>
            <tbody>
              {v.demandes.map((d) => (
                <tr key={d.id} data-demande={d.seq_no}>
                  <td className="mono"><Link href={`${base}/requests/${d.id}`}>{d.seq_no}</Link></td>
                  <td>{d.title}</td>
                  <td><span className="badge gray">{d.status}</span></td>
                  <td className="mono faint">{d.due_date ? d.due_date.slice(0, 10) : '—'}</td>
                  <td className="faint">{t('poste.demande.items', { faits: d.faits, items: d.items })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Repli>
    </div>
  );
}
