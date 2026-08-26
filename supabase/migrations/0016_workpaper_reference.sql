-- 0016_workpaper_reference : la référence du papier dans le plan de classement DU CABINET.
--
-- CE QUI MANQUAIT. Un papier portait un `code` (« REV-01 ») imposé par le
-- produit. Or ce dont un réviseur se sert pour savoir OÙ les travaux ont été
-- faits, c'est la référence du plan de classement du cabinet — A-01, R-100,
-- selon SA convention. Elle n'existait pas du tout : le papier sortait avec
-- notre numérotation, dans son dossier.
--
-- La référence est CALCULÉE au moment du projet, par le modèle déclaré dans
-- methodology/papier.json, puis STOCKÉE. Elle n'est pas re-dérivée à
-- l'affichage : un papier signé et archivé doit garder la référence sous
-- laquelle il a été signé, même si le cabinet change son plan de classement
-- l'année suivante.

alter table workpaper add column reference text;

comment on column workpaper.reference is
  'Référence dans le plan de classement du cabinet, calculée par methodology/papier.json au moment du projet puis figée : un papier signé garde la référence sous laquelle il a été signé.';

-- DEUX PAPIERS DIFFÉRENTS NE PARTAGENT PAS UNE RÉFÉRENCE — un renvoi ambigu ne
-- se suit pas. Mais les VERSIONS SUCCESSIVES d'un même papier la partagent :
-- c'est le même papier, et un réviseur qui a écrit « voir A-01 » dans une note
-- doit encore le trouver après une reprise.
--
-- Un index unique ne sait pas dire cela : `unique (engagement_id, reference)`
-- interdirait les versions, et `unique (engagement_id, code, reference)`
-- interdit… exactement rien d'utile (c'est l'erreur qu'a attrapée la suite :
-- il empêchait deux versions de partager leur référence, soit le contraire de
-- la règle voulue). La règle est « pour une mission et une référence, un seul
-- code », et cela demande une garde.
create or replace function guard_workpaper_reference() returns trigger
language plpgsql as $$
begin
  if new.reference is null then return new; end if;
  if exists (
    select 1 from workpaper w
    where w.engagement_id = new.engagement_id
      and w.reference = new.reference
      and w.code <> new.code
  ) then
    raise exception
      'référence % déjà attribuée à un autre papier de cette mission — un renvoi ambigu ne se suit pas',
      new.reference;
  end if;
  return new;
end $$;

create trigger workpaper_reference_unique
  before insert or update of reference on workpaper
  for each row execute function guard_workpaper_reference();
