import { NextRequest, NextResponse } from 'next/server';
import { recalcAndSave } from '@/lib/reputation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { profile_id } = body;

    if (!profile_id) {
      return NextResponse.json({ error: 'profile_id is required' }, { status: 400 });
    }

    const tr_score = await recalcAndSave(profile_id);

    return NextResponse.json({ success: true, tr_score });
  } catch (err) {
    console.error('POST /api/reputation/recalc error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
