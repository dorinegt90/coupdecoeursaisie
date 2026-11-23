-- =========================================================
-- Coup de cœur — Schéma de base de données Supabase (v2)
-- =========================================================
-- Pour une INSTALLATION NEUVE uniquement.
-- Si vous avez déjà une base en place, utilisez migration_v3.sql (après migration_v2.sql).

create extension if not exists "pgcrypto";

create table if not exists contacts (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  nom             text not null,
  prenom          text not null,
  age             integer,
  email           text,
  telephone       text,
  adresse         text,
  dept_cp         text,   -- Département ou code postal
  ville           text,
  connu_par       text,
  type_contact    text,
  commentaire_general text,
  updated_at      timestamptz not null default now(),
  pays            text not null default 'France',
  recommande_par  text,
  notes_appel     text,   -- Notes de l'appel découverte
  notes_rdv_physique text, -- Notes du RDV physique
  brevo_synced_at timestamptz,
  user_id         uuid not null default auth.uid()
);

create table if not exists statut (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null references contacts(id) on delete cascade,
  statut            text not null,   -- Prospect / Adhérent / Non qualifié
  date_changement   timestamptz not null default now(),
  commentaire       text,
  -- Rendez-vous en cours : toujours portés par la ligne de statut la plus récente
  appel_decouverte_date  date,
  appel_decouverte_heure time,
  rdv_physique_date      date,
  rdv_physique_heure     time,
  user_id           uuid not null default auth.uid()
);

create table if not exists adhesions (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null unique references contacts(id) on delete cascade,
  type_formule      text,
  montant           numeric(10,2),
  mode_reglement    text,
  nombre_fois       integer default 1,
  date_adhesion     date not null default current_date,
  date_debut_contrat date,
  user_id           uuid not null default auth.uid()
);

create table if not exists suivi_historique (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null references contacts(id) on delete cascade,
  date_commentaire  timestamptz not null default now(),
  commentaire       text not null,
  user_id           uuid not null default auth.uid()
);

create index if not exists idx_contacts_created_at on contacts(created_at);
create index if not exists idx_statut_contact on statut(contact_id);
create index if not exists idx_statut_date on statut(date_changement);
create index if not exists idx_adhesions_date on adhesions(date_adhesion);
create index if not exists idx_suivi_contact on suivi_historique(contact_id);
create index if not exists idx_suivi_date on suivi_historique(date_commentaire);

alter table contacts enable row level security;
alter table statut enable row level security;
alter table adhesions enable row level security;
alter table suivi_historique enable row level security;

create policy "Selection de ses propres contacts" on contacts for select using (auth.uid() = user_id);
create policy "Creation de contacts pour soi-meme" on contacts for insert with check (auth.uid() = user_id);
create policy "Modification de ses propres contacts" on contacts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Suppression de ses propres contacts" on contacts for delete using (auth.uid() = user_id);

create policy "Selection de son propre historique" on statut for select using (auth.uid() = user_id);
create policy "Creation d'historique pour soi-meme" on statut for insert with check (auth.uid() = user_id);
create policy "Modification de son propre historique" on statut for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Suppression de son propre historique" on statut for delete using (auth.uid() = user_id);

create policy "Selection de ses propres adhesions" on adhesions for select using (auth.uid() = user_id);
create policy "Creation d'adhesions pour soi-meme" on adhesions for insert with check (auth.uid() = user_id);
create policy "Modification de ses propres adhesions" on adhesions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Suppression de ses propres adhesions" on adhesions for delete using (auth.uid() = user_id);

create policy "Selection de son propre suivi" on suivi_historique for select using (auth.uid() = user_id);
create policy "Creation de suivi pour soi-meme" on suivi_historique for insert with check (auth.uid() = user_id);
create policy "Modification de son propre suivi" on suivi_historique for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Suppression de son propre suivi" on suivi_historique for delete using (auth.uid() = user_id);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on contacts to authenticated;
grant select, insert, update, delete on statut to authenticated;
grant select, insert, update, delete on adhesions to authenticated;
grant select, insert, update, delete on suivi_historique to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_contacts_updated_at on contacts;
create trigger trg_contacts_updated_at
before update on contacts
for each row execute function set_updated_at();
