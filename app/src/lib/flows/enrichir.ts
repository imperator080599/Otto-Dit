import fs from 'node:fs';
import path from 'node:path';
import { q, q01, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { proceduresDuCycle } from '@/lib/methodology/catalogue';
import { openDeclaration, answerRubric, signDeclaration, assignMember } from '@/lib/services/team';
import { listFslis, confirmScoping } from '@/lib/services/fsli';
import { assessFsli } from '@/lib/services/risk';
import { questionsOfScope, answerQuestion, answers } from '@/lib/services/questionnaire';
import { planifierProcedure, redigerPapierDeProcedure, proceduresPlanifiees } from '@/lib/services/programme';
import { signWorkpaper, addReviewNote, type NoteType } from '@/lib/services/workpapers/lifecycle';
import { enregistrerIpe } from '@/lib/services/ipe';
import { assurerSections, sectionsDuDossier, attribuerA, envoyerA } from '@/lib/services/sections';
import { importerProcessus, lireProcessus, diffProcessus, statuerChangement } from '@/lib/services/processus';
import { importRcm, listControls } from '@/lib/services/sox';
import { calculerGrille, cellulesDuDossier, disposerCellule, conclureLigne, grilleDuDossier } from '@/lib/services/testing/grille';
import { currentRevenueSample } from '@/lib/services/sampling';
import { enregistrerAnalytique, lireAnalytique } from '@/lib/services/analytique';
import type { Ancre } from '@/lib/services/notes/ancres';

// UN MONDE QUI A QUELQUE CHOSE À MONTRER (mandat de nuit n°2, 1.1).
//
// Le monde de base (`npm run demo:seed`) déroule le cycle chiffre d'affaires
// de bout en bout — c'est lui que le parcours cliqué conduit et scelle. Mais
// il s'ouvre sur DEUX sections, toutes deux revues, et UN papier : un tableau
// de bord sans forme, une page de poste presque vide. Ce flux ENRICHIT ce
// monde, SANS RIEN REMPLACER : chaque étape vérifie ce qui existe et n'ajoute
// que ce qui manque, par les mêmes services que les clics. Rejouable à
// volonté ; ce que le fondateur a saisi survit.
//
// Il tourne au déploiement (scripts/deploy/reconstruire.ts) sur le monde
// public tel qu'il est, et derrière `npm run demo` en local. Il ne tourne PAS
// dans le parcours cliqué : celui-ci prouve le chemin sur le monde de base ;
// l'acceptation cliquée (E-01…), elle, prouve le monde enrichi.
//
// CE QU'IL NE FAIT PAS, ET LE DIT : il ne fabrique aucun écart. Un écart naît
// du contrôle sur pièces (matching) ; sur un monde où toutes les pièces sont
// arrivées et tous les écarts statués, il n'existe aucun chemin légitime pour
// en « ouvrir » un — l'inventer serait de la fiction dans un dossier d'audit.
// Le rapport le compte tel quel.

export interface EtapeEnrichissement { nom: string; fait: boolean; detail: string }
export interface RapportEnrichissement { etapes: EtapeEnrichissement[] }

const ENG = IDS.engNep;
const ds = (...p: string[]) => path.join(repoRoot(), 'dataset', ...p);

/** La date d'il y a `n` jours OUVRÉS (samedi et dimanche sautés). */
export function joursOuvresAvant(n: number, depuis: Date = new Date()): Date {
  const d = new Date(depuis);
  let reste = n;
  while (reste > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    const j = d.getUTCDay();
    if (j !== 0 && j !== 6) reste--;
  }
  return d;
}

/* Les papiers à créer sur le poste, dans l'ORDRE : le dernier visa de
   préparateur posé est celui du papier refait (v1 dépassée) — c'est lui que
   l'en-tête du poste lit, périmé, en haut à droite. */
const PAPIERS: { code: string; etat: 'draft' | 'in_review' | 'signed' | 'perime' }[] = [
  { code: 'MANUEL', etat: 'signed' },
  { code: 'CUTOFF', etat: 'in_review' },
  { code: 'RA', etat: 'draft' },
  { code: 'RECALC', etat: 'in_review' },
  { code: 'SEQ', etat: 'perime' },
];

export async function enrichirMondeDemo(): Promise<RapportEnrichissement> {
  const etapes: EtapeEnrichissement[] = [];
  const dire = (nom: string, fait: boolean, detail: string) => { etapes.push({ nom, fait, detail }); };
  const n = (r: { n: string } | null) => Number(r?.n ?? 0);
  const { karim, lea, claire, hugo } = IDS.users;

  if (!(await q01<{ id: string }>(`select id::text from engagement where id = $1`, [ENG]))) {
    dire('dossier de démonstration', false, 'absent — rien à enrichir');
    return { etapes };
  }
  if (n(await q01<{ n: string }>(`select count(*)::text n from file_archive where engagement_id = $1`, [ENG])) > 0) {
    dire('dossier de démonstration', false, 'scellé — un dossier scellé ne s’enrichit pas');
    return { etapes };
  }
  if (n(await q01<{ n: string }>(`select count(*)::text n from workpaper where engagement_id = $1 and code = 'REV-01'`, [ENG])) === 0) {
    dire('dossier de démonstration', false, 'le monde de base n’est pas déroulé (aucun REV-01) — `npm run demo:seed` d’abord');
    return { etapes };
  }
  const cat = await catalogueDeLaMission(ENG);

  /* 1. L'ÉQUIPE : quatre membres, pour que les sections se répartissent. */
  {
    const membre = await q01<{ id: string }>(
      `select id::text from engagement_member where engagement_id = $1 and user_id = $2 and exited_on is null`, [ENG, hugo]);
    if (!membre) {
      const d = await openDeclaration(ENG, hugo, '');
      for (const r of cat.independance.rubriques) await answerRubric(d.id, hugo, r.code, 'non', '');
      await signDeclaration(d.id, hugo);
      await assignMember({ engagementId: ENG, userId: hugo, engRole: 'staff', canSign: false, enteredOn: '2026-01-12', actorUserId: claire });
    }
    dire('équipe : Hugo Vasseur (staff) sur le dossier', true, membre ? 'déjà membre' : 'affecté, déclaration d’indépendance signée');
  }

  /* 2. UN SECOND POSTE DU CYCLE VENTES, retenu et planifié — sans travaux : la
     section « non commencée » du tableau de bord. Le questionnaire est répondu
     et une procédure planifiée : ni obstacle « questionnaire », ni « périmètre
     sans programme ». */
  {
    const tr = (await listFslis(ENG)).find((f) => f.code === 'TRADE_RECEIVABLES');
    if (tr && !['in_scope', 'in_scope_qualitative'].includes(tr.scoping)) {
      await confirmScoping(tr.id, lea, 'in_scope_qualitative',
        'Retenu au titre du cycle ventes : les créances portent la contrepartie du chiffre d’affaires testé (existence, évaluation). Jeu de démonstration.');
    }
    const repondues = new Set((await answers(ENG, 'TRADE_RECEIVABLES')).map((a) => a.question_code));
    let posees = 0;
    for (const qn of questionsOfScope(cat, 'section')) {
      if (repondues.has(qn.code)) continue;
      await answerQuestion({ engagementId: ENG, fsliCode: 'TRADE_RECEIVABLES', questionCode: qn.code, answer: 'non', detail: '', actorUserId: lea });
      posees++;
    }
    await assessFsli(ENG, 'TRADE_RECEIVABLES', lea);
    const applicables = proceduresDuCycle(cat, 'TRADE_RECEIVABLES').map((p) => p.code);
    const choix = ['CONFIRM', 'RA', 'DETAIL'].find((c) => applicables.includes(c));
    if (choix) await planifierProcedure({ engagementId: ENG, fsliCode: 'TRADE_RECEIVABLES', code: choix, userId: lea });
    dire('périmètre : « Clients et comptes rattachés » retenu, questionnaire répondu, procédure planifiée', Boolean(tr && choix),
      tr ? `${posees} question(s) répondue(s) · procédure ${choix ?? 'AUCUNE applicable'}` : 'poste absent de la balance');
  }

  /* 3. LES PAPIERS DU POSTE, à des états de visa différents, par le programme. */
  {
    const applicables = new Set(proceduresDuCycle(cat, 'REVENUE').map((p) => p.code));
    const faits: string[] = [];
    for (const p of PAPIERS.filter((x) => applicables.has(x.code))) {
      const { id: procId } = await planifierProcedure({ engagementId: ENG, fsliCode: 'REVENUE', code: p.code, userId: karim });
      const existant = await q01<{ code: string; status: string; version: number }>(
        `select code, status, version from workpaper where procedure_id = $1 order by version desc limit 1`, [procId]);
      if (existant) { faits.push(`${existant.code} ${existant.status} v${existant.version} (déjà)`); continue; }
      const wp = await redigerPapierDeProcedure({ procedureId: procId, userId: karim });
      await enregistrerIpe(wp.id, { utilisee: false }, karim);
      if (p.etat !== 'draft') await signWorkpaper(wp.id, karim, 'preparer_validator');
      if (p.etat === 'signed') {
        await signWorkpaper(wp.id, lea, 'reviewer');
        await signWorkpaper(wp.id, claire, 'partner');
      }
      if (p.etat === 'perime') {
        const v2 = await redigerPapierDeProcedure({
          procedureId: procId, userId: karim,
          motif: 'papier refait après l’arrivée des pièces complémentaires (second passage) — le visa de la version 1 est périmé',
        });
        await enregistrerIpe(v2.id, { utilisee: false }, karim);
      }
      faits.push(`${wp.code} → ${p.etat}`);
    }
    dire('papiers du poste : un visé, deux en revue, un en préparation, un dont le visa est périmé', faits.length >= 4, faits.join(' · '));
  }

  /* 4. LES SECTIONS, réparties entre les quatre membres — propriétaire et
     détenteur sont deux mécanismes (sections.ts) ; on ne touche qu'à ce qui
     n'est pas déjà attribué. */
  {
    await assurerSections(ENG);
    const secs = await sectionsDuDossier(ENG);
    const parProc = new Map((await proceduresPlanifiees(ENG, 'REVENUE')).map((p) => [p.code, p.papier?.id ?? null]));
    const cibles: { kind: 'poste' | 'papier'; ref: string | null; owner: string; holder: string }[] = [
      { kind: 'poste', ref: 'TRADE_RECEIVABLES', owner: lea, holder: hugo },
      { kind: 'papier', ref: parProc.get('CUTOFF') ?? null, owner: karim, holder: lea },
      { kind: 'papier', ref: parProc.get('MANUEL') ?? null, owner: karim, holder: claire },
      { kind: 'papier', ref: parProc.get('RA') ?? null, owner: hugo, holder: hugo },
      { kind: 'papier', ref: parProc.get('RECALC') ?? null, owner: hugo, holder: lea },
    ];
    let touchees = 0;
    for (const c of cibles) {
      if (!c.ref) continue;
      const s = secs.find((x) => x.kind === c.kind && x.ref === c.ref);
      if (!s) continue;
      if (!s.ownerId) { await attribuerA(s.id, c.owner, claire); touchees++; }
      if (!s.holderId) { await envoyerA(s.id, c.holder, claire); touchees++; }
    }
    const etats = new Set((await sectionsDuDossier(ENG)).map((s) => s.statut));
    dire('sections : les quatre états, réparties entre quatre membres', etats.size === 4, `états présents : ${[...etats].join(', ')} · ${touchees} attribution(s)/envoi(s)`);
  }

  /* 5. LES NOTES DE REVUE OUVERTES, d'ancienneté variable en jours ouvrés —
     dont une sur une CELLULE de la grille et une sur une cellule de la
     leadsheet. La date de pose est celle du monde : un dossier vivant a des
     notes qui datent. */
  {
    const parProc = new Map((await proceduresPlanifiees(ENG, 'REVENUE')).map((p) => [p.code, p.papier]));
    const cutoff = parProc.get('CUTOFF');
    const ra = parProc.get('RA');
    const ligne = await q01<{ natural_key: string; piece_ref: string | null }>(
      `select g.natural_key, g.piece_ref from sample_item si
       join sample s on s.id = si.sample_id join gl_entry g on g.id = si.unit_id
       where s.engagement_id = $1 and s.status = 'drawn' and si.unit_kind = 'gl_entry' and g.account_no like '70%'
       order by g.entry_date, g.natural_key limit 1`, [ENG]);
    const compte = await q01<{ number: string }>(
      `select a.number from account a join tb_snapshot s on s.id = a.tb_snapshot_id
       where s.engagement_id = $1 and s.period_kind = 'current' and s.status = 'active' and a.number like '70%'
       order by a.number limit 1`, [ENG]);
    const notes: { texte: string; type: NoteType; auteur: string; dest: string; papier: string | null; ancre: Ancre | null; age: number }[] = [
      {
        texte: 'Le seuil de séparation retenu (cinq jours) est à rapprocher de la politique de facturation décrite au processus ventes : préciser la source dans la conclusion.',
        type: 'a_corriger', auteur: lea, dest: karim, papier: cutoff?.id ?? null,
        ancre: cutoff ? { kind: 'workpaper_section', ref: `${cutoff.code}:conclusion`, field: null, label: `${cutoff.code} — Conclusion` } : null, age: 6,
      },
      {
        texte: 'La revue analytique cite le volume facturé : joindre la statistique commerciale qui l’étaye.',
        type: 'question', auteur: claire, dest: hugo, papier: ra?.id ?? null,
        ancre: ra ? { kind: 'workpaper_section', ref: `${ra.code}:objectif`, field: null, label: `${ra.code} — Objectif et seuils` } : null, age: 2,
      },
      {
        texte: 'Montant HT relevé sur la pièce : confirmer que la remise de fin d’année n’est pas déjà déduite.',
        type: 'a_documenter', auteur: lea, dest: karim, papier: null,
        ancre: ligne ? { kind: 'sample_item', ref: ligne.natural_key, field: 'montant_ht', label: `Écriture ${ligne.piece_ref ?? ligne.natural_key} · Montant HT` } : null, age: 9,
      },
      {
        texte: 'Le solde progresse plus vite que les volumes livrés : l’expliquer dans la revue analytique du poste.',
        type: 'question', auteur: claire, dest: lea, papier: null,
        ancre: compte ? { kind: 'compte', ref: `REVENUE|${compte.number}`, field: 'solde', label: `${compte.number} · Solde N` } : null, age: 1,
      },
      {
        texte: 'Pour N+1 : prévoir la circularisation des cinq premiers clients dès l’intérim.',
        type: 'remarque_n1', auteur: lea, dest: karim, papier: cutoff?.id ?? null, ancre: null, age: 14,
      },
    ];
    let posees = 0;
    const ages: number[] = [];
    for (const note of notes) {
      if (!note.ancre && !note.papier) continue;
      const deja = await q01<{ id: string }>(`select id::text from review_note where engagement_id = $1 and text = $2`, [ENG, note.texte]);
      if (deja) { ages.push(note.age); continue; }
      const id = await addReviewNote(ENG, note.papier, note.auteur, note.dest, note.texte,
        { noteType: note.type, ...(note.ancre ? { ancre: note.ancre } : {}) });
      await q(`update review_note set created_at = $2 where id = $1`, [id, joursOuvresAvant(note.age).toISOString()]);
      posees++;
      ages.push(note.age);
    }
    dire('notes de revue ouvertes, d’ancienneté variable (jours ouvrés), dont une sur une cellule de la grille et une sur une cellule de la leadsheet',
      ages.length >= 4 && Boolean(ligne) && Boolean(compte), `${posees} posée(s) · anciennetés ${ages.map((a) => `${a} j`).join(', ')}`);
  }

  /* 6. LE PROCESSUS VENTES, N-1 et N, ses changements statués. */
  {
    const avant = await lireProcessus(ENG, 'REVENUE');
    if (!avant.n1) {
      await importerProcessus({ engagementId: ENG, exercice: 'n1', filename: 'revenus_2024.json', contenu: fs.readFileSync(ds('processus', 'revenus_2024.json')), userId: karim });
    }
    if (!avant.n) {
      await importerProcessus({ engagementId: ENG, exercice: 'n', filename: 'revenus_2025.json', contenu: fs.readFileSync(ds('processus', 'revenus_2025.json')), userId: karim });
    }
    const diff = await diffProcessus(ENG, 'REVENUE');
    let statues = 0;
    for (const c of diff?.aStatuer ?? []) {
      await statuerChangement({
        engagementId: ENG, cycle: 'REVENUE', changeCode: c.code, significance: 'non_significatif',
        reason: 'Changement décrit à l’entretien de compréhension du cycle ; sans incidence sur les assertions testées (jeu de démonstration).',
        userId: lea,
      });
      statues++;
    }
    const apres = await lireProcessus(ENG, 'REVENUE');
    dire('processus ventes décrit (N-1 et N), changements statués', Boolean(apres.n && apres.n1),
      `${apres.n ? 'N' : '—'}/${apres.n1 ? 'N-1' : '—'} · ${diff?.changements.length ?? 0} changement(s), ${statues} statué(s) maintenant`);
  }

  /* 7. LA MATRICE RISQUES-CONTRÔLES du cycle — la même que celle de l'entité. */
  {
    const avant = await listControls(ENG);
    if (avant.length === 0) await importRcm(ENG, fs.readFileSync(ds('sox', 'rcm.csv'), 'utf8'), karim);
    const apres = await listControls(ENG);
    dire('matrice risques-contrôles du cycle', apres.length > 0, `${apres.length} contrôle(s)`);
  }

  /* 8. LA GRILLE calculée et quelques lignes CONCLUES — par la règle (TEST-04) :
     une ligne se conclut quand ses cellules sont conformes ou disposées. */
  {
    const sample = await currentRevenueSample(ENG);
    let conclues = 0; let disposees = 0; let deja = 0;
    if (sample?.status === 'drawn') {
      const existante = await grilleDuDossier(ENG);
      const cellulesAvant = existante ? Object.keys((await cellulesDuDossier(ENG)).cellules).length : 0;
      if (!existante || cellulesAvant === 0) await calculerGrille(ENG, karim);
      const { cellules, conclusions } = await cellulesDuDossier(ENG);
      /* Les lignes DÉJÀ conclues se comptent AVANT la boucle : comptées au fil de
         l'itération, une ligne non conclue rencontrée avant elles passait sous le
         plafond — et chaque passage en concluait une de plus (cas connu mauvais
         de l'idempotence, enrichir.test.ts). */
      deja = Object.values(conclusions).filter((c) => !c.perimee).length;
      for (const [itemId, cells] of Object.entries(cellules)) {
        if (conclusions[itemId] && !conclusions[itemId].perimee) continue;
        if (cells.some((c) => c.etat === 'non_recevable')) continue;
        const ouvertes = cells.filter((c) => c.etat !== 'conforme' && !c.disposition);
        /* QUELQUES lignes, pas toutes : quatre au total, déjà conclues comprises —
           un second passage n'en conclut pas quatre de plus (idempotence). */
        if (deja + conclues >= 4) continue;
        if (ouvertes.length === 0) {
          await conclureLigne(ENG, itemId, karim); conclues++; continue;
        }
        if (disposees === 0 && ouvertes.every((c) => c.etat === 'absent')) {
          for (const c of ouvertes) {
            await disposerCellule(ENG, c.id, karim,
              'Champ absent de la pièce (bon de livraison sans la mention) — vu par le préparateur, sans incidence sur le montant comptabilisé.');
          }
          await conclureLigne(ENG, itemId, karim); disposees++; conclues++;
        }
      }
    }
    dire('grille de test calculée, lignes conclues', conclues + deja > 0, `${conclues} conclue(s) maintenant (${disposees} après disposition) · ${deja} déjà conclue(s)`);
  }

  /* 9. LA REVUE ANALYTIQUE DU POSTE, rédigée — l'espace n'est plus vide. */
  {
    const existante = await lireAnalytique(ENG, 'REVENUE');
    if (!existante) {
      await enregistrerAnalytique(ENG, 'REVENUE', karim,
        'Le chiffre d’affaires progresse avec le volume facturé au second semestre (nouveaux comptes EDI) ; la marge unitaire est stable. L’écart à l’attente reste en deçà du seuil de précision retenu : aucune investigation complémentaire à ce stade. À corroborer avec la statistique commerciale demandée à la cliente.',
        { origine: 'humaine' });
    }
    dire('revue analytique du poste rédigée', true, existante ? `déjà rédigée (v${existante.version})` : 'v1 rédigée par le préparateur');
  }

  /* 10. CE QUI N'EST PAS FABRIQUÉ : les écarts ouverts. Comptés, pas inventés. */
  {
    const r = await q01<{ ouverts: string; total: string }>(
      `select count(*) filter (where status not in ('resolved','scope_limitation'))::text ouverts, count(*)::text total
       from exception where engagement_id = $1`, [ENG]);
    dire('écarts rattachés à leur papier', true,
      `${r?.total ?? 0} écart(s) dont ${r?.ouverts ?? 0} ouvert(s) — aucun écart n’est fabriqué : un écart naît du contrôle sur pièces`);
  }

  return { etapes };
}
