import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { checkAuthWithLobby, unauthorized } from '../admin/auth';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/lobby/[id]/manage — Update lobby details (name, config, format, is_public)
 * Only the creator or admin can update.
 * Cannot update if lobby status is 'completed' or 'cancelled'.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const authed = await checkAuthWithLobby(request, lobbyId);
  if (!authed) return unauthorized();

  const sb = getServerSupabase();

  // Check lobby exists and is editable
  const { data: lobby } = await sb
    .from('lobbies')
    .select('id, status')
    .eq('id', lobbyId)
    .single();

  if (!lobby) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
  }

  if (lobby.status === 'completed' || lobby.status === 'cancelled') {
    return NextResponse.json({ error: 'Cannot edit a finished lobby' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));

  // Only allow updating specific fields
  const updates: Record<string, unknown> = {};
  if (body.name && typeof body.name === 'string') {
    const name = body.name.trim().slice(0, 64);
    if (name.length > 0) updates.name = name;
  }
  if (body.format && ['elimination', 'rounds', 'marathon', 'blitz'].includes(body.format)) {
    updates.format = body.format;
  }
  if (typeof body.is_public === 'boolean') {
    updates.is_public = body.is_public;
  }
  if (body.config && typeof body.config === 'object') {
    // Merge with existing config
    const { data: current } = await sb
      .from('lobbies')
      .select('config')
      .eq('id', lobbyId)
      .single();
    const { admin_password: _strip, ...safeConfig } = body.config;
    updates.config = { ...(current?.config ?? {}), ...safeConfig };
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await sb
    .from('lobbies')
    .update(updates)
    .eq('id', lobbyId)
    .select('id, name, format, status, config, is_public, invite_code')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lobby: data });
}

/**
 * POST /api/lobby/[id]/manage — Cancel an active/waiting lobby
 * Only the creator or admin can cancel.
 * Sets status to 'cancelled', closes all open positions, ends active rounds.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const authed = await checkAuthWithLobby(request, lobbyId);
  if (!authed) return unauthorized();

  const body = await request.json().catch(() => ({}));
  if (body.action !== 'cancel') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const sb = getServerSupabase();

  const { data: lobby } = await sb
    .from('lobbies')
    .select('id, status')
    .eq('id', lobbyId)
    .single();

  if (!lobby) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
  }

  if (lobby.status === 'completed' || lobby.status === 'cancelled') {
    return NextResponse.json({ error: 'Lobby is already finished' }, { status: 400 });
  }

  // End any active rounds
  await sb
    .from('rounds')
    .update({ status: 'completed' })
    .eq('lobby_id', lobbyId)
    .in('status', ['active', 'pending', 'frozen']);

  // Close all open positions via rounds belonging to this lobby
  const { data: lobbyRounds } = await sb
    .from('rounds')
    .select('id')
    .eq('lobby_id', lobbyId);
  if (lobbyRounds && lobbyRounds.length > 0) {
    await sb
      .from('positions')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .in('round_id', lobbyRounds.map(r => r.id))
      .is('closed_at', null);
  }

  // Set lobby status to cancelled
  const { data, error } = await sb
    .from('lobbies')
    .update({ status: 'cancelled' })
    .eq('id', lobbyId)
    .select('id, name, status')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lobby: data, cancelled: true });
}

/**
 * DELETE /api/lobby/[id]/manage — Delete a lobby
 * Only the creator or admin can delete.
 * Can only delete lobbies in 'waiting' or 'cancelled' status.
 * Deletes associated sessions too.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const authed = await checkAuthWithLobby(request, lobbyId);
  if (!authed) return unauthorized();

  const sb = getServerSupabase();

  // Check lobby exists and is deletable
  const { data: lobby } = await sb
    .from('lobbies')
    .select('id, status')
    .eq('id', lobbyId)
    .single();

  if (!lobby) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
  }

  if (lobby.status !== 'waiting' && lobby.status !== 'cancelled') {
    return NextResponse.json(
      { error: 'Cancel the lobby first before deleting, or delete lobbies that haven\'t started.' },
      { status: 400 },
    );
  }

  // Delete sessions first (foreign key)
  await sb.from('sessions').delete().eq('lobby_id', lobbyId);

  // Delete the lobby
  const { error } = await sb.from('lobbies').delete().eq('id', lobbyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
