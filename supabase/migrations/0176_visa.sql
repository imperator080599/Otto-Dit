-- 0176 — P1-04 (AUD-05, AUD-09 partie modèle, docs/MANDATS/2026-09-20_plan_maitre_phase2.md §7.4).
-- Numérotée 0176, pas 0173 comme l'esquisse du plan le nomme : la bande 0170+ a glissé
-- (0171/0173/0175 déjà consommées par des correctifs — voir leurs propres en-têtes ; le mandat du
-- 2026-09-23 §3 le dit explicitement : les numéros du plan sont indicatifs, jamais renumérotés
-- après application).
--
-- CE QUE CETTE MIGRATION FAIT, DANS L'ORDRE :
--   1. signoff.sections_hash : l'empreinte canonique de workpaper.sections au moment du visa —
--      colonne posée ici, jamais backfillée en SQL (voir DÉCISION DE PÉRIMÈTRE ci-dessous).
--   2. VISA-01/02/03 : trois déclencheurs BEFORE INSERT sur signoff, security invoker — le
--      filet de dernier rang. Le service (workpapers/lifecycle.ts::signWorkpaper) porte le même
--      refus, nommé, AVANT d'écrire ; ces triggers ne sont jamais le premier message qu'un
--      auditeur voit, ils empêchent qu'un chemin futur les contourne en silence.
--   3. EQUIPE-01 : un déclencheur BEFORE UPDATE OF eng_role, can_sign sur engagement_member —
--      exige `current_setting('otto.acteur_role', true) in ('manager','partner')`, posé par
--      `withActeur()` (lib/db/acteur.ts, cette même tranche) dans la transaction du service.
--
-- DÉCISION DE PÉRIMÈTRE, CONSIGNÉE (pas devinée) : le plan dit « backfill = empreinte courante,
-- avec event_log signoff.hash_backfill ». `migrate()` (lib/db/migrate.ts) n'exécute que des
-- fichiers .sql — aucune capacité d'enchaîner un script TypeScript après une migration n'existe
-- encore dans ce dépôt (le plan lui-même le dit, §7.9, à propos d'un besoin similaire pour
-- P1-09/portal_token : « si sha256() n'est pas disponible sur PGlite, le backfill est fait par
-- le script de migration TypeScript ... ajouter cette capacité si absente »). PGlite ne porte pas
-- pgcrypto de façon fiable (vérifié : aucune migration existante n'utilise digest()/sha256() en
-- SQL natif, malgré 60+ migrations). Construire cette capacité maintenant serait de la mécanique
-- HORS PÉRIMÈTRE de cette tranche (P1-09 la nommera pour de vrai). `sections_hash` est donc posée
-- NULLABLE, remplie par le SERVICE pour tout NOUVEAU visa (hashObject(sections), core/hash.ts —
-- la même fonction canonique que controlPopulationHash utilise déjà ailleurs) ; les lignes
-- EXISTANTES sont backfillées par un script ponctuel (`scripts/backfill-signoff-hash.ts`, lancé
-- une fois après cette migration, JAMAIS partie de `migrate()`), qui calcule l'empreinte COURANTE
-- de chaque workpaper signé et écrit la ligne event_log `signoff.hash_backfill` — exactement ce
-- que le plan demande, par le seul mécanisme qui existe aujourd'hui pour le faire.

alter table signoff add column sections_hash text;

create or replace function assert_visa01_unicite() returns trigger
language plpgsql security invoker as $$
begin
  if exists (select 1 from signoff where workpaper_id = new.workpaper_id and sign_role = new.sign_role) then
    raise exception 'VISA-01: workpaper % already has a % sign-off on this version', new.workpaper_id, new.sign_role;
  end if;
  return new;
end;
$$;

create or replace function assert_visa02_utilisateur_distinct() returns trigger
language plpgsql security invoker as $$
begin
  if exists (select 1 from signoff where workpaper_id = new.workpaper_id and user_id = new.user_id) then
    raise exception 'VISA-02: user % has already signed a different role on workpaper %', new.user_id, new.workpaper_id;
  end if;
  return new;
end;
$$;

create or replace function assert_visa03_role() returns trigger
language plpgsql security invoker as $$
declare
  m record;
begin
  select em.eng_role, em.can_sign into m
    from engagement_member em join workpaper w on w.engagement_id = em.engagement_id
    where w.id = new.workpaper_id and em.user_id = new.user_id;
  if not found then
    raise exception 'VISA-03: user % is not a member of the engagement for workpaper %', new.user_id, new.workpaper_id;
  end if;
  if new.sign_role = 'reviewer' and m.eng_role not in ('manager', 'partner') then
    raise exception 'VISA-03: reviewer sign-off requires manager or partner role (user % is %)', new.user_id, m.eng_role;
  end if;
  if new.sign_role = 'partner' and not m.can_sign then
    raise exception 'VISA-03: partner sign-off requires signing rights (user % does not have can_sign)', new.user_id;
  end if;
  return new;
end;
$$;

create trigger visa01_unicite before insert on signoff
  for each row execute function assert_visa01_unicite();
create trigger visa02_utilisateur_distinct before insert on signoff
  for each row execute function assert_visa02_utilisateur_distinct();
create trigger visa03_role before insert on signoff
  for each row execute function assert_visa03_role();

create or replace function assert_equipe01_acteur() returns trigger
language plpgsql security invoker as $$
begin
  if coalesce(current_setting('otto.acteur_role', true), '') not in ('manager', 'partner') then
    raise exception 'EQUIPE-01: eng_role/can_sign can only change under a manager or partner actor context';
  end if;
  return new;
end;
$$;

create trigger equipe01_acteur_manager_partner before update of eng_role, can_sign on engagement_member
  for each row execute function assert_equipe01_acteur();
