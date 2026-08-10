-- =========================================================
-- Cœur & Co — Schéma de base de données Supabase (PostgreSQL)
-- =========================================================
-- À exécuter dans : Supabase > SQL Editor > New query
-- Choisissez une région Europe (Irlande ou Francfort) à la
-- création du projet Supabase, AVANT d'exécuter ce script.

-- Extension nécessaire pour générer des identifiants uuid
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- Table : contacts
-- Une ligne = une personne, quel que soit son statut actuel
-- ---------------------------------------------------------
create table if not exists contacts (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(), -- "Date" du 1er contact
  nom             text not null,
  prenom          text not null,
  age             integer,
  email           text,
  telephone       text,
  adresse         text,
  code_postal     text,
  ville           text,
  connu_par       text,   -- Recherche Google, Pub Google, Pub Facebook, Journal, Radio, Recommandation, Autre
  type_contact    text,   -- Appel entrant, Mail, Whatsapp, SMS, Facebook, Autre
  commentaire     text,
  statut_actuel   text not null default 'Contact entrant',
  user_id         uuid not null default auth.uid()
);

-- ---------------------------------------------------------
-- Table : statut_historique
-- Trace chaque changement de statut d'un contact, avec la date
-- ---------------------------------------------------------
create table if not exists statut_historique (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null references contacts(id) on delete cascade,
  statut            text not null,
  date_changement   timestamptz not null default now(),
  note              text,
  user_id           uuid not null default auth.uid()
);

-- ---------------------------------------------------------
-- Table : adhesions
-- Une ligne par contact devenu adhérent (infos de la formule)
-- ---------------------------------------------------------
create table if not exists adhesions (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null unique references contacts(id) on delete cascade,
  type_formule      text,
  montant           numeric(10,2),
  mode_reglement    text,   -- Carte bancaire, Chèque, Virement, Espèces, Prélèvement
  nombre_fois       integer default 1,
  date_adhesion     date not null default current_date,
  user_id           uuid not null default auth.uid()
);

-- Index utiles pour les recherches et le tableau de bord
create index if not exists idx_contacts_created_at on contacts(created_at);
create index if not exists idx_contacts_statut on contacts(statut_actuel);
create index if not exists idx_historique_contact on statut_historique(contact_id);
create index if not exists idx_historique_date on statut_historique(date_changement);
create index if not exists idx_adhesions_date on adhesions(date_adhesion);

-- =========================================================
-- Sécurité (RLS) — chaque utilisateur ne voit que SES données
-- =========================================================
alter table contacts enable row level security;
alter table statut_historique enable row level security;
alter table adhesions enable row level security;

-- CONTACTS
create policy "Selection de ses propres contacts"
  on contacts for select
  using (auth.uid() = user_id);

create policy "Creation de contacts pour soi-meme"
  on contacts for insert
  with check (auth.uid() = user_id);

create policy "Modification de ses propres contacts"
  on contacts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Suppression de ses propres contacts"
  on contacts for delete
  using (auth.uid() = user_id);

-- STATUT_HISTORIQUE
create policy "Selection de son propre historique"
  on statut_historique for select
  using (auth.uid() = user_id);

create policy "Creation d'historique pour soi-meme"
  on statut_historique for insert
  with check (auth.uid() = user_id);

create policy "Modification de son propre historique"
  on statut_historique for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Suppression de son propre historique"
  on statut_historique for delete
  using (auth.uid() = user_id);

-- ADHESIONS
create policy "Selection de ses propres adhesions"
  on adhesions for select
  using (auth.uid() = user_id);

create policy "Creation d'adhesions pour soi-meme"
  on adhesions for insert
  with check (auth.uid() = user_id);

create policy "Modification de ses propres adhesions"
  on adhesions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Suppression de ses propres adhesions"
  on adhesions for delete
  using (auth.uid() = user_id);

-- =========================================================
-- Fin du script.
-- Prochaine étape : Authentication > Providers > Email
-- puis Authentication > Users > Add user, pour créer votre
-- propre compte de connexion (email + mot de passe).
-- =========================================================
