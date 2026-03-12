import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the service role key.
 * Use this for server-only operations like writing prices, admin mutations, etc.
 * NEVER expose this to the browser.
 */
export function getServerSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey ?? anonKey;

  if (!serviceKey && anonKey) {
    console.warn('[supabase-server] SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon key. Server-side writes may fail with RLS.');
  }

  if (!url || !key || !url.startsWith('http')) {
    console.error('[supabase-server] Missing NEXT_PUBLIC_SUPABASE_URL or key — using placeholder client.');
    _client = createClient('https://placeholder.supabase.co', 'placeholder');
  } else {
    _client = createClient(url, key);
  }

  return _client;
}
