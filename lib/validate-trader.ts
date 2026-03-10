import { supabase } from './supabase';

/**
 * Verify a trader_id belongs to a specific lobby and matches the request code.
 * Returns the trader row if valid, null otherwise.
 */
export async function validateTraderInLobby(
  traderId: string,
  lobbyId: string,
): Promise<{ id: string; name: string; lobby_id: string; is_competitor: boolean } | null> {
  const { data } = await supabase
    .from('traders')
    .select('id, name, lobby_id, is_competitor')
    .eq('id', traderId)
    .eq('lobby_id', lobbyId)
    .single();

  return data;
}
