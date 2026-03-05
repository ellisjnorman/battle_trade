// ---------------------------------------------------------------------------
// Single source of truth for all attack and defense definitions.
// Import from here — never hardcode weapon arrays elsewhere.
// ---------------------------------------------------------------------------

export const ATTACKS = [
  { id: 'lockout',        name: 'LOCKOUT',   icon: '🔒', cost: 200, duration: 90,  desc: 'Block trades 90s',        kind: 'attack' as const },
  { id: 'fake_news',      name: 'FAKE NEWS', icon: '📰', cost: 150, duration: 8,   desc: 'Inject a fake headline',  kind: 'attack' as const },
  { id: 'margin_squeeze', name: 'SQUEEZE',   icon: '💸', cost: 300, duration: 0,   desc: 'Remove 10% balance',      kind: 'attack' as const },
  { id: 'expose',         name: 'EXPOSE',    icon: '🎯', cost: 100, duration: 120, desc: 'Show positions publicly', kind: 'attack' as const },
  { id: 'asset_freeze',   name: 'FREEZE',    icon: '🔀', cost: 250, duration: 60,  desc: 'Lock to one asset',       kind: 'attack' as const },
  { id: 'glitch',         name: 'GLITCH',    icon: '🌀', cost: 50,  duration: 10,  desc: 'Visual chaos 10s',        kind: 'attack' as const },
  { id: 'forced_trade',   name: 'FORCE',     icon: '⚡', cost: 500, duration: 0,   desc: 'Force a random trade',    kind: 'attack' as const },
] as const;

export const DEFENSES = [
  { id: 'shield',      name: 'SHIELD',  icon: '🛡', cost: 150, duration: 0,   desc: 'Block next attack',     kind: 'defense' as const },
  { id: 'deflect',     name: 'DEFLECT', icon: '🔄', cost: 200, duration: 0,   desc: 'Send it back',          kind: 'defense' as const },
  { id: 'ghost_mode',  name: 'GHOST',   icon: '👻', cost: 300, duration: 120, desc: 'Hide positions 2m',     kind: 'defense' as const },
  { id: 'speed_boost', name: 'BOOST',   icon: '⏩', cost: 100, duration: 60,  desc: '2x activity speed 60s', kind: 'defense' as const },
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
