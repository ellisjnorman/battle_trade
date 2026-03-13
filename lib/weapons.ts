// ---------------------------------------------------------------------------
// Single source of truth for all Market Event Cards (attacks) and
// Counter-Strategies (defenses).
//
// Legal framing: These are simulated market conditions, not "attacks."
// Each card represents a real phenomenon traders encounter.
// Import from here — never hardcode weapon arrays elsewhere.
// ---------------------------------------------------------------------------

export const ATTACKS = [
  { id: 'blackout',      name: 'BLACKOUT',      icon: '🔒', cost: 200, duration: 90,  desc: 'Exchange outage — trades frozen 90s',       kind: 'attack' as const },
  { id: 'fake_news',     name: 'HEADLINE',      icon: '📰', cost: 150, duration: 8,   desc: 'Breaking news event shakes the market',     kind: 'attack' as const },
  { id: 'leverage_cap',  name: 'LEVERAGE CAP',  icon: '💸', cost: 300, duration: 0,   desc: 'Margin call — 10% balance liquidated',      kind: 'attack' as const },
  { id: 'reveal',        name: 'REVEAL',        icon: '🎯', cost: 100, duration: 120, desc: 'SEC filing exposes all positions',           kind: 'attack' as const },
  { id: 'trading_halt',  name: 'TRADING HALT',  icon: '🔀', cost: 250, duration: 60,  desc: 'Regulatory halt — locked to one asset',      kind: 'attack' as const },
  { id: 'glitch',        name: 'GLITCH',        icon: '🌀', cost: 50,  duration: 10,  desc: 'Flash crash — screen interference 10s',      kind: 'attack' as const },
  { id: 'forced_trade',  name: 'FORCE',         icon: '⚡', cost: 500, duration: 0,   desc: 'Auto-liquidation triggers a random trade',   kind: 'attack' as const },
] as const;

export const DEFENSES = [
  { id: 'hedge',       name: 'HEDGE',      icon: '🛡', cost: 150, duration: 0,   desc: 'Insurance — blocks next market event',  kind: 'defense' as const },
  { id: 'stop_loss',   name: 'STOP-LOSS',  icon: '🔄', cost: 200, duration: 0,   desc: 'Redirect the event to sender',          kind: 'defense' as const },
  { id: 'dark_pool',   name: 'DARK POOL',  icon: '👻', cost: 300, duration: 120, desc: 'Go off-exchange — positions hidden 2m',  kind: 'defense' as const },
  { id: 'speed_boost', name: 'BOOST',      icon: '⏩', cost: 100, duration: 60,  desc: 'Algo boost — 2x execution speed 60s',    kind: 'defense' as const },
  { id: 'resume',      name: 'RESUME',     icon: '🔥', cost: 125, duration: 0,   desc: 'Override — clear any active halt',       kind: 'defense' as const },
] as const;

export const ALL_WEAPONS = [...ATTACKS, ...DEFENSES] as const;

export type AttackId = typeof ATTACKS[number]['id'];
export type DefenseId = typeof DEFENSES[number]['id'];
export type WeaponId = AttackId | DefenseId;

export function getAttack(id: string) {
  return ATTACKS.find(a => a.id === id);
}

export function getDefense(id: string) {
  return DEFENSES.find(d => d.id === id);
}

export function getWeapon(id: string) {
  return ALL_WEAPONS.find(w => w.id === id);
}

// Legacy ID mapping for backwards compatibility with existing DB records
export const LEGACY_ID_MAP: Record<string, string> = {
  lockout: 'blackout',
  margin_squeeze: 'leverage_cap',
  expose: 'reveal',
  asset_freeze: 'trading_halt',
  shield: 'hedge',
  deflect: 'stop_loss',
  ghost_mode: 'dark_pool',
  unfreeze: 'resume',
};

export function resolveWeaponId(id: string): string {
  return LEGACY_ID_MAP[id] ?? id;
}
