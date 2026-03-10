import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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

    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', follower_id)
      .eq('following_id', followingId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/profile/[id]/follow error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
