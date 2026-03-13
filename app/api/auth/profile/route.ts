import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/profile — Get or create profile for a Privy user.
 * Requires Privy JWT (verified by middleware → x-privy-user-id header).
 * Uses service_role key so RLS is bypassed.
 */
export async function POST(request: NextRequest) {
  try {
    // Get verified Privy user ID from middleware (JWT already verified)
    const privyUserId = request.headers.get('x-privy-user-id');
    if (!privyUserId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { display_name, email, wallet_address, wallet_type } = body;

    const sb = getServerSupabase();

    // Try lookup first
    const { data: existing, error: lookupErr } = await sb
      .from('profiles')
      .select('*')
      .eq('auth_user_id', privyUserId)
      .single();

    if (existing) {
      return NextResponse.json({ profile: existing });
    }

    if (lookupErr && lookupErr.code !== 'PGRST116') {
      console.error('[auth/profile] lookup error:', lookupErr.message, lookupErr.code);
    }

    // Create new profile with 1000 starter credits
    const { data: newProfile, error: insertErr } = await sb
      .from('profiles')
      .upsert({
        auth_user_id: privyUserId,
        display_name: display_name || `Trader_${Math.random().toString(36).slice(2, 6)}`,
        email: email || null,
        wallet_address: wallet_address || null,
        wallet_type: wallet_type || null,
        credits: 1000,
      }, { onConflict: 'auth_user_id' })
      .select('*')
      .single();

    if (insertErr) {
      console.error('[auth/profile] upsert error:', insertErr.message, insertErr.code, insertErr.details);
      // Try fallback lookup (race condition — another request created it)
      const { data: retry } = await sb
        .from('profiles')
        .select('*')
        .eq('auth_user_id', privyUserId)
        .single();
      if (retry) return NextResponse.json({ profile: retry });
      return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
    }

    return NextResponse.json({ profile: newProfile, created: true });
  } catch (err) {
    console.error('[auth/profile] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
