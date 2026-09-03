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
    lectures.push(await essayer('magasin de pièces (blob_store)', async () => {
      const r = await q01<{ n: string }>(`select count(*) n from blob_store`);
      return r ? `${r.n} objet(s)` : 'vide';
    }));
  }

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
