-- 0132 — LA MÉMOIRE DES REPLIS EN BASE, PAR PERSONNE (mandat de nuit n°2, 1.2).
--
-- CE QUI MANQUAIT. Une section repliée sur la page de poste était retenue par le
-- NAVIGATEUR (localStorage) : la même personne, sur un autre poste de travail,
-- retrouvait tout ouvert ; deux personnes sur la même machine partageaient leurs
-- rangements. Le repli est un choix de LA PERSONNE, il la suit : il se retient
-- en base, par compte, et le serveur le connaît au premier rendu — plus de
-- section qui s'ouvre puis se referme après l'hydratation.
--
-- CE QUE CETTE TABLE N'EST PAS : du contenu du dossier. Elle ne porte aucune
-- décision d'audit, aucune preuve, aucun visa ; les questions de P7 (« pourquoi
-- cette preuve existe-t-elle ? ») ne la concernent jamais. Elle n'entre donc
-- pas dans le journal des événements (docs/DECISIONS.md, ADR-125 : exception
-- déclarée, pas oubliée) et son verdict de verrou est « lecture », comme
-- section_state : un dossier scellé n'empêche personne de ranger son écran.
--
-- LA CLÉ est celle de la section, pas de la page : replier « Papiers » sur un
-- poste le replie sur tous les postes — on range une nature de contenu. Elle
-- est bornée (REPLI-01, contrainte ui_repli_cle_valide) : une clé libre serait
-- un canal d'écriture arbitraire ouvert à tout client.

create table ui_repli (
  tenant_id uuid not null references tenant(id) on delete cascade,
  user_id uuid not null references app_user(id) on delete cascade,
  cle text not null,
  ouvert boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, cle),
  constraint ui_repli_cle_valide check (cle ~ '^[A-Za-z0-9_.:-]{1,120}$')
);
create index ui_repli_tenant on ui_repli (tenant_id);

alter table ui_repli enable row level security;
alter table ui_repli force row level security;
create policy ui_repli_tenant on ui_repli
  using (tenant_id = otto_tenant()) with check (tenant_id = otto_tenant());

insert into engagement_lock_verdict (table_name, verdict, reason) values
  ('ui_repli', 'lecture', 'rangement d’écran par personne : ni contenu ni décision du dossier — un dossier scellé se range encore');
