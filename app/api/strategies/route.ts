import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { authenticateProfile } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const sort = searchParams.get('sort') ?? 'recent';
    const tag = searchParams.get('tag');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    // Build query with author join
    let query = supabase
      .from('strategies')
      .select(
        '*, profiles!strategies_author_id_fkey(display_name, rank_tier, tr_score)',
        { count: 'exact' },
      );

    // Filter by tag if provided
    if (tag) {
      query = query.contains('tags', [tag]);
    }

    // Sort
    if (sort === 'upvotes') {
      query = query.order('upvotes', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[strategies/GET]', error.message);
      return NextResponse.json({ error: 'Failed to load strategies' }, { status: 500 });
    }

    // Flatten the joined author info
    const strategies = (data ?? []).map((s) => {
      const author = s.profiles as unknown as {
        display_name: string;
        rank_tier: string;
        tr_score: number;
      } | null;
      return {
        ...s,
        profiles: undefined,
        author_name: author?.display_name ?? null,
        author_rank_tier: author?.rank_tier ?? null,
        author_tr_score: author?.tr_score ?? null,
      };
    });

    return NextResponse.json({ strategies, total: count ?? 0 }, {
      headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=15' },
    });
  } catch (err) {
    console.error('GET /api/strategies error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { author_id, title, body: stratBody, tags } = body;

    // Validate required fields
    if (!author_id) {
      return NextResponse.json({ error: 'author_id is required' }, { status: 400 });
    }

    // Authenticate: verify caller owns this profile
    const auth = await authenticateProfile(request);
    if (!auth.ok) return auth.response;
    if (auth.profileId !== author_id) {
      return NextResponse.json({ error: 'Cannot create strategies for another user' }, { status: 403 });
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    if (title.length > 100) {
      return NextResponse.json({ error: 'title must be 100 characters or fewer' }, { status: 400 });
    }

    if (!stratBody || typeof stratBody !== 'string' || stratBody.trim().length === 0) {
      return NextResponse.json({ error: 'body is required' }, { status: 400 });
    }

    if (stratBody.length > 2000) {
      return NextResponse.json({ error: 'body must be 2000 characters or fewer' }, { status: 400 });
    }

    if (tags && Array.isArray(tags) && tags.length > 5) {
      return NextResponse.json({ error: 'Maximum 5 tags allowed' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('strategies')
      .insert({
        author_id,
        title: title.trim(),
        body: stratBody.trim(),
        tags: tags ?? [],
        upvotes: 0,
        usage_count: 0,
        win_rate: 0,
      })
      .select()
      .single();

    if (error) {
      console.error('[strategies/POST]', error.message);
      return NextResponse.json({ error: 'Failed to create strategy' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('POST /api/strategies error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
