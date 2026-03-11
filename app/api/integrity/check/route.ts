import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import {
  detectMultiAccount,
  detectWashTrading,
  validateHistoryImport,
  type IntegrityViolation,
  type AccountFingerprint,
  type TradePattern,
  type HistoryTrade,
} from '@/lib/integrity';

export const dynamic = 'force-dynamic';

const VALID_CHECK_TYPES = [
  'multi_account',
  'wash_trading',
  'selective_history',
] as const;
type CheckType = (typeof VALID_CHECK_TYPES)[number];

export async function POST(request: NextRequest) {
  const supabase = getServerSupabase();

  let body: { profile_id?: string; check_types?: string[]; opponent_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { profile_id, check_types, opponent_id } = body;

  if (!profile_id || typeof profile_id !== 'string') {
    return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 });
  }

  if (
    !check_types ||
    !Array.isArray(check_types) ||
    check_types.length === 0
  ) {
    return NextResponse.json(
      { error: 'check_types must be a non-empty array' },
      { status: 400 },
    );
  }

  const invalid = check_types.filter(
    (t) => !VALID_CHECK_TYPES.includes(t as CheckType),
  );
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Invalid check types: ${invalid.join(', ')}. Valid: ${VALID_CHECK_TYPES.join(', ')}` },
      { status: 400 },
    );
  }

  const allViolations: IntegrityViolation[] = [];

  // -----------------------------------------------------------------------
  // Multi-account check
  // -----------------------------------------------------------------------
  if (check_types.includes('multi_account')) {
    // Fetch fingerprints for the target profile
    const { data: targetFP } = await supabase
      .from('account_fingerprints')
      .select('profile_id, ip_address, device_id')
      .eq('profile_id', profile_id);

    if (targetFP && targetFP.length > 0) {
      // Collect all unique IPs and device IDs for this profile
      const targetIPs = [
        ...new Set(
          targetFP.map((r: { ip_address: string | null }) => r.ip_address).filter(Boolean) as string[],
        ),
      ];
      const targetDevices = [
        ...new Set(
          targetFP.map((r: { device_id: string | null }) => r.device_id).filter(Boolean) as string[],
        ),
      ];

      // Find other profiles sharing any of these IPs or device IDs
      const otherProfileIds = new Set<string>();

      if (targetIPs.length > 0) {
        const { data: ipMatches } = await supabase
          .from('account_fingerprints')
          .select('profile_id, ip_address, device_id')
          .in('ip_address', targetIPs)
          .neq('profile_id', profile_id);

        if (ipMatches) {
          for (const m of ipMatches) {
            otherProfileIds.add(m.profile_id);
          }
        }
      }

      if (targetDevices.length > 0) {
        const { data: deviceMatches } = await supabase
          .from('account_fingerprints')
          .select('profile_id, ip_address, device_id')
          .in('device_id', targetDevices)
          .neq('profile_id', profile_id);

        if (deviceMatches) {
          for (const m of deviceMatches) {
            otherProfileIds.add(m.profile_id);
          }
        }
      }

      if (otherProfileIds.size > 0) {
        // Build fingerprint objects for each other profile
        const otherIds = Array.from(otherProfileIds);
        const { data: otherFP } = await supabase
          .from('account_fingerprints')
          .select('profile_id, ip_address, device_id')
          .in('profile_id', otherIds);

        // Get wallet addresses from profiles table
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', [profile_id, ...otherIds]);

        const { data: walletData } = await supabase
          .from('traders')
          .select('id, wallet_address')
          .in('id', [profile_id, ...otherIds]);

        const profileEmails = new Map<string, string | null>();
        if (profiles) {
          for (const p of profiles) {
            profileEmails.set(p.id, p.email ?? null);
          }
        }

        const walletMap = new Map<string, string[]>();
        if (walletData) {
          for (const w of walletData) {
            if (!w.wallet_address) continue;
            const existing = walletMap.get(w.id) ?? [];
            existing.push(w.wallet_address);
            walletMap.set(w.id, existing);
          }
        }

        // Build AccountFingerprint for target
        const targetEmail = profileEmails.get(profile_id);
        const targetFingerprint: AccountFingerprint = {
          profile_id,
          ip_addresses: targetIPs,
          device_ids: targetDevices,
          wallet_addresses: walletMap.get(profile_id) ?? [],
          email_domain: targetEmail ? targetEmail.split('@')[1] ?? null : null,
        };

        // Build fingerprints for other profiles
        const fpByProfile = new Map<
          string,
          { ips: Set<string>; devices: Set<string> }
        >();
        if (otherFP) {
          for (const row of otherFP) {
            let entry = fpByProfile.get(row.profile_id);
            if (!entry) {
              entry = { ips: new Set(), devices: new Set() };
              fpByProfile.set(row.profile_id, entry);
            }
            if (row.ip_address) entry.ips.add(row.ip_address);
            if (row.device_id) entry.devices.add(row.device_id);
          }
        }

        const fingerprints: AccountFingerprint[] = [targetFingerprint];
        for (const [pid, data] of fpByProfile) {
          const email = profileEmails.get(pid);
          fingerprints.push({
            profile_id: pid,
            ip_addresses: Array.from(data.ips),
            device_ids: Array.from(data.devices),
            wallet_addresses: walletMap.get(pid) ?? [],
            email_domain: email ? email.split('@')[1] ?? null : null,
          });
        }

        const result = detectMultiAccount(fingerprints);
        allViolations.push(...result.violations);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Wash trading check
  // -----------------------------------------------------------------------
  if (check_types.includes('wash_trading')) {
    // Need an opponent to compare against. If not specified, check all recent dueling partners.
    const opponentIds: string[] = [];

    if (opponent_id) {
      opponentIds.push(opponent_id);
    } else {
      // Find recent duel opponents from positions in shared rounds
      const { data: recentPositions } = await supabase
        .from('positions')
        .select('round_id')
        .eq('trader_id', profile_id)
        .order('opened_at', { ascending: false })
        .limit(50);

      if (recentPositions && recentPositions.length > 0) {
        const roundIds = [
          ...new Set(recentPositions.map((p: { round_id: string }) => p.round_id)),
        ];
        const { data: opponents } = await supabase
          .from('positions')
          .select('trader_id')
          .in('round_id', roundIds)
          .neq('trader_id', profile_id);

        if (opponents) {
          const uniqueOpponents = [
            ...new Set(opponents.map((o: { trader_id: string }) => o.trader_id)),
          ];
          opponentIds.push(...uniqueOpponents.slice(0, 10)); // Cap at 10 for performance
        }
      }
    }

    for (const oppId of opponentIds) {
      // Get recent trades for both players
      const { data: trades1 } = await supabase
        .from('positions')
        .select('symbol, direction, entry_price, size, opened_at')
        .eq('trader_id', profile_id)
        .order('opened_at', { ascending: false })
        .limit(100);

      const { data: trades2 } = await supabase
        .from('positions')
        .select('symbol, direction, entry_price, size, opened_at')
        .eq('trader_id', oppId)
        .order('opened_at', { ascending: false })
        .limit(100);

      if (trades1 && trades2 && trades1.length > 0 && trades2.length > 0) {
        const patterns1: TradePattern[] = trades1.map(
          (t: { symbol: string; direction: string; entry_price: number; size: number; opened_at: string }) => ({
            symbol: t.symbol,
            side: t.direction,
            price: t.entry_price,
            quantity: t.size,
            timestamp: t.opened_at,
          }),
        );

        const patterns2: TradePattern[] = trades2.map(
          (t: { symbol: string; direction: string; entry_price: number; size: number; opened_at: string }) => ({
            symbol: t.symbol,
            side: t.direction,
            price: t.entry_price,
            quantity: t.size,
            timestamp: t.opened_at,
          }),
        );

        const result = detectWashTrading(patterns1, patterns2);
        allViolations.push(...result.violations);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Selective history check
  // -----------------------------------------------------------------------
  if (check_types.includes('selective_history')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('created_at')
      .eq('id', profile_id)
      .single();

    const { data: trades } = await supabase
      .from('positions')
      .select('symbol, direction, entry_price, size, realized_pnl, opened_at')
      .eq('trader_id', profile_id)
      .not('closed_at', 'is', null)
      .order('opened_at', { ascending: true });

    if (trades && trades.length > 0 && profile) {
      const historyTrades: HistoryTrade[] = trades.map(
        (t: {
          symbol: string;
          direction: string;
          entry_price: number;
          size: number;
          realized_pnl: number | null;
          opened_at: string;
        }) => ({
          symbol: t.symbol,
          side: t.direction,
          price: t.entry_price,
          quantity: t.size,
          pnl: t.realized_pnl ?? 0,
          timestamp: t.opened_at,
        }),
      );

      const result = validateHistoryImport(historyTrades, profile.created_at);
      allViolations.push(...result.violations);
    }
  }

  // -----------------------------------------------------------------------
  // Store auto-detected violations
  // -----------------------------------------------------------------------
  if (allViolations.length > 0) {
    const rows = allViolations.map((v) => ({
      profile_id,
      violation_type: v.type,
      severity: v.severity,
      details: v.details,
      auto_detected: true,
    }));

    await supabase.from('integrity_violations').insert(rows);
  }

  return NextResponse.json({
    passed: allViolations.length === 0,
    violations: allViolations,
  });
}
