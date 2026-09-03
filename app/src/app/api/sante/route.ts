import { NextResponse } from 'next/server';
import { q, q01 } from '@/lib/db/client';
import { demoPublique } from '@/lib/core/demo-public';
import { dbKind } from '@/lib/db/client';
import { versionServie } from '@/lib/version';

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

interface Lecture { nom: string; ok: boolean; detail: string }

async function essayer(nom: string, fn: () => Promise<unknown>): Promise<Lecture> {
  try {
    const v = await fn();
    const detail = Array.isArray(v) ? `${v.length} élément(s)`
      : v === null || v === undefined ? 'vide'
        : typeof v === 'object' ? 'objet' : String(v);
    return { nom, ok: true, detail };
  } catch (e) {
    return { nom, ok: false, detail: e instanceof Error ? e.message.split('\n')[0].slice(0, 300) : String(e) };
  }
}

export async function GET() {
  if (!demoPublique()) {
    return new NextResponse('Ce chemin n’existe que sur la démonstration publique.', { status: 404 });
  }
  const eng = await q01<{ id: string }>(
    `select id::text from engagement where kind = 'statutory_audit' order by created_at limit 1`)
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
    lectures.push(await essayer('magasin de pièces (blob_store)', async () => {
      const r = await q01<{ n: string }>(`select count(*) n from blob_store`);
      return r ? `${r.n} objet(s)` : 'vide';
    }));
  }

  const version = versionServie();
  const cassees = lectures.filter((l) => !l.ok);
  return NextResponse.json({
    instance: { base: dbKind(), demoPublique: demoPublique() },
    /* LE SHA QUE CE BUNDLE PORTE — cuit au build (§0.1), pas lu dans
       l'environnement qui répond ; la source est dite, et la divergence avec
       ce que la plateforme prétend aussi. L'acceptation cliquée le compare au
       commit qu'elle attend. */
    sha: version.sha,
    version,
    verdict: cassees.length === 0 ? 'toutes les lectures passent' : `${cassees.length} lecture(s) CASSÉE(S)`,
    lectures,
  }, { status: cassees.length === 0 ? 200 : 500 });
}
