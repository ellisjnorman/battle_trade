import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lobbyId = searchParams.get('lobby');
  const type = searchParams.get('type') ?? 'lobby';

  let lobbyName = 'Battle Trade';
  let playerCount = 0;
  let status = 'LIVE';

  if (lobbyId) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        // Direct REST fetch — no SDK dependency, edge-compatible
        const lobbyRes = await fetch(
          `${supabaseUrl}/rest/v1/lobbies?id=eq.${lobbyId}&select=name,status&limit=1`,
          { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }, next: { revalidate: 60 } },
        );
        const lobbies = await lobbyRes.json();
        if (Array.isArray(lobbies) && lobbies[0]) {
          lobbyName = lobbies[0].name;
          status = (lobbies[0].status as string).toUpperCase();
        }

        const countRes = await fetch(
          `${supabaseUrl}/rest/v1/traders?lobby_id=eq.${lobbyId}&select=id`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              Prefer: 'count=exact',
              Range: '0-0',
            },
            next: { revalidate: 60 },
          },
        );
        const range = countRes.headers.get('content-range');
        if (range) {
          const total = range.split('/')[1];
          if (total && total !== '*') playerCount = parseInt(total, 10);
        }
      } catch {
        // Fall through with defaults
      }
    }
  }

  const subtitle =
    type === 'recap'
      ? `${playerCount} TRADERS · GAME OVER`
      : type === 'spectate'
        ? `${playerCount} TRADERS · WATCH LIVE`
        : `${playerCount} TRADERS · ${status}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A0A0A',
          position: 'relative',
        }}
      >
        {/* Grid lines */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            backgroundImage:
              'linear-gradient(rgba(245,160,208,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(245,160,208,0.04) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Accent bar top */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: 'linear-gradient(90deg, #F5A0D0, #00FF88, #F5A0D0)',
            display: 'flex',
          }}
        />

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              fontSize: 32,
              color: '#F5A0D0',
              fontFamily: 'sans-serif',
              fontWeight: 700,
              letterSpacing: '0.15em',
              display: 'flex',
            }}
          >
            BATTLE TRADE
          </div>

          <div
            style={{
              fontSize: 80,
              color: '#FFFFFF',
              fontFamily: 'sans-serif',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textAlign: 'center',
              maxWidth: 1000,
              lineHeight: 1.1,
              display: 'flex',
            }}
          >
            {lobbyName.toUpperCase()}
          </div>

          <div
            style={{
              fontSize: 28,
              color: '#888',
              fontFamily: 'monospace',
              letterSpacing: '0.1em',
              display: 'flex',
            }}
          >
            {subtitle}
          </div>

          <div
            style={{
              marginTop: 24,
              padding: '12px 40px',
              background: '#F5A0D0',
              color: '#0A0A0A',
              fontSize: 24,
              fontFamily: 'sans-serif',
              fontWeight: 700,
              letterSpacing: '0.1em',
              display: 'flex',
            }}
          >
            {type === 'spectate' ? 'WATCH NOW' : type === 'recap' ? 'VIEW RESULTS' : 'JOIN THE BATTLE'}
          </div>
        </div>

        {/* Accent bar bottom */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 4,
            background: 'linear-gradient(90deg, #00FF88, #F5A0D0, #00FF88)',
            display: 'flex',
          }}
        />
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
