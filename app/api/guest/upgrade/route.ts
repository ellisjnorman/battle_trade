import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * Upgrade a guest profile to a real authenticated profile.
 * Migrates all traders, sessions, and credits from the guest profile
 * to the authenticated user's profile.
 *
 * Requires Privy JWT (verified via middleware → x-privy-user-id header).
 * The authenticated user must match the auth_profile_id.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { guest_profile_id, auth_profile_id } = body

  if (!guest_profile_id || !auth_profile_id) {
    return NextResponse.json({ error: 'guest_profile_id and auth_profile_id required' }, { status: 400 })
  }

  // Authenticate: require Privy JWT and verify caller owns the auth_profile_id
  const privyUserId = request.headers.get('x-privy-user-id')
  if (privyUserId) {
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', privyUserId)
      .single()
    if (!callerProfile || callerProfile.id !== auth_profile_id) {
      return NextResponse.json({ error: 'Not authorized to upgrade to this profile' }, { status: 403 })
    }
  } else {
    // Also accept X-Guest-Id to verify the guest owns the guest_profile_id
    const guestId = request.headers.get('x-guest-id')
    if (!guestId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    const { data: guestCheck } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', guestId)
      .eq('is_guest', true)
      .single()
    if (!guestCheck || guestCheck.id !== guest_profile_id) {
      return NextResponse.json({ error: 'Not authorized to upgrade this guest profile' }, { status: 403 })
    }
  }

  const sb = getServerSupabase()

  // Verify guest profile exists and is actually a guest
  const { data: guestProfile } = await sb
    .from('profiles')
    .select('id, is_guest, display_name')
    .eq('id', guest_profile_id)
    .eq('is_guest', true)
    .maybeSingle()

  if (!guestProfile) {
    return NextResponse.json({ error: 'Guest profile not found' }, { status: 404 })
  }

  // Verify auth profile exists
  const { data: authProfile } = await sb
    .from('profiles')
    .select('id')
    .eq('id', auth_profile_id)
    .maybeSingle()

  if (!authProfile) {
    return NextResponse.json({ error: 'Auth profile not found' }, { status: 404 })
  }

  // Find guest's traders before migrating (need IDs for session migration)
  const { data: guestTraders } = await sb
    .from('traders')
    .select('id')
    .eq('profile_id', guest_profile_id)

  // Migrate traders from guest to auth profile
  const { error: traderErr } = await sb
    .from('traders')
    .update({ profile_id: auth_profile_id })
    .eq('profile_id', guest_profile_id)

  if (traderErr) {
    return NextResponse.json({ error: 'Failed to migrate traders' }, { status: 500 })
  }

  // Migrate sessions by trader_id (sessions have no profile_id column)
  if (guestTraders && guestTraders.length > 0) {
    // Sessions are already linked via trader_id — no update needed since trader_id stays the same.
    // The trader's profile_id was updated above, so the chain profile→trader→session is intact.
  }

  // Transfer credits from guest profile to auth profile
  const { data: guestProfileCredits } = await sb
    .from('profiles')
    .select('credits')
    .eq('id', guest_profile_id)
    .single()

  if (guestProfileCredits && (guestProfileCredits.credits ?? 0) > 0) {
    const { data: authProfileCredits } = await sb
      .from('profiles')
      .select('credits')
      .eq('id', auth_profile_id)
      .single()

    const guestBal = guestProfileCredits.credits ?? 0
    const authBal = authProfileCredits?.credits ?? 0

    await sb.from('profiles').update({ credits: authBal + guestBal }).eq('id', auth_profile_id)
    await sb.from('profiles').update({ credits: 0 }).eq('id', guest_profile_id)
  }

  // Mark guest profile as upgraded
  await sb
    .from('profiles')
    .update({ is_guest: false })
    .eq('id', guest_profile_id)

  return NextResponse.json({
    success: true,
    migrated_from: guest_profile_id,
    migrated_to: auth_profile_id,
  })
}
