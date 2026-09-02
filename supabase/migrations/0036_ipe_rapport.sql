-- 0036 — L'INFORMATION PRODUITE PAR L'ENTITÉ : UN SEUL OBJET, AU NIVEAU DU
-- RAPPORT, PARTAGÉ PAR LES PAPIERS DU DOSSIER (Groupe 1, item 1.8).
--
-- 0031 posait la question sur CHAQUE papier, et la réponse — nature, pièce,
-- exhaustivité, exactitude, date — vivait dans la ligne du papier. Deux
-- papiers qui s'appuient sur le même état système le documentaient deux
-- fois, et rien ne disait qu'un papier réutilisait un état d'une AUTRE
-- période que la sienne. L'objet devient le RAPPORT : nom, système source,
-- paramètres, période couverte, généré par qui et quand, empreinte du
-- fichier, nature, et les deux éléments testés (exhaustivité, exactitude).
-- Le papier le DÉSIGNE ; réutiliser un rapport pour une autre période est
-- refusé par le service, les deux dates côte à côte, et un nouveau test IPE
-- est proposé.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS, ET LE DIT : l'inventaire des
-- applications informatiques (système source = un texte libre cette nuit) ;
-- la balance auxiliaire, qui n'est pas un `import_file` mais une pièce
-- (`aux_balance_file` → evidence) — un rapport peut la désigner par
-- `evidence_id`, pas par `import_file_id`.

create table ipe_rapport (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  /* le nom de l'état et son code dans le système (ex. SAP ZFI_AGEING) */
  nom text not null,
  code_rapport text,
  /* le système source — texte libre cette nuit, inventaire reporté */
  systeme_source text,
  /* les paramètres et filtres de l'extraction, tels qu'écrits */
  parametres text,
  /* la période couverte : la date d'arrêté est la clé de réutilisation */
  periode_debut date,
  periode_fin date not null,
  genere_par text,
  genere_le date,
  /* l'empreinte du fichier désigné, recopiée à la création : un rapport
     désigne des octets, pas un nom de fichier */
  empreinte text,
  nature text not null check (nature in ('systeme','systeme_modifie','manuelle')),
  /* LE MÊME OBJET que celui reçu ou importé — exactement l'un des deux */
  evidence_id uuid references evidence(id),
  import_file_id uuid references import_file(id),
  /* les deux éléments testés */
  exhaustivite text not null,
  exactitude text not null,
  redige_par_ia boolean not null default false,
  valide_par uuid references app_user(id),
  valide_le timestamptz,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  /* un nom et une date d'arrêté font UN test IPE ; un autre arrêté, c'est un
     autre test — c'est ce que « nouveau test IPE » veut dire */
  unique (engagement_id, nom, periode_fin),
  constraint ipe_rapport_documente check (
    (evidence_id is not null) <> (import_file_id is not null)
    and btrim(nom) <> ''
    and btrim(exhaustivite) <> ''
    and btrim(exactitude) <> ''
  )
);
create index ipe_rapport_eng on ipe_rapport (engagement_id, periode_fin desc);

/* Le papier DÉSIGNE le rapport. Les colonnes de 0031 restent, lues par
   compatibilité ; la documentation vit désormais sur le rapport. */
alter table ipe add column rapport_id uuid references ipe_rapport(id);

/* Les réponses « oui » existantes deviennent chacune un rapport : rien ne se
   perd. Deux papiers qui documentaient le même nom au même arrêté avec des
   textes DIFFÉRENTS ne sont pas fusionnés (le second serait lu avec la
   documentation du premier — revue hostile n°6) : le second rapport porte le
   code du papier en suffixe. Un nom de fichier vide ne fait pas un nom. */
with lignes as (
  select i.id ipe_id, w.engagement_id, w.code papier,
         coalesce(nullif(btrim(i.rapport_code), ''), nullif(f.filename, ''), nullif(e.filename, ''), 'rapport') base,
         coalesce(i.date_document, current_date) arrete,
         i.rapport_code, coalesce(f.sha256, e.sha256) empreinte,
         case i.nature when 'systeme' then 'systeme' else 'manuelle' end nature,
         i.evidence_id, i.import_file_id, coalesce(i.exhaustivite, '') exh, coalesce(i.exactitude, '') exa,
         i.redige_par_ia, i.valide_par, i.valide_le, i.created_at,
         row_number() over (partition by w.engagement_id,
           coalesce(nullif(btrim(i.rapport_code), ''), nullif(f.filename, ''), nullif(e.filename, ''), 'rapport'),
           coalesce(i.date_document, current_date)
           order by i.created_at, i.id) rn
  from ipe i
  join workpaper w on w.id = i.workpaper_id
  left join import_file f on f.id = i.import_file_id
  left join evidence e on e.id = i.evidence_id
  where i.utilisee = true
), nommees as (
  select *, case when rn = 1 then base else base || ' · ' || papier end nom from lignes
), inserees as (
  insert into ipe_rapport (engagement_id, nom, code_rapport, periode_fin, empreinte, nature,
                           evidence_id, import_file_id, exhaustivite, exactitude, redige_par_ia,
                           valide_par, valide_le, created_by, created_at)
  select engagement_id, nom, rapport_code, arrete, empreinte, nature,
         evidence_id, import_file_id, exh, exa, redige_par_ia, valide_par, valide_le, valide_par, created_at
  from nommees
  returning id, engagement_id, nom, periode_fin
)
update ipe i set rapport_id = r.id
from nommees n join inserees r on r.engagement_id = n.engagement_id and r.nom = n.nom and r.periode_fin = n.arrete
where i.id = n.ipe_id;

/* La garde du papier change de forme, pas de nom : « oui » exige un rapport
   désigné. Le registre des gardes (G-08) l'attaque sous ce nom. */
alter table ipe drop constraint ipe_documente;
alter table ipe add constraint ipe_documente check (utilisee = false or rapport_id is not null);

/* L'IMPORT CAPTURE L'IPE AU MOMENT DE L'IMPORT (item 1.8) : système source,
   généré par le système ou manuel, identifiant du rapport, date et auteur
   de l'extraction. Facultatifs — rien ne bloque la démonstration semée
   (règle 2 de la nuit) ; l'écran d'import les demande, et un rapport IPE créé
   sur ce fichier les reprend. */
alter table import_file
  add column systeme_source text,
  add column nature_ipe text check (nature_ipe in ('systeme','systeme_modifie','manuelle')),
  add column identifiant_rapport text,
  add column extrait_le date,
  add column extrait_par text;

do $$ begin
  execute 'alter table ipe_rapport enable row level security';
  execute 'create policy ipe_rapport_eng on ipe_rapport using (engagement_id in (select otto_engagements()))';
  execute 'alter table ipe_rapport force row level security';
end $$;
