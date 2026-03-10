import { supabase } from './supabase';

export async function logAdminAction(lobbyId: string, action: string, details: Record<string, unknown> = {}) {
  try {
    await supabase.from('audit_logs').insert({
      lobby_id: lobbyId,
      action,
      actor: 'admin',
      details,
    });
  } catch {
    // Best-effort — don't block admin operations
  }
}
