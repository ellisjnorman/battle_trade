import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const LOBBY_CONFIG = {
  name: 'Battle Trade x Consensus Miami',
  invite_code: 'CONSENSUS2026',
  config: {
    operator_controlled: true,
    credit_source: 'sponsor_funded',
    starting_balance: 10000,
    available_symbols: [] as string[],
    leverage_tiers: [1, 2, 5, 10],
    volatility_engine: 'manual',
    round_duration_seconds: 1200,
    trade_execution_mode: 'paper_only',
  },
};

async function seed() {
  console.log('Checking for existing Consensus Miami lobby...');

  const { data: existing } = await supabase
    .from('lobbies')
    .select('id')
    .eq('invite_code', LOBBY_CONFIG.invite_code)
    .single();

  if (existing) {
    console.log(`Lobby already exists: ${existing.id}`);
    console.log('Skipping insert — idempotent.');
    return;
  }

  console.log('Creating Consensus Miami lobby...');

  const { data: lobby, error } = await supabase
    .from('lobbies')
    .insert({
      name: LOBBY_CONFIG.name,
      invite_code: LOBBY_CONFIG.invite_code,
      config: LOBBY_CONFIG.config,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create lobby:', error.message);
    process.exit(1);
  }

  console.log(`Lobby created: ${lobby.id}`);

  // Seed initial prices
  const prices = [
    { symbol: 'BTCUSDT', price: 97000, updated_at: new Date().toISOString() },
    { symbol: 'ETHUSDT', price: 3200, updated_at: new Date().toISOString() },
    { symbol: 'SOLUSDT', price: 189, updated_at: new Date().toISOString() },
  ];

  const { error: priceError } = await supabase
    .from('prices')
    .upsert(prices, { onConflict: 'symbol' });

  if (priceError) {
    console.error('Failed to seed prices:', priceError.message);
  } else {
    console.log('Prices seeded: BTC, ETH, SOL');
  }

  // Create first round
  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .insert({
      event_id: lobby.id,
      lobby_id: lobby.id,
      round_number: 1,
      status: 'pending',
      starting_balance: 10000,
      duration_seconds: 1200,
      elimination_pct: 20,
    })
    .select()
    .single();

  if (roundError) {
    console.error('Failed to create round:', roundError.message);
  } else {
    console.log(`Round 1 created: ${round.id}`);
  }

  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
