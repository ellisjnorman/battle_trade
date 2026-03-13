import { supabase } from './supabase';

/**
 * Verify a trader_id belongs to a specific lobby.
 * Returns the trader row if valid, null otherwise.
 * Uses progressive column fallback for schema cache resilience.
 */
export async function validateTraderInLobby(
  traderId: string,
  lobbyId: string,
): Promise<{ id: string; name: string; lobby_id: string; is_competitor?: boolean } | null> {
  // Try with is_competitor first, fall back without if column missing from cache
  const { data, error } = await supabase
    .from('traders')
    .select('id, name, lobby_id, is_competitor')
    .eq('id', traderId)
    .eq('lobby_id', lobbyId)
    .single();

  if (!error) return data;

  // Fallback: schema cache may not have is_competitor
  const { data: fallback } = await supabase
    .from('traders')
    .select('id, name, lobby_id')
    .eq('id', traderId)
    .eq('lobby_id', lobbyId)
    .single();

  return fallback ? { ...fallback, is_competitor: true } : null;
}
