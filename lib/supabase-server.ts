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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || !url.startsWith('http')) {
    _client = createClient('https://placeholder.supabase.co', 'placeholder');
  } else {
    _client = createClient(url, key);
  }

  return _client;
}
