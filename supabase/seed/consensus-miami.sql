insert into lobbies (name, invite_code, config)
values (
  'Battle Trade x Consensus Miami',
  'CONSENSUS2026',
  '{
    "operator_controlled": true,
    "credit_source": "sponsor_funded",
    "starting_balance": 10000,
    "available_symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    "leverage_tiers": [1, 2, 5, 10],
    "volatility_engine": "manual",
    "round_duration_seconds": 1200
  }'::jsonb
);
