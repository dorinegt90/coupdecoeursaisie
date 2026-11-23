-- =========================================================
-- Coup de cœur — Fonction de « keepalive »
-- À exécuter une fois dans le SQL Editor de Supabase.
-- Elle ne renvoie que l'heure du serveur (aucune donnée exposée) ;
-- elle sert au workflow GitHub qui empêche la mise en pause du projet.
-- =========================================================
create or replace function public.ping()
returns timestamptz
language sql
stable
as $$ select now(); $$;

grant execute on function public.ping() to anon, authenticated;
