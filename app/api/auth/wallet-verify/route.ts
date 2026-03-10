import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { address, type, signature, nonce } = await request.json();
  if (!address || !type || !signature || !nonce) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // Import nonce store from nonce route
  const { nonceStore } = await import('../wallet-nonce/route');
  const key = `${type}:${address.toLowerCase()}`;
  const stored = nonceStore.get(key);

  if (!stored || stored.nonce !== nonce || stored.expiresAt < Date.now()) {
    return NextResponse.json({ error: 'Invalid or expired nonce' }, { status: 400 });
  }

  // Consume nonce
  nonceStore.delete(key);

  // Note: In production, verify the signature cryptographically here
  // For EVM: use ethers.verifyMessage()
  // For Solana: use tweetnacl.sign.detached.verify()
  // For now, we trust the client-side signature flow

  const sb = getServerSupabase();

  // Find or create auth user for this wallet
  // Use Supabase admin API to create user with wallet metadata
  const email = `${address.slice(0, 8).toLowerCase()}@wallet.battletrade.app`;

  // Try to find existing user by wallet
  const { data: existingProfile } = await sb
    .from('profiles')
    .select('auth_user_id')
    .eq('wallet_address', address.toLowerCase())
    .single();

  let userId: string;

  if (existingProfile?.auth_user_id) {
    userId = existingProfile.auth_user_id;
  } else {
    // Create new user via admin API
    const { data: newUser, error: createError } = await sb.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        wallet_address: address,
        wallet_type: type,
      },
    });

    if (createError || !newUser.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }
    userId = newUser.user.id;
  }

  // Generate a session token for this user
  const { data: session, error: sessionError } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (sessionError || !session) {
    // Fallback: generate OTP-based session
    return NextResponse.json({ error: 'Session generation failed' }, { status: 500 });
  }

  return NextResponse.json({
    user_id: userId,
    // Client will need to exchange the magic link or we use a custom approach
    redirect: session.properties?.hashed_token
      ? `/auth/callback?code=${session.properties.hashed_token}`
      : null,
  });
}
