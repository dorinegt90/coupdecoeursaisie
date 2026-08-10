// =========================================================
// Configuration Supabase — à compléter
// =========================================================
// 1. Allez dans votre projet Supabase > Project Settings > API
// 2. Copiez "Project URL" et collez-le ci-dessous (SUPABASE_URL)
// 3. Copiez la clé "anon public" et collez-la ci-dessous (SUPABASE_ANON_KEY)
//
// Cette clé "anon" n'est PAS secrète : elle est prévue pour être
// visible dans le code du site. C'est la sécurité RLS (mise en
// place dans schema.sql) qui protège réellement vos données.
// Ne mettez jamais ici la clé "service_role".

const SUPABASE_URL = "https://VOTRE-PROJET.supabase.co";
const SUPABASE_ANON_KEY = "VOTRE_CLE_ANON_PUBLIC";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
