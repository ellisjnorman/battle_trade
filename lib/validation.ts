import { z } from 'zod';

export const CreateLobbySchema = z.object({
  name: z.string().min(1).max(64).trim(),
  format: z.enum(['elimination', 'rounds', 'marathon', 'blitz']).default('elimination'),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const RegisterTraderSchema = z.object({
  display_name: z.string().min(1).max(32).trim(),
  handle: z.string().regex(/^[a-zA-Z0-9_]*$/).max(24).optional().nullable(),
  team_name: z.string().max(32).trim().optional().nullable(),
  wallet_address: z.string().max(64).trim().optional().nullable(),
  wants_whitelist: z.boolean().optional(),
});

export const OpenPositionSchema = z.object({
  trader_id: z.string().uuid(),
  round_id: z.string().uuid(),
  symbol: z.string().min(1).max(20),
  direction: z.enum(['long', 'short']),
  size: z.number().positive().max(1_000_000),
  leverage: z.number().int().min(1).max(100),
  is_forced: z.boolean().optional(),
  order_type: z.enum(['market', 'limit', 'stop_limit', 'trailing_stop']).default('market'),
  limit_price: z.number().positive().optional(),
  stop_price: z.number().positive().optional(),
  trail_pct: z.number().positive().max(50).optional(),
});

export const ClosePositionSchema = z.object({
  position_id: z.string().uuid(),
  exit_price: z.number().positive(),
});

export const PlaceBetSchema = z.object({
  bettor_id: z.string().uuid(),
  outcome_id: z.string().uuid(),
  amount: z.number().int().positive().max(100_000),
});

export const FireEventSchema = z.object({
  type: z.string().min(1),
  asset: z.string().optional().nullable(),
  magnitude: z.number().min(0).max(1).optional(),
  duration_seconds: z.number().int().positive().max(3600).optional(),
  trigger_mode: z.enum(['manual', 'algo']).default('manual'),
  preset_id: z.string().optional(),
});

export const SabotageSchema = z.object({
  attacker_id: z.string().uuid(),
  target_id: z.string().uuid(),
  weapon_type: z.string().min(1),
});

export const AdminRoundSchema = z.object({
  round_id: z.string().uuid(),
});

// Helper to parse and return typed result or error response
export function parseBody<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return { success: false, error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ') };
  }
  return { success: true, data: result.data };
}
