import { NextResponse } from 'next/server';
import { q, q01 } from '@/lib/db/client';
import { demoPublique } from '@/lib/core/demo-public';
import { dbKind } from '@/lib/db/client';
import { versionServie } from '@/lib/version';
import { sansLocataire } from '@/lib/db/sans-locataire';

// LA SANTÉ DE L'INSTANCE DÉPLOYÉE — `/api/sante`.
//
// POURQUOI CE CHEMIN EXISTE (revue utilisateur n°1). 529 tests, 78 routes
// balayées et 144 étapes cliquées s'exécutent en local, sur PGlite, avec le
// dépôt entier sur le disque. Le déploiement, lui, tourne dans une fonction
// serverless qui n'emporte QUE les fichiers tracés, sur un Postgres réseau.
// Trois écrans ont rendu 500 en ligne pendant que tout était vert ici, pour un
// dossier oublié dans le traçage — et personne ne l'a su avant qu'un humain
// clique.
//
// Ce chemin exécute, DANS la fonction déployée, les lectures dont dépend chaque
// famille d'écrans, et dit laquelle échoue. Il ne remplace pas le balayage des
// écrans (`npm run fumee`, qui les OUVRE vraiment) : il est ce qu'on peut
// interroger en un seul appel, y compris depuis un réseau qui ne peut pas
// atteindre l'application.

export const dynamic = 'force-dynamic';

interface Lecture { nom: string; ok: boolean; vide?: boolean; detail: string }

/**
 * UNE LECTURE VIDE N'EST PAS UNE LECTURE QUI PASSE (revue hostile n°9,
 * constat 7). La première version marquait `ok: true` avec « 0 élément(s) » :
 * sous un rôle sans BYPASSRLS et sans locataire, TOUTES les lectures rendraient
 * zéro ligne sans erreur, et la sonde aurait répondu « toutes les lectures
 * passent · 200 » sur une base entièrement aveugle. L'instrument aurait été
 * structurellement incapable de voir l'incident qu'il existe pour détecter.
 */
async function essayer(nom: string, fn: () => Promise<unknown>): Promise<Lecture> {
  try {
    const v = await fn();
    const vide = Array.isArray(v) ? v.length === 0
      : v === null || v === undefined ? true
        : typeof v === 'string' ? v.trim() === '' || /^(aucun|0 )/i.test(v.trim())
          : false;
    const detail = Array.isArray(v) ? `${v.length} élément(s)`
      : v === null || v === undefined ? 'vide'
        : typeof v === 'object' ? 'objet' : String(v);
    if (vide) {
      /* PAS `ok: false` — une lecture légitimement vide (un monde neuf, une
         fonctionnalité jamais employée) n'est pas une panne, et un 500 ici
         casserait le balayage des écrans sans rien apprendre. Mais le vide est
         NOMMÉ, compté, et il remonte dans le verdict : c'est exactement le
         silence que la règle 13 traque, et il cesse d'être silencieux. */
      return { nom, ok: true, vide: true, detail: `VIDE — ${detail}` };
    }
    return { nom, ok: true, detail };
  } catch (e) {
    return { nom, ok: false, detail: e instanceof Error ? e.message.split('\n')[0].slice(0, 300) : String(e) };
  }
}

export async function GET() {
  if (!demoPublique()) {
    return new NextResponse('Ce chemin n’existe que sur la démonstration publique.', { status: 404 });
  }
  /* SONDE PUBLIQUE, SANS COOKIE — dérogation NOMMÉE (clé « sante »). Elle ne
     sert QUE la démonstration publique, et elle n'est JAMAIS le test
     d'isolation entre cabinets : celui-là se conduit par l'acceptation avec
     deux identités de deux cabinets (docs/PLAN_RLS.md, A.6). */
  return sansLocataire('sante', () => corpsDeLaSonde());
}

async function corpsDeLaSonde() {
  /* LE DOSSIER QUE LA SONDE DÉCRIT — et le premier choix était FAUX.
     `order by created_at limit 1` prenait le PLUS ANCIEN dossier d'audit
     légal : en local, c'est le dossier de l'exercice PRÉCÉDENT (FY2024, celui
     que la reprise construit), pas celui que la démonstration montre. La sonde
     décrivait donc un autre objet que celui dont elle parlait (règle 16), et
     rendait « 0 papier · 0 section · 0 écart » en VERT sur un monde plein.
     Personne ne l'a vu tant qu'une lecture vide passait pour une lecture qui
     passe : c'est le compteur de vides, écrit une heure plus tôt, qui l'a
     dénoncé. On prend désormais le dossier de l'exercice le plus RÉCENT, et
     l'ordre est déterministe jusqu'au dernier critère. */
  const eng = await q01<{ id: string }>(
    `select e.id::text from engagement e join period p on p.id = e.period_id
     where e.kind = 'statutory_audit'
     order by p.end_date desc, e.created_at desc, e.id limit 1`)
    .catch(() => null);

  const lectures: Lecture[] = [];
  lectures.push(await essayer('base : une mission existe', async () => eng?.id ?? null));

  /* LA MÉTHODE DU CABINET — la lecture qui manquait, et qui a cassé trois
     écrans : elle importe un fichier du DÉPÔT à l'exécution. */
  lectures.push(await essayer('méthode du cabinet (methodology/valider.mjs)', async () => {
    const { catalogueDeLaMission } = await import('@/lib/methodology/depot');
    return eng ? (await catalogueDeLaMission(eng.id)).procedures.length : 'aucune mission';
  }));

  if (eng) {
    const id = eng.id;
    lectures.push(await essayer('acceptation', async () => {
      const { currentAcceptation } = await import('@/lib/services/acceptance');
      return currentAcceptation(id);
    }));
    lectures.push(await essayer('équipe et indépendance', async () => {
      const { anciennetes } = await import('@/lib/services/team');
      return anciennetes(id);
    }));
    lectures.push(await essayer('obstacles au visa', async () => {
      const { obstaclesAuVisa } = await import('@/lib/services/obstacles');
      return obstaclesAuVisa(id);
    }));
    lectures.push(await essayer('postes (FSLI) et périmètre', async () => {
      const { listFslis } = await import('@/lib/services/fsli');
      return listFslis(id);
    }));
    lectures.push(await essayer('circularisations', async () => {
      const { rapprochement } = await import('@/lib/services/circularisations');
      return (await rapprochement(id, 'banque')).lignes;
    }));
    lectures.push(await essayer('papiers de travail', async () => {
      const { listWorkpapers } = await import('@/lib/services/workpapers/lifecycle');
      return listWorkpapers(id);
    }));
    lectures.push(await essayer('rail de destinations', async () => {
      const { railDuDossier } = await import('@/lib/services/rail');
      const { frameworkSet } = await import('@/lib/services/fsli');
      const { traduire } = await import('@/lib/i18n/catalogue');
      return railDuDossier(id, (await frameworkSet(id)).assurance_packs,
        (c, v) => traduire('en', c, v));
    }));
    /* LES DEUX ÉCRANS NEUFS DE LA CHARPENTE (ADR-112). Ils ne se prouvent pas
       par la chaîne locale : c'est la fonction déployée qui doit les lire. */
    lectures.push(await essayer('vue d’ensemble (sections, avancement, attributions)', async () => {
      const { mesSections, avancement, sectionsDuDossier } = await import('@/lib/services/sections');
      const secs = await sectionsDuDossier(id);
      const av = await avancement(id);
      /* ON MESURE LES SECTIONS, PAS UN MEMBRE PRIS AU HASARD. La première
         version interrogeait le premier membre venu et rapportait « 0 / 0 / 0 /
         0 » sur un monde où les quatre mécanismes étaient posés : un chiffre
         faux qui rassure dans un sens comme dans l'autre. */
      const compte = (await q01<{ detenues: string; attribuees: string; suivies: string; vues: string }>(
        `select count(*) filter (where s.holder_id is not null)::text detenues,
                count(*) filter (where s.owner_id is not null)::text attribuees,
                (select count(distinct section_id) from section_watch w
                 join section_state s2 on s2.id = w.section_id where s2.engagement_id = $1)::text suivies,
                (select count(distinct section_id) from section_visit v
                 join section_state s3 on s3.id = v.section_id where s3.engagement_id = $1)::text vues
         from section_state s where s.engagement_id = $1`, [id]))!;
      /* Et on vérifie que la lecture PAR PERSONNE tourne, sur quelqu'un qui
         détient vraiment quelque chose. */
      const porteur = await q01<{ id: string; nom: string }>(
        `select u.id::text, u.name nom from section_state s join app_user u on u.id = s.holder_id
         where s.engagement_id = $1 limit 1`, [id]);
      const mes = porteur ? await mesSections(porteur.id) : null;
      return `${secs.length} section(s) · ${av.map((a) => `${a.statut}:${a.n}`).join(' ')} · `
        + `détenues ${compte.detenues} / attribuées ${compte.attribuees} / `
        + `suivies ${compte.suivies} / vues ${compte.vues}`
        + (mes ? ` · ${porteur!.nom} : ${mes.detenues.length} détenue(s), ${mes.attribuees.length} attribuée(s), `
          + `${mes.suivies.length} suivie(s), ${mes.recentes.length} récente(s)` : ' · personne ne détient de section');
    }));
    lectures.push(await essayer('information produite par l’entité (IPE)', async () => {
      const { lireIpe, obstaclesIpe } = await import('@/lib/services/ipe');
      const w = await q01<{ id: string; code: string }>(
        `select id::text, code from workpaper where engagement_id = $1 order by code limit 1`, [id]);
      if (!w) return 'aucun papier';
      const i = await lireIpe(w.id);
      const o = await obstaclesIpe(id);
      return `${w.code} : ${i ? (i.utilisee ? `oui, ${i.nature}, ${i.evidenceNom}` : 'non') : 'SANS RÉPONSE'}`
        + ` · ${o.length} papier(s) sans réponse`;
    }));
    lectures.push(await essayer('catalogue de libellés (langue du cabinet)', async () => {
      const { localeDuCabinet } = await import('@/lib/i18n');
      const { traduire } = await import('@/lib/i18n/catalogue');
      const t = await q01<{ id: string }>(
        `select tenant_id::text id from engagement where id = $1`, [id]);
      const l = await localeDuCabinet(t!.id);
      return `${l} → « ${traduire(l, 'vue.assignments')} »`;
    }));
    lectures.push(await essayer('espace de travail d’un poste', async () => {
      const { postesRetenus } = await import('@/lib/services/rail');
      const { vuePoste } = await import('@/lib/services/poste');
      const postes = await postesRetenus(id);
      if (postes.length === 0) return 'aucun poste retenu';
      const v = await vuePoste(id, postes[0].code);
      return v ? `${postes[0].code} · ${v.comptes.length} compte(s) · ${v.blocs.length} étape(s)` : 'poste introuvable';
    }));
    /* LA REMISE À ZÉRO (DA-17) : l'instantané existe-t-il, et correspond-il au
       schéma ? Un bouton dont la condition n'est vraie nulle part est un geste
       mort — et cela ne se verrait qu'au moment où quelqu'un l'utilise.
       ON NE L'EXIGE QUE LÀ OÙ IL DOIT EXISTER : l'instantané est pris par le
       BUILD (`deploy:reconstruire`). Sur une instance locale lancée en mode
       démonstration pour un harnais, son absence est normale — l'exiger
       partout ferait échouer un contrôle sain, ce qui apprend à ignorer les
       contrôles. */
    lectures.push(await essayer('instantané du monde de démonstration', async () => {
      const { etatInstantane } = await import('@/lib/services/monde-demo');
      const surVercel = process.env.VERCEL === '1';
      const e = await etatInstantane();
      if (!e.existe) {
        if (surVercel) throw new Error('aucun instantané : « remettre à zéro » refuserait');
        return 'absent (normal hors déploiement : il est pris par le build)';
      }
      if (!e.aJour) throw new Error(`instantané périmé : ${e.desaccords.slice(0, 2).join(' · ')}`);
      return `pris le ${e.prisLe}`;
    }));
    /* CE QUI A ÉTÉ LIVRÉ AUJOURD'HUI EST LU PAR LA SONDE LE JOUR MÊME (§0.4) :
       la grille de test, l'échantillonnage, les écarts — sinon la fonction la
       plus récente est hors du seul instrument interrogeable de l'extérieur. */
    lectures.push(await essayer('revue analytique du poste (N/N-1, texte versionné)', async () => {
      const { postesRetenus } = await import('@/lib/services/rail');
      const { leadsheetDuPoste, lireAnalytique } = await import('@/lib/services/analytique');
      const postes = await postesRetenus(id);
      if (postes.length === 0) return 'aucun poste retenu';
      const ls = await leadsheetDuPoste(id, postes[0].code);
      const r = await lireAnalytique(id, postes[0].code, ls.empreinte);
      return `${postes[0].code} · N-1 : ${ls.origine.source} · ${ls.lignes.length} ligne(s) · revue ${r ? `v${r.version}${r.perimee ? ' PÉRIMÉE' : ''}` : 'non rédigée'}`;
    }));
    /* LE MONDE ENRICHI (mandat de nuit n°2, 1.1) : ce que le fondateur verra —
       des sections aux quatre états, des papiers à des visas différents, des
       notes qui datent, des lignes conclues. Compté ici le jour même. */
    lectures.push(await essayer('monde enrichi (sections par état, papiers par statut, notes ouvertes, lignes conclues)', async () => {
      const { avancement } = await import('@/lib/services/sections');
      const { lignesNonConclues } = await import('@/lib/services/testing/grille');
      const etats = (await avancement(id)).filter((x) => x.n > 0).map((x) => `${x.statut}:${x.n}`);
      const papiers = await q<{ status: string; n: string }>(
        `select w.status, count(*)::text n from workpaper w join procedure_instance p on p.id = w.procedure_id
         where w.engagement_id = $1 and p.fsli_code = 'REVENUE' group by w.status order by w.status`, [id]);
      const notes = await q01<{ n: string; age: string }>(
        `select count(*)::text n, coalesce(max(extract(day from now() - created_at))::int, 0)::text age
         from review_note where engagement_id = $1 and status = 'open'`, [id]);
      const lignes = await lignesNonConclues(id);
      return `sections ${etats.join(' ')} · papiers CA ${papiers.map((p) => `${p.status}:${p.n}`).join(' ')}`
        + ` · ${notes?.n ?? 0} note(s) ouverte(s), la plus ancienne ${notes?.age ?? 0} j · lignes conclues ${lignes.total - lignes.nonConclues}/${lignes.total}`;
    }));
    lectures.push(await essayer('replis mémorisés par personne (ui_repli, 0132)', async () => {
      const { compterReplis } = await import('@/lib/services/replis');
      const r = await compterReplis();
      return `${r.replis} rangement(s) chez ${r.personnes} personne(s) · dernier ${r.dernier ?? '—'}`;
    }));
    lectures.push(await essayer('échantillonnage (sélection tirée)', async () => {
      const { currentRevenueSample } = await import('@/lib/services/sampling');
      const s = await currentRevenueSample(id);
      return s ? `${s.status} · ${s.items.length} ligne(s) · graine ${s.seed}` : 'aucune sélection';
    }));
    lectures.push(await essayer('grille de test (cellules, conclusions)', async () => {
      const { cellulesDuDossier } = await import('@/lib/services/testing/grille');
      const g = await cellulesDuDossier(id);
      if (!g.grille) return 'aucune grille calculée';
      const cellules = Object.values(g.cellules).flat();
      return `v${g.grille.version} · ${g.grille.colonnes.length} colonne(s) · ${cellules.length} cellule(s) · `
        + `${cellules.filter((c) => c.etat === 'conforme').length} conforme(s) · ${Object.keys(g.conclusions).length} ligne(s) conclue(s)`;
    }));
    lectures.push(await essayer('écarts (exceptions)', async () => {
      const { listExceptions } = await import('@/lib/services/matching');
      const x = await listExceptions(id);
      return `${x.length} écart(s) · ${x.filter((e) => e.status === 'open').length} ouvert(s)`;
    }));
    /* LE RE-TIRAGE (ADR-133, étage 1.2 — livré ce jour, lu ce jour). Deux
       chiffres, et le second est celui qui compte : combien de lignes du
       tirage courant REPRENNENT le travail d'un tirage précédent, et combien
       de lignes en sont sorties SANS être statuées. Une instance qui aurait
       re-tiré en perdant les pièces du client rendrait « 0 reprise » là où le
       journal montre un ré-import — et c'est exactement ce qui s'est passé
       jusqu'à cette nuit, sans qu'aucun instrument ne puisse le dire. */
    lectures.push(await essayer('re-tirage : reprises et sorties statuées', async () => {
      const { lignesSortiesDuTirage } = await import('@/lib/services/sampling');
      const r = await q01<{ n: string }>(
        `select count(*) n from sample_item si join sample s on s.id = si.sample_id
          where s.engagement_id = $1 and s.status = 'drawn' and si.repris_de is not null`, [id]);
      const sorties = await lignesSortiesDuTirage(id);
      return `${r?.n ?? 0} ligne(s) reprise(s) · ${sorties.length} sortie(s) porteuse(s) de travail, `
        + `dont ${sorties.filter((l) => l.decision === null).length} à statuer`;
    }));
    /* LE PROGRAMME DE TRAVAIL (étage 1.1 — livré ce jour, lu ce jour). Deux
       chiffres qui disent si l'écran a de quoi parler : ce que le risque
       commande, et ce qui est planifié en face. Un « 0 commandée » sur un
       dossier dont le risque est évalué serait le signe que la méthode ne
       commande plus rien — exactement ce que personne ne verrait sans cette
       ligne. */
    lectures.push(await essayer('programme de travail (commandé / planifié)', async () => {
      const { programmeDuDossier } = await import('@/lib/services/programme');
      const postes = await programmeDuDossier(id);
      if (postes.length === 0) return 'aucun poste retenu';
      const commandees = postes.reduce((n, p) => n + p.commandees.length, 0);
      const planifiees = postes.reduce((n, p) => n + p.commandees.filter((l) => l.planifiee).length, 0);
      const hors = postes.reduce((n, p) => n + p.horsCommande.length, 0);
      const evalues = postes.filter((p) => p.risqueEvalue).length;
      /* ELLE PEUT ROUGIR, ET C'EST TOUT L'INTÉRÊT (revue hostile de la nuit,
         constat 5). La première version rendait une phrase commençant par le
         nombre de postes : « 15 poste(s) · 0 commandée(s) … » passait le
         prédicat de vacuité (ancré au début) et la lecture était verte sur le
         cas même qu'elle disait surveiller — quatrième récidive de la famille
         « /api/sante braqué à côté ». Un poste évalué qui ne commande RIEN est
         désormais une erreur, pas une phrase. */
      if (evalues > 0 && commandees === 0) {
        throw new Error(`${evalues} poste(s) évalué(s) et AUCUNE procédure commandée `
          + '— la méthode ne commande plus rien, ou le catalogue n’est plus lu');
      }
      return `${postes.length} poste(s) dont ${evalues} évalué(s) · ${commandees} commandée(s) · `
        + `${planifiees} planifiée(s) · ${hors} planifiée(s) hors commande`;
    }));
    /* LE DÉTAIL DU COMPTE (étape 1, plan d'autonomie §B — livré ce jour, lu ce
       jour, règle 22). demanderDetailDeCompte (requests.ts) pose toujours les
       deux colonnes ensemble ; la seule façon d'obtenir l'une sans l'autre est
       une écriture qui contourne le service — exactement ce que cette lecture
       doit pouvoir attraper (pas un compte qui se contente d'exister). */
    lectures.push(await essayer('détail du compte (plan d’autonomie, étape 1)', async () => {
      const { EVIDENCE_TYPE_DETAIL_DE_COMPTE } = await import('@/lib/services/requests');
      const rows = await q<{ id: string; fsli_code: string | null }>(
        `select id, fsli_code from request where evidence_type_code = $1`, [EVIDENCE_TYPE_DETAIL_DE_COMPTE]);
      const sansFsli = rows.filter((r) => !r.fsli_code);
      if (sansFsli.length > 0) {
        throw new Error(`${sansFsli.length} demande(s) « détail du compte » SANS poste (fsli_code) — `
          + 'demanderDetailDeCompte ne produit jamais ce cas : la ligne a été écrite ailleurs, ou la colonne a été modifiée après coup');
      }
      if (rows.length === 0) return 'aucune demande de détail de compte encore créée';
      return `${rows.length} demande(s) de détail de compte, chacune rattachée à son poste`;
    }));
    /* LE RAPPROCHEMENT (étape 2, plan d'autonomie §B — livré ce jour, lu ce
       jour, règle 22). rapprocherDetailDeCompte (account-detail.ts) refuse
       de marquer `rapprochee` sur un écart non nul sans explication (POP-02)
       — la seule façon d'obtenir l'incohérence ci-dessous est de la même
       manière que la lecture précédente : contourner le service. */
    lectures.push(await essayer('détail du compte : rapprochement (plan d’autonomie, étape 2)', async () => {
      const rows = await q<{ id: string; ecart_cents: string; rapprochee: boolean; ecart_explication: string | null }>(
        `select id, ecart_cents::text, rapprochee, ecart_explication from account_detail_import`);
      const sansExplication = rows.filter((r) => r.rapprochee && Number(r.ecart_cents) !== 0 && !r.ecart_explication?.trim());
      if (sansExplication.length > 0) {
        throw new Error(`${sansExplication.length} rapprochement(s) conclu(s) avec un écart NON NUL et AUCUNE explication — `
          + 'rapprocherDetailDeCompte ne produit jamais ce cas (POP-02) : contourné, ou la colonne a été modifiée après coup');
      }
      if (rows.length === 0) return 'aucun détail de compte encore importé';
      const conclus = rows.filter((r) => r.rapprochee).length;
      const avecEcart = rows.filter((r) => Number(r.ecart_cents) !== 0).length;
      return `${rows.length} import(s) · ${conclus} rapproché(s) · ${avecEcart} avec écart`;
    }));
    /* POP-01 (étape 3-4, plan d'autonomie §B — livré ce jour, lu ce jour,
       règle 22). proposeRevenueSample (sampling.ts) refuse de créer une
       ligne `sample` pour le chiffre d'affaires sans un détail de compte
       RAPPROCHÉ pour REVENUE (populationDuDetailRapproche, account-detail.ts).
       La seule façon d'obtenir l'incohérence ci-dessous, POUR UN NOUVEAU
       tirage, est de contourner le service — un futur appel direct en base,
       ou une régression qui retire le contrôle sans y penser.
       CE QUE CETTE LECTURE NE FAIT PAS (règle 19) : elle ne rougit pas sur
       R47 — un seul échantillon RÉEL (tiré, drawn, le 2026-09-01 par
       `npm run demo:seed`, AVANT que POP-01 n'existe), dont la grille de
       test et les demandes déjà envoyées dépendent en aval. Le rapprocher
       après coup fabriquerait une pièce et un rapprochement que personne
       n'a faits, à une date inventée — exactement ce que la règle 31
       interdit ; le supprimer détruirait du contenu de dossier réel (règle
       28). R47 (docs/BACKLOG_REPORTE.md) le nomme par son id, daté, une
       fois : tout AUTRE échantillon hors de cette liste reste une régression
       CASSÉE, jamais un « déjà vu ». */
    lectures.push(await essayer('POP-01 : aucun tirage sans rapprochement (étapes 3-4)', async () => {
      const LEGACY_AVANT_POP01 = [
        '5d1df8b7-4ba8-4d55-8f8d-1f2d45de6710', // R47 : NEP FY2025, tiré 2026-09-01, avant POP-01 (60e1dfe, 2026-09-07)
      ];
      const rows = await q<{ id: string; engagement_id: string }>(
        `select s.id, s.engagement_id from sample s
         join procedure_instance pi on pi.id = s.procedure_id
         where pi.fsli_code = 'REVENUE'
           and not exists (
             select 1 from account_detail_import a
             where a.engagement_id = s.engagement_id and a.fsli_code = 'REVENUE' and a.rapprochee = true
           )`);
      const nouveaux = rows.filter((r) => !LEGACY_AVANT_POP01.includes(r.id));
      const connus = rows.length - nouveaux.length;
      if (nouveaux.length > 0) {
        throw new Error(`${nouveaux.length} sample(s) « chiffre d’affaires » SANS AUCUN détail de compte rapproché, hors R47 — `
          + 'proposeRevenueSample ne produit jamais ce cas (POP-01) : contourné, ou la garde a été retirée par régression');
      }
      const total = await q01<{ n: string }>(`select count(*) n from sample s join procedure_instance pi on pi.id = s.procedure_id where pi.fsli_code = 'REVENUE'`);
      if (!total || Number(total.n) === 0) return 'aucun tirage encore proposé';
      const n = Number(total.n);
      /* « tous rapprochés » ne s'affirme QUE si c'est vrai — trouvé par la
         revue hostile (workflow, 2 réviseurs indépendants) : la version
         précédente écrivait « tous rapprochés avant tirage » PUIS admettait,
         dans la même phrase, qu'un des N ne l'était pas (le legacy R47) —
         une affirmation qui se contredisait elle-même (règle 13). */
      return connus === 0
        ? `${n} sample(s) « chiffre d’affaires », tous rapprochés avant tirage`
        : `${n} sample(s) « chiffre d’affaires » — ${n - connus} rapproché(s) avant tirage, ${connus} legacy R47 non rapproché(s) (antérieur à POP-01)`;
    }));
    /* ÉTAPE 5 (plan d'autonomie, Partie B — livré ce jour, lu ce jour, règle
       22). `demanderPiecesEnLot` (requests.ts) refuse toujours de créer une
       demande SANS AUCUN élément (règle 20 : une demande vide serait un
       décor). La seule façon d'obtenir une demande typée et vide ci-dessous
       est de contourner ce refus — un appel direct en base, ou une
       régression qui le retire. CE QUE CETTE LECTURE NE FAIT PAS (règle
       19) : elle ne vérifie rien du paquet PBC (`generatePbcFromSample`),
       qui ne porte jamais `evidence_type_code` et n'entre pas dans son
       calcul. */
    lectures.push(await essayer('étape 5 : aucune demande typée sans pièce (demanderPiecesEnLot)', async () => {
      const vides = await q<{ id: string; seq_no: number }>(
        `select r.id, r.seq_no from request r
         where r.engagement_id = $1 and r.evidence_type_code in ('invoice','delivery_note')
           and not exists (select 1 from request_item ri where ri.request_id = r.id)`,
        [eng.id]);
      if (vides.length > 0) {
        throw new Error(`${vides.length} demande(s) typée(s) SANS AUCUN élément — demanderPiecesEnLot ne produit jamais ce cas : `
          + 'contournée, ou le refus a été retiré par régression');
      }
      const total = await q01<{ n: string }>(
        `select count(*) n from request where engagement_id = $1 and evidence_type_code in ('invoice','delivery_note')`,
        [eng.id]);
      return total && Number(total.n) > 0 ? `${total.n} demande(s) typée(s) (facture/BL), toutes avec au moins un élément` : 'aucune demande typée encore créée';
    }));
    /* ÉTAPE 7 (plan d'autonomie, Partie B — livré ce jour, lu ce jour, règle
       22). REQ-02 (grille.ts::conclureLigne) refuse TOUJOURS de conclure une
       ligne dont une colonne AJOUTÉE (`origine: 'ajoutee_par'`) exige une
       pièce jamais demandée par le mécanisme typé (piecesDemandeesParLigne).
       La seule façon d'obtenir, ci-dessous, une ligne CONCLUE dont la grille
       (au moment de la conclusion, `test_grid.columns`) porte une colonne
       ajoutée sans demande couvrante est de contourner ce refus — un appel
       direct en base, une conclusion antérieure à REQ-02, ou une régression
       qui le retire. `test_line_conclusion.grid_id` fige la version de
       grille SOUS laquelle la ligne a été conclue (§0.3 : une version
       postérieure ne l'efface pas) — c'est CETTE version-là qu'on relit ici,
       jamais la grille courante, qui pourrait avoir gagné ou perdu des
       colonnes depuis. CE QUE CETTE LECTURE NE FAIT PAS (règle 19) : elle ne
       vérifie rien des colonnes `origine: 'pack'` — REQ-02 lui-même ne les
       regarde pas (R49, le paquet PBC existant les couvre déjà). */
    lectures.push(await essayer('étape 7 : aucune ligne conclue sans pièce demandée pour ses colonnes ajoutées (REQ-02)', async () => {
      const orphelines = await q<{ sample_item_id: string; document: string; libelle: string }>(
        `select distinct tlc.sample_item_id::text, (c.col->>'document') as document, (c.col->>'libelle') as libelle
         from test_line_conclusion tlc
         join test_grid g on g.id = tlc.grid_id
         cross join lateral jsonb_array_elements(g.columns) as c(col)
         where tlc.engagement_id = $1 and (c.col->>'origine') = 'ajoutee_par'
           and not exists (
             select 1 from request r join request_item ri on ri.request_id = r.id
             where r.engagement_id = $1 and r.evidence_type_code = (c.col->>'document')
               and ri.sample_item_id = tlc.sample_item_id)`,
        [eng.id]);
      if (orphelines.length > 0) {
        throw new Error(`${orphelines.length} ligne(s) conclue(s) porte(nt) une colonne ajoutée dont la pièce (`
          + `${orphelines.map((o) => `${o.document} — ${o.libelle}`).join(', ')}) n’a jamais été demandée — `
          + 'REQ-02 ne produit jamais ce cas : contourné, ou le refus a été retiré par régression');
      }
      const colonnesAjoutees = await q01<{ n: string }>(
        `select count(*) n from test_column where engagement_id = $1 and procedure_code = 'REV-SUBST'`, [eng.id]);
      return Number(colonnesAjoutees?.n ?? 0) > 0
        ? `${colonnesAjoutees!.n} colonne(s) ajoutée(s) — aucune ligne conclue sans sa pièce demandée`
        : 'aucune colonne ajoutée encore créée';
    }));
    /* LOT 3, TRANCHE 1 (mandat, Partie C.1 — livrée ce jour, lue ce jour,
       règle 22). `procedure_instance.nature` est posée EXPLICITEMENT à
       l'écriture (programme.ts, sampling.ts, sox.ts) — jamais laissée au
       défaut de colonne en silence (règle 13). Si elle DIVERGE du catalogue
       ACTUEL pour un `template_code` catalogué, c'est que le catalogue a
       changé de classification depuis l'écriture (une tranche a corrigé une
       nature, mais les lignes déjà en base n'ont pas suivi) ou qu'un point
       d'écriture s'est mis à ignorer sa propre valeur — les deux sont un
       DÉCALAGE SILENCIEUX, pas une erreur qui se serait déjà vue ailleurs.
       CE QUE CETTE LECTURE NE VÉRIFIE PAS (règle 19) : les templates HORS
       catalogue (REV-SUBST, `OE-*` de sox.ts) — `parCode` ne les connaît
       pas, ils sont donc silencieusement exclus de la comparaison, pas
       déclarés cohérents ; leur propre justesse tient au commentaire du
       point d'écriture, pas à cette lecture. */
    lectures.push(await essayer('nature du test cohérente avec le catalogue (Lot 3, tranche 1)', async () => {
      const { catalogueDeLaMission } = await import('@/lib/methodology/depot');
      const cat = await catalogueDeLaMission(id);
      const parCode = new Map(cat.procedures.map((p) => [p.code, p.nature]));
      const rows = await q<{ template_code: string; nature: string; n: string }>(
        `select template_code, nature, count(*) n from procedure_instance where engagement_id = $1 group by template_code, nature`,
        [id]);
      const divergentes = rows.filter((r) => parCode.has(r.template_code) && parCode.get(r.template_code) !== r.nature);
      if (divergentes.length > 0) {
        throw new Error(`${divergentes.length} template(s) dont la nature en base diverge du catalogue actuel : `
          + divergentes.map((d) => `${d.template_code} (base : « ${d.nature} », catalogue : « ${parCode.get(d.template_code)} »)`).join(', '));
      }
      const cataloguees = rows.filter((r) => parCode.has(r.template_code)).reduce((s, r) => s + Number(r.n), 0);
      return cataloguees > 0
        ? `${cataloguees} procédure(s) instanciée(s) d’un template catalogué, toutes cohérentes avec la nature actuelle du catalogue`
        : 'aucune procédure instanciée d’un template catalogué encore';
    }));
    /* LOT 3, TRANCHE 2 (mandat, Partie C.1 — livrée ce jour, lue ce jour,
       règle 22). `atelierDeLaNature` (programme.ts) est une fonction PURE,
       sans état — sa propre couverture de test (programme-vue.test.ts)
       suffirait presque à elle seule. Mais règle 22 ne fait pas d'exception
       aux fonctions pures, et le risque réel n'est pas dans la fonction :
       c'est qu'une procédure PLANIFIÉE (`procedure_instance`, un geste réel
       de l'auditeur) sur le poste REVENUE se retrouve un jour SANS atelier —
       une régression de `atelierDeLaNature` qui perd un cas déjà câblé pour
       CE poste précis. Cette lecture interroge la BASE, pas le code.
       R54/R55 (docs/BACKLOG_REPORTE.md) le disent déjà : RECALC et ESTIM sont
       plannables sur N'IMPORTE QUEL poste dès aujourd'hui via une bascule de
       risque ordinaire, pas seulement REVENUE — et `atelierDeLaNature` ne
       construit un atelier réel QUE pour REVENUE (le seul câblé à ce jour,
       Lot 3 tranche 2). Une procédure `recalcul_parametre` planifiée sur un
       poste hors REVENUE (TRADE_RECEIVABLES, etc.) est donc un état ATTENDU
       et déjà consigné, pas une régression : cette lecture ne fait ROUGIR le
       endpoint entier QUE si le poste absent d'atelier est REVENUE (le seul
       cas qui trahirait une vraie perte de câblage). Un gap hors REVENUE est
       rapporté HONNÊTEMENT dans le détail (compte + poste), jamais tu, mais
       ne bloque pas /api/sante — sans quoi cette lecture reproduirait
       exactement R53 (une garde qui rougit sur un état sanctionné et
       attendu plutôt que sur une régression réelle).
       CE QUE CETTE LECTURE NE VÉRIFIE PAS (règle 19) : elle ne dit rien des
       procédures `recalcul_parametre` du catalogue qui ne sont pas encore
       planifiables du tout (R54 — quatorze des seize procédures portent un
       `cycle` qui ne correspond à aucun `fsli.code` réel) : une procédure
       qui ne peut jamais être planifiée n'apparaît jamais dans la requête,
       donc jamais dans ce rapport. Elle ne dit rien non plus d'un atelier
       construit pour un poste hors REVENUE : le jour où `atelierDeLaNature`
       gagne un second poste câblé, cette lecture continuera de ne rougir que
       sur REVENUE tant que le code n'est pas mis à jour pour l'inclure.
       RÉFUTATION HOSTILE (deux réfutateurs indépendants, avant livraison) :
       une première version de ce message THROW, dans le cas mixte (une
       régression REVENUE ET un gap hors REVENUE en même temps), taisait le
       gap hors REVENUE — le `throw` sortait avant que `horsRevenue` soit
       même lu. Contredisait sa propre en-tête (« rapporté HONNÊTEMENT »).
       Corrigé : le gap hors REVENUE, s'il existe, est concaténé au message
       — jeté ou rendu, il apparaît toujours. De même, la phrase « REVENUE
       toujours avec un atelier réel » n'apparaît plus que si la requête a
       RÉELLEMENT vu au moins une ligne REVENUE (`revenuVerifie`) : elle
       affirmait auparavant un fait jamais vérifié quand aucune ligne
       REVENUE n'existait dans ce dossier (règle 13). */
    lectures.push(await essayer('atelier recalcul_parametre disponible (Lot 3, tranche 2)', async () => {
      const { atelierDeLaNature } = await import('@/lib/services/programme');
      const rows = await q<{ template_code: string; fsli_code: string | null; n: string }>(
        `select template_code, fsli_code, count(*) n from procedure_instance
         where engagement_id = $1 and nature = 'recalcul_parametre' group by template_code, fsli_code`,
        [id]);
      if (rows.length === 0) return 'aucune procédure recalcul_parametre planifiée encore';
      const sansAtelier = rows.filter((r) => !atelierDeLaNature('recalcul_parametre', r.fsli_code ?? '', '/base'));
      const regression = sansAtelier.filter((r) => r.fsli_code === 'REVENUE');
      const horsRevenue = sansAtelier.filter((r) => r.fsli_code !== 'REVENUE');
      const detailHorsRevenue = horsRevenue.length > 0
        ? ` ; ${horsRevenue.reduce((s, r) => s + Number(r.n), 0)} instance(s) (${horsRevenue.length} template/poste `
          + 'distinct(s)) hors REVENUE sans atelier construit — attendu, R54/R55 : '
          + horsRevenue.map((r) => `${r.template_code} (poste ${r.fsli_code ?? '(aucun)'}, ${r.n} instance(s))`).join(', ')
        : '';
      if (regression.length > 0) {
        const instances = regression.reduce((s, r) => s + Number(r.n), 0);
        throw new Error(`${instances} instance(s) (${regression.length} template(s)) recalcul_parametre `
          + 'planifiée(s) sur REVENUE SANS atelier réel — régression probable de atelierDeLaNature : '
          + regression.map((r) => `${r.template_code} (${r.n} instance(s))`).join(', ')
          + detailHorsRevenue);
      }
      const n = rows.reduce((s, r) => s + Number(r.n), 0);
      const revenuVerifie = rows.some((r) => r.fsli_code === 'REVENUE');
      const noteRevenue = revenuVerifie ? ', REVENUE toujours avec un atelier réel' : '';
      return `${n} procédure(s) recalcul_parametre planifiée(s)${noteRevenue}${detailHorsRevenue}`;
    }));
    /* LOT 3, TRANCHE 3 (mandat, Partie C.1 — livrée ce jour, lue ce jour,
       règle 22). JUMELLE de la lecture recalcul_parametre ci-dessus, CASH au
       lieu de REVENUE — même raisonnement, même structure, mêmes limites
       (règle 19) : elle rougit l'endpoint entier QUE si une procédure
       `confirmation_externe` est planifiée sur CASH (le seul poste câblé,
       `atelierDeLaNature` → `/circularisations`) SANS atelier — une
       régression probable. Un gap sur un AUTRE poste est un état ATTENDU
       (R56, docs/BACKLOG_REPORTE.md : SIX des sept procédures
       `confirmation_externe` du catalogue portent un `cycle` (même défaut
       que R54, pas un `postes` — seule `CONFIRM` porte un `postes`) qui ne
       correspond à AUCUN `fsli.code` réel — pire que R54/RECALC, ces
       procédures ne sont PLANIFIABLES SUR AUCUN poste, CASH compris ;
       `CONFIRM` seule, `postes` non nul mais SANS `CASH`, échapperait à ce
       rouge si elle était un jour plannable ailleurs), rapporté HONNÊTEMENT
       dans le détail, jamais tu, jamais bloquant — même correctif que la
       revue hostile a déjà imposé à la lecture jumelle (le gap hors-poste
       est calculé AVANT le `throw`, jamais après).
       CE QUE CETTE LECTURE NE VÉRIFIE PAS (règle 19) : elle ne dit rien des
       procédures `confirmation_externe` non plannables du tout (R56) —
       absentes de la requête, donc absentes de ce rapport. AUCUNE instance
       `confirmation_externe` n'existe dans le monde semé à ce jour (R56) :
       cette lecture reste donc VERTE-VIDE en local et en production tant que
       rien ne la plante — sa preuve vient d'un cas connu mauvais à
       insertion directe (`atelier-confirmation-lecture.test.ts`), pas d'un
       geste réel de l'auditeur, exactement comme cette phrase le dit. */
    lectures.push(await essayer('atelier confirmation_externe disponible (Lot 3, tranche 3)', async () => {
      const { atelierDeLaNature } = await import('@/lib/services/programme');
      const rows = await q<{ template_code: string; fsli_code: string | null; n: string }>(
        `select template_code, fsli_code, count(*) n from procedure_instance
         where engagement_id = $1 and nature = 'confirmation_externe' group by template_code, fsli_code`,
        [id]);
      if (rows.length === 0) return 'aucune procédure confirmation_externe planifiée encore';
      const sansAtelier = rows.filter((r) => !atelierDeLaNature('confirmation_externe', r.fsli_code ?? '', '/base'));
      const regression = sansAtelier.filter((r) => r.fsli_code === 'CASH');
      const horsCash = sansAtelier.filter((r) => r.fsli_code !== 'CASH');
      const detailHorsCash = horsCash.length > 0
        ? ` ; ${horsCash.reduce((s, r) => s + Number(r.n), 0)} instance(s) (${horsCash.length} template/poste `
          + 'distinct(s)) hors CASH sans atelier construit — attendu, R56 : '
          + horsCash.map((r) => `${r.template_code} (poste ${r.fsli_code ?? '(aucun)'}, ${r.n} instance(s))`).join(', ')
        : '';
      if (regression.length > 0) {
        const instances = regression.reduce((s, r) => s + Number(r.n), 0);
        throw new Error(`${instances} instance(s) (${regression.length} template(s)) confirmation_externe `
          + 'planifiée(s) sur CASH SANS atelier réel — régression probable de atelierDeLaNature : '
          + regression.map((r) => `${r.template_code} (${r.n} instance(s))`).join(', ')
          + detailHorsCash);
      }
      const n = rows.reduce((s, r) => s + Number(r.n), 0);
      const cashVerifie = rows.some((r) => r.fsli_code === 'CASH');
      const noteCash = cashVerifie ? ', CASH toujours avec un atelier réel' : '';
      return `${n} procédure(s) confirmation_externe planifiée(s)${noteCash}${detailHorsCash}`;
    }));
    /* LOT 3, TRANCHE 4 — LOT 3 COMPLET (mandat, Partie C.1 — livrée ce jour,
       lue ce jour, règle 22). JUMELLE des deux lectures ci-dessus, même
       raisonnement, même structure : elle rougit l'endpoint entier QUE si
       une procédure `rapprochement` est planifiée sur CASH (le seul poste
       câblé, `atelierDeLaNature` → `/circularisations`) SANS atelier — une
       régression probable. Un gap hors CASH est un état ATTENDU (R57,
       docs/BACKLOG_REPORTE.md : SEPT des neuf procédures `rapprochement` du
       catalogue — les deux autres, RAPPRO et ANNEXE, portent `cycle: '*'` —
       portent un `cycle` qui ne correspond à AUCUN `fsli.code` réel — même
       mécanisme que R54/R56), rapporté HONNÊTEMENT, jamais tu,
       jamais bloquant — le gap hors-poste est calculé AVANT le `throw`, la
       phrase « CASH toujours… » gardée derrière une vérification réelle,
       dès la première version (le même correctif que la revue hostile a
       imposé une fois puis une seconde, appliqué ici d'emblée).
       CE QUE CETTE LECTURE NE VÉRIFIE PAS (règle 19) : contrairement à
       `confirmation_externe` (R56, où AUCUNE procédure n'échappe au
       blocage), `RAPPRO` (`cycle: '*'`) EST planifiable sur CASH par une
       bascule de risque ordinaire dès aujourd'hui — mais RIEN, ni
       `bootstrapNep()` ni `enrichirMondeDemo()`, ne le fait dans le monde
       semé (R57) : cette lecture reste donc VERTE-VIDE en local et en
       production tant que rien ne la plante réellement, exactement comme sa
       jumelle CASH. Sa preuve vient d'un cas connu mauvais à insertion
       directe (`atelier-rapprochement-lecture.test.ts`), pas d'un geste
       réel de l'auditeur. */
    lectures.push(await essayer('atelier rapprochement disponible (Lot 3, tranche 4)', async () => {
      const { atelierDeLaNature } = await import('@/lib/services/programme');
      const rows = await q<{ template_code: string; fsli_code: string | null; n: string }>(
        `select template_code, fsli_code, count(*) n from procedure_instance
         where engagement_id = $1 and nature = 'rapprochement' group by template_code, fsli_code`,
        [id]);
      if (rows.length === 0) return 'aucune procédure rapprochement planifiée encore';
      const sansAtelier = rows.filter((r) => !atelierDeLaNature('rapprochement', r.fsli_code ?? '', '/base'));
      const regression = sansAtelier.filter((r) => r.fsli_code === 'CASH');
      const horsCash = sansAtelier.filter((r) => r.fsli_code !== 'CASH');
      const detailHorsCash = horsCash.length > 0
        ? ` ; ${horsCash.reduce((s, r) => s + Number(r.n), 0)} instance(s) (${horsCash.length} template/poste `
          + 'distinct(s)) hors CASH sans atelier construit — attendu, R57 : '
          + horsCash.map((r) => `${r.template_code} (poste ${r.fsli_code ?? '(aucun)'}, ${r.n} instance(s))`).join(', ')
        : '';
      if (regression.length > 0) {
        const instances = regression.reduce((s, r) => s + Number(r.n), 0);
        throw new Error(`${instances} instance(s) (${regression.length} template(s)) rapprochement `
          + 'planifiée(s) sur CASH SANS atelier réel — régression probable de atelierDeLaNature : '
          + regression.map((r) => `${r.template_code} (${r.n} instance(s))`).join(', ')
          + detailHorsCash);
      }
      const n = rows.reduce((s, r) => s + Number(r.n), 0);
      const cashVerifie = rows.some((r) => r.fsli_code === 'CASH');
      const noteCash = cashVerifie ? ', CASH toujours avec un atelier réel' : '';
      return `${n} procédure(s) rapprochement planifiée(s)${noteCash}${detailHorsCash}`;
    }));
    /* LOT 4, TRANCHE 1 (mandat, Partie D.1 — « les écrans qui manquent … la
       déplanification d'une procédure », livrée ce jour, lue ce jour, règle
       22). `deplanned_at`/`deplanned_by`/`deplanned_motif` (migration 0147)
       sont posés ENSEMBLE par le SEUL point d'écriture, `deplanifierProcedure`
       — `deplanned_at` et `deplanned_by` toujours les deux ou ni l'un ni
       l'autre. Cette lecture n'interroge PAS ce point d'écriture (il est
       couvert par ses propres tests, programme-vue.test.ts) : elle interroge
       la BASE, comme ses deux jumelles d'atelier — le risque qu'un futur code
       (une migration de données, un correctif direct, un second point
       d'écriture qui divergerait) pose l'un sans l'autre, en silence.
       CE QUE CETTE LECTURE NE VÉRIFIE PAS (règle 19) : elle ne dit rien de
       `deplanned_motif`, volontairement NULLABLE même quand la déplanification
       a réussi (PROG-07 ne l'exige que si le papier était visé) — un motif
       absent sur une ligne jamais visée est un état ATTENDU, pas un défaut. */
    lectures.push(await essayer('déplanification cohérente (Lot 4, tranche 1)', async () => {
      const incoherentes = await q01<{ n: string }>(
        `select count(*) n from procedure_instance
         where engagement_id = $1 and (deplanned_at is not null) <> (deplanned_by is not null)`,
        [id]);
      const nIncoherentes = Number(incoherentes?.n ?? 0);
      if (nIncoherentes > 0) {
        throw new Error(`${nIncoherentes} procédure(s) déplanifiée(s) incohéremment — deplanned_at et `
          + 'deplanned_by devraient toujours être posés ENSEMBLE, jamais l’un sans l’autre');
      }
      const total = await q01<{ n: string }>(
        `select count(*) n from procedure_instance where engagement_id = $1 and deplanned_at is not null`,
        [id]);
      const n = Number(total?.n ?? 0);
      return n > 0
        ? `${n} procédure(s) déplanifiée(s), toutes cohérentes (qui et quand posés ensemble)`
        : 'aucune procédure déplanifiée encore';
    }));
    /* LOT 4, TRANCHE 2 (R30, option retenue — mandat, Partie D.6) : du
       travail accroché à une sélection remplacée qu'aucun re-tirage n'a
       suivie doit se DIRE (`lignesSuperseesSansRetirage`, avertissement,
       jamais un obstacle — la question de méthode reste ouverte, R30). Cette
       lecture vérifie aussi que ce même travail n'apparaît JAMAIS en même
       temps dans la liste BLOQUANTE (`lignesSortiesDuTirage`) — les deux
       fonctions sont scopées par procédure de façon mutuellement exclusive
       (l'une exige un tirage courant, l'autre son absence), donc ce
       recoupement est normalement IMPOSSIBLE à produire par la donnée : un
       recoupement ne peut venir que d'une régression du SCOPING lui-même
       (une clause `procedure_id` retirée par erreur), pas d'un état réel du
       dossier. CE QUE CETTE LECTURE NE VÉRIFIE PAS (règle 19) : sans donnée
       capable de la faire rougir sur ce second point, l'épreuve réelle de
       cette garde est la mutation en revue hostile (règle 24/30), pas un cas
       connu mauvais posé ici — seul le compte lui-même (premier point) peut
       rougir sur un vrai état du dossier. */
    lectures.push(await essayer('travail non re-tiré après ré-import (R30, Lot 4 tranche 2)', async () => {
      const { lignesSortiesDuTirage, lignesSuperseesSansRetirage } = await import('@/lib/services/sampling');
      const [obstacles, avertissements] = await Promise.all([
        lignesSortiesDuTirage(id), lignesSuperseesSansRetirage(id),
      ]);
      const idsObstacles = new Set(obstacles.map((l) => l.id));
      const recoupement = avertissements.filter((l) => idsObstacles.has(l.id));
      if (recoupement.length > 0) {
        throw new Error(`${recoupement.length} ligne(s) comptée(s) à la fois comme obstacle bloquant et `
          + 'comme avertissement de tirage — le scoping par procédure a un trou');
      }
      return avertissements.length > 0
        ? `${avertissements.length} ligne(s) de sélection remplacée jamais re-tirée, portant du travail `
          + '(avertissement, jamais bloquant)'
        : 'aucune sélection remplacée sans re-tirage ne porte de travail';
    }));
    /* D.6 POINT 3 (mandat, épreuve de l'épure) : « Une page de poste n'ouvre
       par défaut que les sections portant du contenu. » `blocPorteContenu`
       est une fonction PURE (poste.ts), déjà éprouvée sur ses quatre états
       possibles par un test unitaire (règle 17) ; elle ne peut donc pas
       rougir sur une donnée réelle du dossier — le trou qu'elle attraperait
       serait une régression de la fonction elle-même. CE QUE CETTE LECTURE
       VÉRIFIE VRAIMENT (règle 19) : que le bloc `leadsheet`, pour CHAQUE
       poste du dossier, est réputé plein exactement quand il a des comptes —
       un recoupement contre la donnée brute, pas un second appel à la même
       fonction. */
    lectures.push(await essayer('sections vides repliées par défaut (D.6 point 3, Lot 4 tranche 4)', async () => {
      const { vuePoste, blocPorteContenu } = await import('@/lib/services/poste');
      const postes = await q<{ code: string }>(`select code from fsli where engagement_id = $1 order by code`, [id]);
      if (postes.length === 0) return 'aucun poste sur ce dossier';
      let incoherents = 0;
      let vides = 0;
      let pleins = 0;
      for (const p of postes) {
        const v = await vuePoste(id, p.code);
        if (!v) continue;
        const attendu = v.comptes.length > 0;
        const leadsheet = v.blocs.find((b) => b.cle === 'leadsheet');
        if (!leadsheet || blocPorteContenu(leadsheet.etat) !== attendu) { incoherents += 1; continue; }
        for (const b of v.blocs) (blocPorteContenu(b.etat) ? pleins += 1 : vides += 1);
      }
      if (incoherents > 0) {
        throw new Error(`${incoherents} poste(s) où le bloc leadsheet ne correspond pas à la présence `
          + 'de comptes — blocPorteContenu ne suit plus l’état dérivé');
      }
      return `${postes.length} poste(s) · ${pleins} bloc(s) plein(s) · ${vides} bloc(s) vide(s) replié(s) par défaut`;
    }));
    lectures.push(await essayer('magasin de pièces (blob_store)', async () => {
      const r = await q01<{ n: string }>(`select count(*) n from blob_store`);
      return r ? `${r.n} objet(s)` : 'vide';
    }));
  }

  /* CTRL-01 (mandat contrôle interne, 2026-09-08, Lot suivant tranche 1) : « l'inquiry seule ne
     conclut rien ». Lue GLOBALEMENT (tous les dossiers, pas seulement `id`) : l'invariant doit
     tenir pour tout contrôle CONCLU, où qu'il soit — `setDiStatus` le garde à l'écriture ; cette
     lecture ne peut rougir que si une écriture a CONTOURNÉ ce garde (un SQL direct, une
     régression de la garde elle-même) — elle ne vérifie PAS que la garde fonctionne pour un
     contrôle qui n'a encore rien conclu (aucun cas à rougir tant que rien n'est conclu).
     CORRIGÉ (revue hostile du 2026-09-08, voix 1) : la première version partait des TÂCHES
     (`join control_task`), donc un contrôle CONCLU sans AUCUNE tâche — exactement le défaut que
     `importRcm` produisait avant sa propre correction ce jour-là, en import direct du `di_status`
     du listing client — ne rejoignait jamais rien et passait pour vert. Elle part maintenant des
     CONTRÔLES conclus, et compte l'absence de tâche comme sa PROPRE violation, distincte de
     « une tâche à la seule inquiry ». */
  lectures.push(await essayer('CTRL-01 : aucun contrôle conclu sans procédure au-delà de l’inquiry', async () => {
    const concludedControls = await q<{ id: string; code: string }>(
      `select id, code from control where di_status <> 'not_assessed'`,
    );
    if (concludedControls.length === 0) return 'aucun contrôle conclu pour l’instant';
    const violations: string[] = [];
    let taches = 0;
    for (const c of concludedControls) {
      const taskRows = await q<{ id: string; description: string }>(
        `select id, description from control_task where control_id = $1 order by seq_no`, [c.id],
      );
      if (taskRows.length === 0) { violations.push(`${c.code} : conclu sans aucune tâche documentée`); continue; }
      taches += taskRows.length;
      for (const t of taskRows) {
        const preuve = await q01(`select 1 from control_task_procedure where task_id = $1 and procedure <> 'inquiry'`, [t.id]);
        if (!preuve) violations.push(`${c.code} — ${t.description} : inquiry seule`);
      }
    }
    if (violations.length > 0) {
      throw new Error(`${violations.length} violation(s) de CTRL-01 : ${violations.join(' ; ')}`);
    }
    return `${concludedControls.length} contrôle(s) conclu(s) · ${taches} tâche(s), toutes documentées au-delà de l’inquiry`;
  }));

  /* CTRL-02 (mandat contrôle interne, §2.4, tranche 2) : « conclure un D&I dont l'un des
     quatre facteurs de design n'a pas de conclusion écrite. » Même discipline que CTRL-01 :
     lue GLOBALEMENT, part des CONTRÔLES conclus (pas des facteurs — le même piège que la
     première version de CTRL-01, un contrôle sans AUCUN facteur ne rejoindrait rien s'il
     fallait partir de `control_design_factor`). Le facteur « réponse au risque » exige EN
     PLUS un lien réel vers `risk` (§2.4.1 : « jamais du texte libre seul ») — vérifié
     séparément, nommé distinctement d'un facteur simplement absent. */
  lectures.push(await essayer('CTRL-02 : aucun contrôle conclu sans ses quatre facteurs de design', async () => {
    const concludedControls = await q<{ id: string; code: string }>(
      `select id, code from control where di_status <> 'not_assessed'`,
    );
    if (concludedControls.length === 0) return 'aucun contrôle conclu pour l’instant';
    const violations: string[] = [];
    const REQUIS = ['reponse_risque', 'autorite_competence', 'frequence_constance', 'seuil_investigation'];
    for (const c of concludedControls) {
      const facteurs = await q<{ factor: string }>(`select factor from control_design_factor where control_id = $1`, [c.id]);
      const manquants = REQUIS.filter((f) => !facteurs.some((x) => x.factor === f));
      if (manquants.length > 0) violations.push(`${c.code} : facteur(s) manquant(s) — ${manquants.join(', ')}`);
      const lien = await q01(`select 1 from control_risk where control_id = $1`, [c.id]);
      if (!lien) violations.push(`${c.code} : réponse au risque sans lien vers un risque réel`);
    }
    if (violations.length > 0) {
      throw new Error(`${violations.length} violation(s) de CTRL-02 : ${violations.join(' ; ')}`);
    }
    return `${concludedControls.length} contrôle(s) conclu(s) · quatre facteurs documentés, réponse au risque liée à un objet réel`;
  }));

  /* CTRL-03 (mandat contrôle interne, §2.3, tranche 2) : « déclarer une IUC utilisée sans
     documenter à la fois son exactitude ET son exhaustivité. Le refus nomme laquelle des deux
     manque. » Un contrôle conclu sans AUCUNE déclaration IUC (ni oui ni non) est sa propre
     violation, distincte d'une IUC déclarée utilisée à qui il manque un volet — même
     discipline de nommage que CTRL-01/CTRL-02. */
  lectures.push(await essayer('CTRL-03 : aucune IUC utilisée sans exactitude et exhaustivité documentées', async () => {
    const concludedControls = await q<{ id: string; code: string }>(
      `select id, code from control where di_status <> 'not_assessed'`,
    );
    if (concludedControls.length === 0) return 'aucun contrôle conclu pour l’instant';
    const violations: string[] = [];
    let iucUtilisees = 0;
    for (const c of concludedControls) {
      const iuc = await q01<{ id: string; utilisee: boolean }>(`select id, utilisee from control_iuc where control_id = $1`, [c.id]);
      if (!iuc) { violations.push(`${c.code} : aucune déclaration IUC`); continue; }
      if (!iuc.utilisee) continue;
      iucUtilisees++;
      const preuves = await q<{ volet: string }>(`select volet from control_iuc_preuve where iuc_id = $1`, [iuc.id]);
      const manquants = (['exactitude', 'exhaustivite'] as const).filter((v) => !preuves.some((p) => p.volet === v));
      if (manquants.length > 0) violations.push(`${c.code} : IUC utilisée sans ${manquants.join(' ni ')}`);
    }
    if (violations.length > 0) {
      throw new Error(`${violations.length} violation(s) de CTRL-03 : ${violations.join(' ; ')}`);
    }
    return `${concludedControls.length} contrôle(s) conclu(s) · ${iucUtilisees} IUC déclarée(s) utilisée(s), toutes documentées (exactitude + exhaustivité)`;
  }));

  /* ── L'ÉTANCHÉITÉ ENTRE CABINETS, LUE DANS L'INSTANCE DÉPLOYÉE ──────────
     (mandat du jour n°3, §1.1 ; chaque tranche livrée ajoute sa lecture le
     jour même). Ces trois lignes disent, depuis la fonction qui répond, ce que
     ni la suite locale ni le plan ne peuvent affirmer à sa place : quel rôle
     sert, si le garde de locataire est armé, et si `otto_app` existe et ne
     contourne pas. Un « rôle : postgres · bypass : oui » est la MESURE que
     l'étape 3 de PLAN_RLS n'est pas exécutée — écrite, pas supposée. */
  lectures.push(await essayer('rôle servi et garde de locataire (PLAN_RLS)', async () => {
    const { gardeArme, CHEMINS_SANS_LOCATAIRE } = await import('@/lib/db/sans-locataire');
    const r = await q01<{ u: string; b: boolean }>(
      `select current_user u, coalesce(rolbypassrls, true) b from pg_roles where rolname = current_user`);
    const cables = CHEMINS_SANS_LOCATAIRE.filter((c) => c.etat === 'cable').length;
    return `rôle ${r?.u ?? '?'} · contourne la RLS : ${r?.b ? 'OUI (politiques inertes)' : 'non'}`
      + ` · garde LOC-01 ${gardeArme() ? 'ARMÉ' : 'désarmé'}`
      + ` · ${cables}/${CHEMINS_SANS_LOCATAIRE.length} chemin(s) sans locataire câblé(s)`;
  }));
  lectures.push(await essayer('rôle applicatif otto_app (migration 0140)', async () => {
    const r = await q01<{ b: boolean; l: boolean }>(
      `select rolbypassrls b, rolcanlogin l from pg_roles where rolname = 'otto_app'`);
    if (!r) return 'ABSENT — la migration 0140 n’est pas appliquée sur cette base';
    return `présent · contourne la RLS : ${r.b ? 'OUI (défaut)' : 'non'} · connexion : ${r.l ? 'oui' : 'non'}`
      + ` — non employé tant que DATABASE_URL désigne un autre rôle (étape 3 NON exécutée)`;
  }));
  /* ── LA TRANCHE DE LA NUIT, LUE DANS L'INSTANCE DÉPLOYÉE (0141) ────────
     Le portail par jeton et l'isolation des pièces sont des POLITIQUES : elles
     ne s'exercent que sous un rôle sans BYPASSRLS, donc pas ici. Ce qu'on peut
     lire, et qui vaut d'être lu, c'est qu'elles EXISTENT, et que le registre
     des `security definer` justifiées dit la même chose que le code. */
  lectures.push(await essayer('portail par jeton et pièces (migration 0141)', async () => {
    const pol = await q<{ n: string }>(
      `select policyname n from pg_policies where schemaname = 'public'
        and (policyname like '%_portail%' or policyname = 'blob_store_par_reference') order by 1`);
    const reg = await q<{ nom: string }>(`select nom from rls_definer_justifiee order by 1`);
    const { DEFINERS_JUSTIFIEES } = await import('@/lib/db/assertions-role');
    const memeListe = reg.map((x) => x.nom).join(',') === Object.keys(DEFINERS_JUSTIFIEES).sort().join(',');
    if (!memeListe) {
      throw new Error(`le registre SQL des SECURITY DEFINER (${reg.map((x) => x.nom).join(', ')}) `
        + `diverge de la liste du code (${Object.keys(DEFINERS_JUSTIFIEES).sort().join(', ')})`);
    }
    return `${pol.length} politique(s) : ${pol.map((x) => x.n).join(' · ')} · `
      + `${reg.length} fonction(s) definer justifiée(s), registre SQL et code d’accord`;
  }));

  lectures.push(await essayer('gardes d’étanchéité dans les services (ETANCH-01/02/03)', async () => {
    /* TROIS FAILLES CORRIGÉES (revue hostile n°9, constat 8). La première
       version : (1) rendait « aucune mission » en VERT sur une base vide ;
       (2) éprouvait un UUID nul, donc le refus venait de « cette personne
       n'existe pas », pas de « elle est d'un autre cabinet » — le même refus
       serait rendu si `app_user` était entièrement illisible, c'est-à-dire
       DANS l'incident que la sonde doit dénoncer ; (3) ne vérifiait pas
       l'autre sens, donc une garde cassée en « refuse tout » passait. Et elle
       éprouvait `estMembre`, qu'aucun service n'appelle, au lieu
       d'`assertMembre` — la preuve venait d'un autre objet (règle 16). */
    const { assertMembre } = await import('@/lib/core/membre');
    if (!eng?.id) throw new Error('aucune mission : la garde n’a pas pu être éprouvée — ce n’est PAS un succès');
    /* LE SENS « ELLE LAISSE PASSER » : un vrai membre du dossier passe. */
    const membre = await q01<{ id: string }>(
      `select user_id::text id from engagement_member where engagement_id = $1 and exited_on is null limit 1`,
      [eng.id]);
    if (!membre) throw new Error('aucun membre sur la mission : la garde n’a pas pu être éprouvée dans le sens « laisse passer »');
    await assertMembre(eng.id, membre.id, 'sonde de santé');
    /* LE SENS « ELLE REFUSE » : une personne d'un AUTRE cabinet — pas une
       personne inexistante. La sonde ne crée rien : elle prend une personne
       réelle dont le cabinet diffère de celui de la mission, s'il en existe. */
    const etranger = await q01<{ id: string }>(
      `select u.id::text id from app_user u
       where u.tenant_id <> (select tenant_id from engagement where id = $1) limit 1`, [eng.id]);
    const refuser = async (id: string) => {
      try { await assertMembre(eng.id, id, 'sonde de santé'); return ''; }
      catch (e) { return e instanceof Error ? e.message : String(e); }
    };
    const dits: string[] = ['un membre passe'];
    if (etranger) {
      const r = await refuser(etranger.id);
      if (!/ETANCH-01/.test(r)) throw new Error(`une personne d’un AUTRE cabinet n’est pas refusée par ETANCH-01 (lu : « ${r || 'aucun refus'} »)`);
      dits.push('un autre cabinet est refusé (ETANCH-01)');
    } else {
      /* AUCUN AUTRE CABINET N'EXISTE dans le monde de démonstration — alors on
         en fabrique un DANS UNE TRANSACTION ANNULÉE. C'est le mécanisme de la
         sonde d'acceptation (`annulerApres`, ADR-123) : le geste est réel, le
         refus est réel, et la base ne porte pas une ligne de plus. Sans cela,
         ce sens de la garde ne serait jamais éprouvé sur l'instance
         déployée — et une garde qui n'a jamais refusé n'est pas une garde
         (règle 17). Si la fabrication échoue (droits, contrainte), on le DIT
         au lieu de conclure. */
      try {
        const { annulerApres } = await import('@/lib/db/client');
        const r = await annulerApres(async () => {
          const t = await q01<{ id: string }>(
            `insert into tenant (name) values ('Cabinet d’épreuve de la sonde (fictif)') returning id::text`);
          const u = await q01<{ id: string }>(
            `insert into app_user (tenant_id, name, email, firm_role)
             values ($1, 'Épreuve de la sonde', 'epreuve.sonde@etranger.test', 'partner') returning id::text`,
            [t!.id]);
          return refuser(u!.id);
        });
        if (!/ETANCH-01/.test(r)) throw new Error(`une personne d’un AUTRE cabinet n’est pas refusée par ETANCH-01 (lu : « ${r || 'aucun refus'} »)`);
        dits.push('un autre cabinet est refusé (ETANCH-01, éprouvé dans une transaction ANNULÉE — rien n’est écrit)');
      } catch (e) {
        dits.push(`ETANCH-01 NON éprouvé ici : ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
      }
    }
    /* ET LE SECOND REFUS, celui que le monde de démonstration permet toujours
       d'éprouver : quelqu'un du MÊME cabinet qui n'est pas de l'équipe. */
    const horsEquipe = await q01<{ id: string }>(
      `select u.id::text id from app_user u
       where u.tenant_id = (select tenant_id from engagement where id = $1)
         and not exists (select 1 from engagement_member m
                         where m.engagement_id = $1 and m.user_id = u.id and m.exited_on is null)
       limit 1`, [eng.id]);
    if (horsEquipe) {
      const r = await refuser(horsEquipe.id);
      if (!/ETANCH-03/.test(r)) throw new Error(`une personne du cabinet hors de l’équipe n’est pas refusée par ETANCH-03 (lu : « ${r || 'aucun refus'} »)`);
      dits.push('une personne du cabinet hors équipe est refusée (ETANCH-03)');
    }
    /* Si AUCUN des deux refus n'a pu être joué, la lecture ne conclut pas : le
       message commence par « aucun », donc elle est marquée VIDE, comptée, et
       remonte dans le verdict. Nommer l'absence de mesure, plutôt que la
       peindre en vert ou en rouge — l'un mentirait, l'autre ferait tomber la
       sonde entière sur une garde qui, elle, va très bien. */
    if (dits.length === 1 || dits.every((d) => d === 'un membre passe' || d.startsWith('ETANCH-01 NON éprouvé'))) {
      return `aucun refus éprouvé ici — ${dits.join(' · ')}`;
    }
    return dits.join(' · ') + ' — refus VÉRIFIÉS ici, pas déclarés';
  }));

  lectures.push(await essayer('registre du décor (R44 : le semeur et le chemin)', async () => {
    /* CETTE LECTURE ROUGIT SUR SON CAS SURVEILLÉ, PAS SEULEMENT SUR UNE
       EXCEPTION IMPRÉVUE (règle 22) : le cas qu'elle sait reconnaître est un
       registre INCOHÉRENT — une ligne `etat=prouve` sans citation de clic, ou
       `etat=decor` avec un chemin humain renseigné (constat E1, relecture
       hostile du 2026-09-06 : rien ne gardait cet invariant avant). */
    const { SECTIONS } = await import('@/lib/semeur/registre');
    const { violationsDeCoherence } = await import('@/lib/semeur/coherence');
    const incoherences = violationsDeCoherence(SECTIONS);
    if (incoherences.length > 0) {
      throw new Error(`${incoherences.length} incohérence(s) dans le registre : ${incoherences[0]}`);
    }
    const tous = SECTIONS.flatMap((s) => s.objets);
    const decors = tous.filter((o) => o.etat === 'decor').length;
    const nonProuves = tous.filter((o) => o.etat === 'non_prouve').length;
    const prouves = tous.filter((o) => o.etat === 'prouve').length;
    return `${tous.length} objet(s) recensés · ${decors} décor(s) · ${nonProuves} non prouvé(s) · ${prouves} prouvé(s)`;
  }));

  const version = versionServie();
  const cassees = lectures.filter((l) => !l.ok);
  const vides = lectures.filter((l) => l.vide);
  return NextResponse.json({
    instance: { base: dbKind(), demoPublique: demoPublique() },
    /* LE SHA QUE CE BUNDLE PORTE — cuit au build (§0.1), pas lu dans
       l'environnement qui répond ; la source est dite, et la divergence avec
       ce que la plateforme prétend aussi. L'acceptation cliquée le compare au
       commit qu'elle attend. */
    sha: version.sha,
    version,
    verdict: (cassees.length === 0 ? 'toutes les lectures passent' : `${cassees.length} lecture(s) CASSÉE(S)`)
      + (vides.length
        ? ` · ${vides.length} lecture(s) VIDE(S) : ${vides.map((l) => l.nom).join(' · ')}. `
          + `Une lecture vide n’est pas une lecture qui passe — sous un rôle sans BYPASSRLS et sans locataire posé, `
          + `la base rend zéro ligne SANS erreur (docs/PLAN_RLS.md).`
        : ' · aucune lecture vide'),
    lectures,
  }, { status: cassees.length === 0 ? 200 : 500 });
}
