import { createClient } from "@supabase/supabase-js";

// Supabase → Project Settings → API sahifasidan oling:
//   Project URL  → SUPABASE_URL
//   anon public key → SUPABASE_ANON_KEY
// Bu "anon" kalit ochiq (public) bo'lishi normal — himoya Row Level Security
// (RLS) orqali bo'ladi, quyidagi SQL supabase-setup.sql faylida yozilgan.

const SUPABASE_URL = "https://zjlzfdbuhnjganekyuqp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NCPEvjXVStaRrw9ZhAh2PA_hNZ9OSSX";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
