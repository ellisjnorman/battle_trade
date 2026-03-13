import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServerSupabase } from '@/lib/supabase-server';
import { getAdapter } from '@/lib/exchanges/adapter';
import type { ExchangeCredentials } from '@/lib/exchanges/types';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// AES-256-GCM encryption helpers
// ---------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
  const hex = process.env.EXCHANGE_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'EXCHANGE_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)',
    );
  }
  return Buffer.from(hex, 'hex');
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // 16 bytes

  // Format: base64(iv + authTag + ciphertext)
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

function decrypt(encoded: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encoded, 'base64');

  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(12, 28);
  const ciphertext = combined.subarray(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

// ---------------------------------------------------------------------------
// POST /api/exchanges/connect
// ---------------------------------------------------------------------------

interface ConnectBody {
  profile_id: string;
  exchange: string;
  api_key: string;
  api_secret: string;
  passphrase?: string;
}

export async function POST(request: NextRequest) {
  let body: ConnectBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { profile_id, exchange, api_key, api_secret, passphrase } = body;

  if (!profile_id || !exchange || !api_key || !api_secret) {
    return NextResponse.json(
      { error: 'Missing required fields: profile_id, exchange, api_key, api_secret' },
      { status: 400 },
    );
  }

  // Authenticate: verify caller owns this profile
  const privyUserId = request.headers.get('x-privy-user-id');
  if (!privyUserId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const { data: callerProfile } = await getServerSupabase()
    .from('profiles')
    .select('id')
    .eq('auth_user_id', privyUserId)
    .single();
  if (!callerProfile || callerProfile.id !== profile_id) {
    return NextResponse.json({ error: 'Not authorized for this profile' }, { status: 403 });
  }

  // Get the adapter (throws if exchange not supported)
  let adapter;
  try {
    adapter = getAdapter(exchange);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }

  const creds: ExchangeCredentials = {
    exchange: exchange as ExchangeCredentials['exchange'],
    api_key,
    api_secret,
    passphrase,
  };

  // Validate credentials against the exchange
  const valid = await adapter.validateCredentials(creds);
  if (!valid) {
    return NextResponse.json(
      { error: 'Invalid exchange credentials' },
      { status: 400 },
    );
  }

  // Fetch balance for the response
  let balance_usd = 0;
  try {
    const bal = await adapter.getAccountBalance(creds);
    balance_usd = bal.total_usd;
  } catch {
    // Non-fatal: credentials are valid but balance fetch failed
  }

  // Encrypt credentials for storage
  const credentialsPayload = JSON.stringify({
    api_key,
    api_secret,
    ...(passphrase ? { passphrase } : {}),
  });
  const encryptedCredentials = encrypt(credentialsPayload);

  // Upsert into exchange_connections
  const supabase = getServerSupabase();
  const { error: dbError } = await supabase
    .from('exchange_connections')
    .upsert(
      {
        profile_id,
        exchange,
        encrypted_credentials: encryptedCredentials,
        is_active: true,
        connected_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id,exchange' },
    );

  if (dbError) {
    return NextResponse.json(
      { error: 'Failed to store connection', detail: dbError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    connected: true,
    exchange,
    balance_usd,
  });
}

// Export decrypt for use by other modules that need to read stored credentials
export { decrypt as decryptCredentials };
