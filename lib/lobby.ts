import { supabase } from './supabase';
import { calcPortfolioValue } from './pnl';
import { getRoundStandings } from './scoring';
import type { Lobby, LobbyConfig, Position, Trader } from '@/types';
import type { TraderStanding } from './scoring';

export async function getLobby(id: string): Promise<Lobby | null> {
  const { data, error } = await supabase
    .from('lobbies')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as Lobby;
}

export async function createLobby(config: {
  name: string;
  format?: string;
  is_public?: boolean;
  invite_code?: string;
  created_by?: string;
  config: LobbyConfig;
}): Promise<Lobby | null> {
  const { data, error } = await supabase
    .from('lobbies')
    .insert({
      name: config.name,
      format: config.format ?? 'elimination',
      is_public: config.is_public ?? true,
      invite_code: config.invite_code,
      created_by: config.created_by,
      config: config.config,
    })
    .select()
    .single();

  if (error || !data) return null;
  return data as Lobby;
}

export async function joinLobby(
  trader_id: string,
  lobby_id: string,
  invite_code?: string,
): Promise<{ success: boolean; error?: string }> {
  const lobby = await getLobby(lobby_id);
  if (!lobby) return { success: false, error: 'Lobby not found' };

  if (!lobby.is_public && lobby.invite_code) {
    if (!invite_code || invite_code !== lobby.invite_code) {
      return { success: false, error: 'Invalid invite code' };
    }
  }

  // Create session for this trader in the lobby
  const { error: sessionError } = await supabase
    .from('sessions')
    .insert({
      trader_id,
      lobby_id,
      starting_balance: lobby.config.starting_balance ?? 10000,
    });

  if (sessionError) return { success: false, error: sessionError.message };

  // Link trader to lobby
  await supabase
    .from('traders')
    .update({ lobby_id })
    .eq('id', trader_id);

  return { success: true };
}

export async function getLobbyStandings(
  lobby_id: string,
  round_id: string,
): Promise<TraderStanding[]> {
  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('id', round_id)
    .eq('lobby_id', lobby_id)
    .single();

  if (!round) return [];

  const { data: traders } = await supabase
    .from('traders')
    .select('*')
    .eq('lobby_id', lobby_id);

  if (!traders || traders.length === 0) return [];

  const { data: positions } = await supabase
    .from('positions')
    .select('*')
    .eq('round_id', round_id);

  const { data: prices } = await supabase.from('prices').select('*');

  const currentPrices: Record<string, number> = {};
  for (const p of prices ?? []) {
    currentPrices[p.symbol] = p.price;
  }

  const allPositions = (positions ?? []) as Position[];
  const portfolioValues: Record<string, number> = {};

  for (const trader of traders as Trader[]) {
    const traderPositions = allPositions.filter((p) => p.trader_id === trader.id);
    const open = traderPositions.filter((p) => !p.closed_at);
    const closed = traderPositions.filter((p) => p.closed_at);
    portfolioValues[trader.id] = calcPortfolioValue(
      round.starting_balance,
      open,
      closed,
      currentPrices,
    );
  }

  return getRoundStandings(traders as Trader[], portfolioValues, round.starting_balance);
}

export async function getLobbyConfig(lobby_id: string): Promise<LobbyConfig | null> {
  const lobby = await getLobby(lobby_id);
  if (!lobby) return null;
  return lobby.config;
}
