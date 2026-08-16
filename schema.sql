-- =========================================================
-- Coup de cœur — Schéma de base de données Supabase (v2)
-- =========================================================
-- Pour une INSTALLATION NEUVE uniquement.
-- Si vous avez déjà une base en place, utilisez migration_v2.sql à la place.

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
  commentaire     text,
  statut_actuel   text not null default 'Contact entrant',
  user_id         uuid not null default auth.uid()
);

create table if not exists statut_historique (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null references contacts(id) on delete cascade,
  statut            text not null,
  date_changement   timestamptz not null default now(),
  commentaire       text,
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
create index if not exists idx_contacts_statut on contacts(statut_actuel);
create index if not exists idx_historique_contact on statut_historique(contact_id);
create index if not exists idx_historique_date on statut_historique(date_changement);
create index if not exists idx_adhesions_date on adhesions(date_adhesion);
create index if not exists idx_suivi_contact on suivi_historique(contact_id);
create index if not exists idx_suivi_date on suivi_historique(date_commentaire);

alter table contacts enable row level security;
alter table statut_historique enable row level security;
alter table adhesions enable row level security;
alter table suivi_historique enable row level security;

create policy "Selection de ses propres contacts" on contacts for select using (auth.uid() = user_id);
create policy "Creation de contacts pour soi-meme" on contacts for insert with check (auth.uid() = user_id);
create policy "Modification de ses propres contacts" on contacts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Suppression de ses propres contacts" on contacts for delete using (auth.uid() = user_id);

create policy "Selection de son propre historique" on statut_historique for select using (auth.uid() = user_id);
create policy "Creation d'historique pour soi-meme" on statut_historique for insert with check (auth.uid() = user_id);
create policy "Modification de son propre historique" on statut_historique for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Suppression de son propre historique" on statut_historique for delete using (auth.uid() = user_id);

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
grant select, insert, update, delete on statut_historique to authenticated;
grant select, insert, update, delete on adhesions to authenticated;
grant select, insert, update, delete on suivi_historique to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
