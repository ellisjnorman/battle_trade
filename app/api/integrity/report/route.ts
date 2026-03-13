import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { authenticateProfile } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

const VALID_REASONS = [
  'wash_trading',
  'multi_account',
  'collusion',
  'exploitation',
  'other',
] as const;

export async function POST(request: NextRequest) {
  const supabase = getServerSupabase();

  let body: {
    reporter_id?: string;
    suspect_id?: string;
    reason?: string;
    evidence?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { reporter_id, suspect_id, reason, evidence } = body;

  if (!reporter_id || typeof reporter_id !== 'string') {
    return NextResponse.json({ error: 'Missing reporter_id' }, { status: 400 });
  }
  if (!suspect_id || typeof suspect_id !== 'string') {
    return NextResponse.json({ error: 'Missing suspect_id' }, { status: 400 });
  }
  if (!reason || typeof reason !== 'string') {
    return NextResponse.json({ error: 'Missing reason' }, { status: 400 });
  }

  if (!VALID_REASONS.includes(reason as (typeof VALID_REASONS)[number])) {
    return NextResponse.json(
      { error: `Invalid reason. Valid: ${VALID_REASONS.join(', ')}` },
      { status: 400 },
    );
  }

  // Authenticate: verify caller owns reporter_id
  const auth = await authenticateProfile(request);
  if (!auth.ok) return auth.response;
  if (auth.profileId !== reporter_id) {
    return NextResponse.json({ error: 'Cannot report as another user' }, { status: 403 });
  }

  if (reporter_id === suspect_id) {
    return NextResponse.json(
      { error: 'Cannot report yourself' },
      { status: 400 },
    );
  }

  // Verify both profiles exist
  const { data: reporter } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', reporter_id)
    .single();

  if (!reporter) {
    return NextResponse.json({ error: 'Reporter profile not found' }, { status: 404 });
  }

  const { data: suspect } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', suspect_id)
    .single();

  if (!suspect) {
    return NextResponse.json({ error: 'Suspect profile not found' }, { status: 404 });
  }

  // Rate limit: max 5 reports per reporter per 24 hours
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();

  const { count } = await supabase
    .from('integrity_reports')
    .select('id', { count: 'exact', head: true })
    .eq('reporter_id', reporter_id)
    .gte('created_at', twentyFourHoursAgo);

  if (count !== null && count >= 5) {
    return NextResponse.json(
      { error: 'Rate limit: max 5 reports per 24 hours' },
      { status: 429 },
    );
  }

  // Check for duplicate report (same reporter + suspect + reason within 24h)
  const { data: existing } = await supabase
    .from('integrity_reports')
    .select('id')
    .eq('reporter_id', reporter_id)
    .eq('suspect_id', suspect_id)
    .eq('reason', reason)
    .gte('created_at', twentyFourHoursAgo)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: 'You already reported this player for the same reason recently' },
      { status: 409 },
    );
  }

  // Insert the report
  const { error: insertError } = await supabase
    .from('integrity_reports')
    .insert({
      reporter_id,
      suspect_id,
      reason,
      evidence: evidence ?? null,
      status: 'pending',
    });

  if (insertError) {
    console.error('[integrity/report]', insertError.message);
    return NextResponse.json(
      { error: 'Failed to create report' },
      { status: 500 },
    );
  }

  return NextResponse.json({ reported: true });
}
