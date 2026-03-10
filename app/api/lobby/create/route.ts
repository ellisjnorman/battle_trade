import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { parseBody, CreateLobbySchema } from '@/lib/validation';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  // Rate limit: 5 lobby creations per minute per IP
  const ip = getClientIp(req);
  const rl = rateLimit(`create:${ip}`, 5);
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  try {
    const body = await req.json();
    const parsed = parseBody(CreateLobbySchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { name: safeName, format: safeFormat, config } = parsed.data;
    const { is_public, admin_password } = body;

    // Generate a 6-char invite code
    const invite_code = crypto.randomBytes(4).toString('base64url').slice(0, 6).toUpperCase();

    const sb = getServerSupabase();

    const { data: lobby, error } = await sb
      .from('lobbies')
      .insert({
        name: safeName,
        format: safeFormat,
        is_public: is_public ?? true,
        invite_code,
        config: {
          ...config,
          admin_password: admin_password || undefined,
        },
        status: 'waiting',
      })
      .select('id, invite_code')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: lobby.id, invite_code: lobby.invite_code });
  } catch (err) {
    logger.error('Lobby creation failed', { route: '/api/lobby/create' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
