import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamConfig {
  provider: 'mux' | 'cloudflare' | 'custom';
  api_key?: string;
  api_secret?: string;  // for Mux
  account_id?: string;  // for Cloudflare
}

export interface LiveStream {
  id: string;
  lobby_id: string;
  stream_key: string;
  rtmp_url: string;
  playback_url: string;  // HLS URL
  playback_id: string | null;
  external_id: string | null;
  status: 'idle' | 'active' | 'disconnected';
  created_at: string;
}

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

function getProvider(): StreamConfig['provider'] {
  const explicit = process.env.STREAMING_PROVIDER;
  if (explicit === 'cloudflare' || explicit === 'mux' || explicit === 'custom') return explicit;
  if (process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET) return 'mux';
  if (process.env.CF_STREAM_API_TOKEN && process.env.CF_ACCOUNT_ID) return 'cloudflare';
  return 'mux'; // default, will fall through to mock if no creds
}

// ---------------------------------------------------------------------------
// Mux
// ---------------------------------------------------------------------------

async function createMuxStream(): Promise<{
  stream_key: string;
  rtmp_url: string;
  playback_url: string;
  playback_id: string;
  external_id: string;
}> {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;

  if (!tokenId || !tokenSecret) {
    return createMockStream();
  }

  const credentials = Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64');

  const res = await fetch('https://api.mux.com/video/v1/live-streams', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({
      playback_policy: ['public'],
      new_asset_settings: { playback_policy: ['public'] },
      reduced_latency: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Mux API error (${res.status}): ${err}`);
  }

  const json = await res.json();
  const data = json.data;

  const playbackId = data.playback_ids?.[0]?.id ?? '';

  return {
    stream_key: data.stream_key,
    rtmp_url: 'rtmp://global-live.mux.com:5222/app',
    playback_url: `https://stream.mux.com/${playbackId}.m3u8`,
    playback_id: playbackId,
    external_id: data.id,
  };
}

async function endMuxStream(externalId: string): Promise<void> {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!tokenId || !tokenSecret || !externalId) return;

  const credentials = Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64');

  await fetch(`https://api.mux.com/video/v1/live-streams/${externalId}`, {
    method: 'DELETE',
    headers: { Authorization: `Basic ${credentials}` },
  });
}

// ---------------------------------------------------------------------------
// Cloudflare Stream
// ---------------------------------------------------------------------------

async function createCloudflareStream(): Promise<{
  stream_key: string;
  rtmp_url: string;
  playback_url: string;
  playback_id: string;
  external_id: string;
}> {
  const apiToken = process.env.CF_STREAM_API_TOKEN;
  const accountId = process.env.CF_ACCOUNT_ID;

  if (!apiToken || !accountId) {
    return createMockStream();
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        meta: { name: 'Battle Trade Live Stream' },
        recording: { mode: 'off' },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudflare Stream API error (${res.status}): ${err}`);
  }

  const json = await res.json();
  const result = json.result;

  return {
    stream_key: result.rtmps?.streamKey ?? result.uid,
    rtmp_url: result.rtmps?.url ?? `rtmps://live.cloudflare.com:443/live`,
    playback_url: `https://customer-${accountId}.cloudflarestream.com/${result.uid}/manifest/video.m3u8`,
    playback_id: result.uid,
    external_id: result.uid,
  };
}

async function endCloudflareStream(externalId: string): Promise<void> {
  const apiToken = process.env.CF_STREAM_API_TOKEN;
  const accountId = process.env.CF_ACCOUNT_ID;
  if (!apiToken || !accountId || !externalId) return;

  await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${externalId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiToken}` },
    },
  );
}

// ---------------------------------------------------------------------------
// Mock (no credentials configured)
// ---------------------------------------------------------------------------

function createMockStream(): {
  stream_key: string;
  rtmp_url: string;
  playback_url: string;
  playback_id: string;
  external_id: string;
} {
  const mockId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return {
    stream_key: `mock_sk_${mockId}`,
    rtmp_url: 'rtmp://localhost:1935/live',
    playback_url: `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`,
    playback_id: `mock_${mockId}`,
    external_id: `mock_${mockId}`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function createStream(lobbyId: string): Promise<LiveStream> {
  // Check if stream already exists
  const existing = await getStream(lobbyId);
  if (existing) return existing;

  const provider = getProvider();

  let streamData: {
    stream_key: string;
    rtmp_url: string;
    playback_url: string;
    playback_id: string;
    external_id: string;
  };

  switch (provider) {
    case 'cloudflare':
      streamData = await createCloudflareStream();
      break;
    case 'mux':
    default:
      streamData = await createMuxStream();
      break;
  }

  const { data, error } = await supabase
    .from('lobby_streams')
    .insert({
      lobby_id: lobbyId,
      provider,
      stream_key: streamData.stream_key,
      rtmp_url: streamData.rtmp_url,
      playback_url: streamData.playback_url,
      playback_id: streamData.playback_id,
      external_id: streamData.external_id,
      status: 'idle',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save stream: ${error.message}`);

  return data as LiveStream;
}

export async function getStream(lobbyId: string): Promise<LiveStream | null> {
  const { data, error } = await supabase
    .from('lobby_streams')
    .select('*')
    .eq('lobby_id', lobbyId)
    .single();

  if (error || !data) return null;
  return data as LiveStream;
}

export async function endStream(lobbyId: string): Promise<void> {
  const stream = await getStream(lobbyId);
  if (!stream) return;

  // Clean up on the provider side
  const provider = getProvider();
  if (stream.external_id && !stream.external_id.startsWith('mock_')) {
    switch (provider) {
      case 'cloudflare':
        await endCloudflareStream(stream.external_id);
        break;
      case 'mux':
        await endMuxStream(stream.external_id);
        break;
    }
  }

  await supabase.from('lobby_streams').delete().eq('lobby_id', lobbyId);
}

export async function updateStreamStatus(
  lobbyId: string,
  status: LiveStream['status'],
): Promise<void> {
  await supabase
    .from('lobby_streams')
    .update({ status })
    .eq('lobby_id', lobbyId);
}
