import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { recalcAndSave } from '@/lib/reputation';
import { authenticateProfile } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: followingId } = await params;

  try {
    const body = await request.json();
    const { follower_id } = body;

    if (!follower_id) {
      return NextResponse.json({ error: 'follower_id is required' }, { status: 400 });
    }

    // Authenticate: verify caller owns this profile
    const auth = await authenticateProfile(request);
    if (!auth.ok) return auth.response;
    if (auth.profileId !== follower_id) {
      return NextResponse.json({ error: 'Cannot follow as another user' }, { status: 403 });
    }

    if (follower_id === followingId) {
      return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
    }

    const { error } = await supabase
      .from('follows')
      .upsert(
        { follower_id, following_id: followingId },
        { onConflict: 'follower_id,following_id', ignoreDuplicates: true },
      );

    if (error) {
      console.error('[follow/POST]', error.message);
      return NextResponse.json({ error: 'Failed to follow' }, { status: 500 });
    }

    // Recalc TR for the followed user (community score changes) — fire-and-forget
    recalcAndSave(followingId).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/profile/[id]/follow error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: followingId } = await params;

  try {
    const body = await request.json();
    const { follower_id } = body;

    if (!follower_id) {
      return NextResponse.json({ error: 'follower_id is required' }, { status: 400 });
    }

    // Authenticate: verify caller owns this profile
    const auth = await authenticateProfile(request);
    if (!auth.ok) return auth.response;
    if (auth.profileId !== follower_id) {
      return NextResponse.json({ error: 'Cannot unfollow as another user' }, { status: 403 });
    }

    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', follower_id)
      .eq('following_id', followingId);

    if (error) {
      console.error('[follow/DELETE]', error.message);
      return NextResponse.json({ error: 'Failed to unfollow' }, { status: 500 });
    }

    // Recalc TR for the unfollowed user (community score changes) — fire-and-forget
    recalcAndSave(followingId).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/profile/[id]/follow error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
