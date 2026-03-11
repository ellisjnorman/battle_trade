import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * Upgrade a guest profile to a real authenticated profile.
 * Migrates all traders, sessions, and credits from the guest profile
 * to the authenticated user's profile.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { guest_profile_id, auth_profile_id } = body

  if (!guest_profile_id || !auth_profile_id) {
    return NextResponse.json({ error: 'guest_profile_id and auth_profile_id required' }, { status: 400 })
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

  // Migrate traders from guest to auth profile
  const { error: traderErr } = await sb
    .from('traders')
    .update({ profile_id: auth_profile_id })
    .eq('profile_id', guest_profile_id)

  if (traderErr) {
    return NextResponse.json({ error: 'Failed to migrate traders' }, { status: 500 })
  }

  // Migrate sessions
  await sb
    .from('sessions')
    .update({ profile_id: auth_profile_id })
    .eq('profile_id', guest_profile_id)

  // Transfer credits
  const { data: guestCredits } = await sb
    .from('credits')
    .select('balance')
    .eq('profile_id', guest_profile_id)
    .maybeSingle()

  if (guestCredits && guestCredits.balance > 0) {
    // Add to auth profile's credits
    const { data: authCredits } = await sb
      .from('credits')
      .select('balance')
      .eq('profile_id', auth_profile_id)
      .maybeSingle()

    if (authCredits) {
      await sb.from('credits').update({ balance: authCredits.balance + guestCredits.balance }).eq('profile_id', auth_profile_id)
    } else {
      await sb.from('credits').insert({ profile_id: auth_profile_id, balance: guestCredits.balance })
    }
    // Zero out guest credits
    await sb.from('credits').update({ balance: 0 }).eq('profile_id', guest_profile_id)
  }

  // Mark guest profile as upgraded
  await sb
    .from('profiles')
    .update({ is_guest: false, upgraded_to: auth_profile_id })
    .eq('id', guest_profile_id)

  return NextResponse.json({
    success: true,
    migrated_from: guest_profile_id,
    migrated_to: auth_profile_id,
  })
}
