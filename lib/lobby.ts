import { getServerSupabase } from './supabase-server';
import { calcPortfolioValue } from './pnl';
import { getRoundStandings } from './scoring';
import type { Lobby, LobbyConfig, Position, Trader } from '@/types';
import type { TraderStanding } from './scoring';

export async function getLobby(id: string): Promise<Lobby | null> {
  const supabase = getServerSupabase();
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
  const supabase = getServerSupabase();
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
  const supabase = getServerSupabase();
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

/**
 * Optimized standings: fetches round, traders, positions, and prices in
 * parallel (2 parallel batches instead of 4 sequential queries), then
 * computes portfolio values in-memory.
 */
export async function getLobbyStandings(
  lobby_id: string,
  round_id: string,
): Promise<TraderStanding[]> {
  const supabase = getServerSupabase();
  // Batch 1: round + traders fetched in parallel with positions + prices
  const [roundRes, tradersRes, positionsRes, pricesRes] = await Promise.all([
    supabase
      .from('rounds')
      .select('id, lobby_id, starting_balance')
      .eq('id', round_id)
      .eq('lobby_id', lobby_id)
      .single(),
    supabase
      .from('traders')
      .select('id, name, team_id, wallet_address, avatar_url, is_eliminated, eliminated_at, lobby_id, created_at')
      .eq('lobby_id', lobby_id),
    supabase
      .from('positions')
      .select('id, trader_id, round_id, symbol, direction, size, leverage, entry_price, exit_price, realized_pnl, opened_at, closed_at, order_type, limit_price, stop_price, trail_pct, trail_peak, status')
      .eq('round_id', round_id),
    supabase
      .from('prices')
      .select('symbol, price'),
  ]);

  const round = roundRes.data;
  if (!round) return [];

  const traders = tradersRes.data as Trader[] | null;
  if (!traders || traders.length === 0) return [];

  // Build price map
  const currentPrices: Record<string, number> = {};
  for (const p of pricesRes.data ?? []) {
    currentPrices[p.symbol] = p.price;
  }

  // Index positions by trader_id for O(1) lookup instead of O(n) filter per trader
  const allPositions = (positionsRes.data ?? []) as Position[];
  const positionsByTrader = new Map<string, { open: Position[]; closed: Position[] }>();

  for (const pos of allPositions) {
    let bucket = positionsByTrader.get(pos.trader_id);
    if (!bucket) {
      bucket = { open: [], closed: [] };
      positionsByTrader.set(pos.trader_id, bucket);
    }
    if (pos.closed_at) {
      bucket.closed.push(pos);
    } else {
      bucket.open.push(pos);
    }
  }

  // Calculate portfolio values in a single pass
  const portfolioValues: Record<string, number> = {};
  const startingBalance = round.starting_balance;

  for (const trader of traders) {
    const bucket = positionsByTrader.get(trader.id);
    if (bucket) {
      portfolioValues[trader.id] = calcPortfolioValue(
        startingBalance,
        bucket.open,
        bucket.closed,
        currentPrices,
      );
    } else {
      portfolioValues[trader.id] = startingBalance;
    }
  }

  return getRoundStandings(traders, portfolioValues, startingBalance);
}

export async function getLobbyConfig(lobby_id: string): Promise<LobbyConfig | null> {
  const lobby = await getLobby(lobby_id);
  if (!lobby) return null;
  return lobby.config;
}
