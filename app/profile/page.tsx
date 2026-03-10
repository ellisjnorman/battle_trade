'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useToastStore } from '@/lib/toast-store';
import { getAvailableWallets, connectWallet, shortenAddress, type WalletConnection } from '@/lib/wallet';

const B: React.CSSProperties = { fontFamily: "var(--font-bebas, 'Bebas Neue'), sans-serif", letterSpacing: '0.05em' };
const M: React.CSSProperties = { fontFamily: "var(--font-jetbrains, 'JetBrains Mono'), monospace", letterSpacing: '-0.02em' };
const S: React.CSSProperties = { fontFamily: "var(--font-dm-sans, 'DM Sans'), sans-serif" };

interface ProfileData {
  id: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  total_lobbies_played: number;
  total_wins: number;
  win_rate: number;
  best_return: number;
  global_rank: number | null;
  credits: number;
}

interface LobbyHistory {
  id: string;
  lobby_name: string;
  final_rank: number | null;
  is_eliminated: boolean;
  returnPct: number;
  date: string;
}

const AVATARS = [
  '🐻', '🐂', '🦈', '🦅', '🐺', '🦁', '🐲', '🦊',
  '🎯', '💎', '🔥', '⚡', '🚀', '💀', '👑', '🎰',
];

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [history, setHistory] = useState<LobbyHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState('');
  const [editHandle, setEditHandle] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAvatars, setShowAvatars] = useState(false);
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [walletAvailable, setWalletAvailable] = useState({ evm: false, solana: false });
  const [connectingWallet, setConnectingWallet] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  // Get profile ID from localStorage (set during registration)
  const profileId = typeof window !== 'undefined' ? localStorage.getItem('bt_profile_id') : null;

  useEffect(() => { setWalletAvailable(getAvailableWallets()); }, []);

  const handleConnectWallet = async (type?: 'evm' | 'solana') => {
    setConnectingWallet(true);
    try {
      const w = await connectWallet(type);
      setWallet(w);
      addToast(`${w.label} connected: ${shortenAddress(w.address)}`, 'success', '🔗');
      // Save to profile
      if (profileId) {
        await supabase.from('profiles').update({ exchange_uid: w.address }).eq('id', profileId);
      }
    } catch (err) {
      addToast((err as Error).message ?? 'Wallet connection failed', 'error');
    }
    setConnectingWallet(false);
  };

  useEffect(() => {
    if (!profileId) { setLoading(false); return; }

    (async () => {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', profileId).single();
      if (p) {
        setProfile(p as ProfileData);
        setEditName(p.display_name ?? '');
        setEditHandle(p.handle ?? '');
        setEditAvatar(p.avatar_url ?? '');
      }

      // Fetch lobby history via sessions
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, lobby_id, final_rank, is_eliminated, starting_balance, final_balance, created_at')
        .eq('trader_id', profileId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (sessions && sessions.length > 0) {
        const lobbyIds = sessions.map(s => s.lobby_id);
        const { data: lobbies } = await supabase.from('lobbies').select('id, name').in('id', lobbyIds);
        const lobbyMap = new Map((lobbies ?? []).map(l => [l.id, l.name]));

        setHistory(sessions.map(s => ({
          id: s.id,
          lobby_name: lobbyMap.get(s.lobby_id) ?? 'Unknown',
          final_rank: s.final_rank,
          is_eliminated: s.is_eliminated,
          returnPct: s.final_balance && s.starting_balance ? ((s.final_balance - s.starting_balance) / s.starting_balance) * 100 : 0,
          date: new Date(s.created_at).toLocaleDateString(),
        })));
      }

      setLoading(false);
    })();
  }, [profileId]);

  const handleSave = async () => {
    if (!profileId || !editName.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: editName.trim(),
        handle: editHandle.trim() || null,
        avatar_url: editAvatar || null,
      })
      .eq('id', profileId);

    if (error) {
      addToast('Failed to save', 'error');
    } else {
      addToast('Profile updated', 'success', '✓');
      setProfile(p => p ? { ...p, display_name: editName.trim(), handle: editHandle.trim() || null, avatar_url: editAvatar || null } : p);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ ...B, fontSize: 24, color: '#888' }}>LOADING...</span>
      </div>
    );
  }

  if (!profileId || !profile) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <span style={{ ...B, fontSize: 32, color: '#FFF' }}>NO PROFILE FOUND</span>
        <span style={{ ...S, fontSize: 14, color: '#888' }}>Join a lobby to create your profile</span>
        <a href="/create" style={{ ...B, fontSize: 18, color: '#0A0A0A', background: '#F5A0D0', padding: '12px 32px', textDecoration: 'none' }}>CREATE A LOBBY</a>
      </div>
    );
  }

  const statBoxStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 120,
    padding: 16,
    background: '#0D0D0D',
    border: '1px solid #1A1A1A',
    textAlign: 'center',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1A1A1A', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ display: 'flex' }}>
            <img src="/brand/logo-main.png" alt="" style={{ height: 28 }} />
          </a>
          <span style={{ ...B, fontSize: 16, color: '#888' }}>PROFILE</span>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px' }}>
        {/* Avatar + Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32 }}>
          <div
            onClick={() => setShowAvatars(!showAvatars)}
            style={{
              width: 80, height: 80,
              background: '#111',
              border: '2px solid #F5A0D0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 40, cursor: 'pointer',
            }}
          >
            {editAvatar || '🎮'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...B, fontSize: 36, color: '#FFF', lineHeight: 1 }}>{profile.display_name}</div>
            {profile.handle && <div style={{ ...M, fontSize: 14, color: '#888' }}>@{profile.handle}</div>}
            {profile.global_rank && <div style={{ ...M, fontSize: 12, color: '#F5A0D0' }}>GLOBAL RANK #{profile.global_rank}</div>}
          </div>
        </div>

        {/* Avatar picker */}
        {showAvatars && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24, padding: 12, background: '#0D0D0D', border: '1px solid #1A1A1A' }}>
            {AVATARS.map(a => (
              <button
                key={a}
                onClick={() => { setEditAvatar(a); setShowAvatars(false); }}
                style={{
                  width: 44, height: 44, fontSize: 24,
                  background: editAvatar === a ? 'rgba(245,160,208,0.15)' : '#111',
                  border: editAvatar === a ? '2px solid #F5A0D0' : '1px solid #222',
                  cursor: 'pointer',
                }}
              >
                {a}
              </button>
            ))}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
          <div style={statBoxStyle}>
            <div style={{ ...B, fontSize: 14, color: '#888' }}>LOBBIES</div>
            <div style={{ ...M, fontSize: 28, color: '#FFF', fontWeight: 700 }}>{profile.total_lobbies_played}</div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ ...B, fontSize: 14, color: '#888' }}>WINS</div>
            <div style={{ ...M, fontSize: 28, color: '#00FF88', fontWeight: 700 }}>{profile.total_wins}</div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ ...B, fontSize: 14, color: '#888' }}>WIN RATE</div>
            <div style={{ ...M, fontSize: 28, color: profile.win_rate >= 50 ? '#00FF88' : '#FF3333', fontWeight: 700 }}>{profile.win_rate.toFixed(0)}%</div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ ...B, fontSize: 14, color: '#888' }}>BEST</div>
            <div style={{ ...M, fontSize: 28, color: '#F5A0D0', fontWeight: 700 }}>+{profile.best_return.toFixed(0)}%</div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ ...B, fontSize: 14, color: '#888' }}>CREDITS</div>
            <div style={{ ...M, fontSize: 28, color: '#FFD700', fontWeight: 700 }}>{profile.credits}</div>
          </div>
        </div>

        {/* Edit form */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ ...B, fontSize: 18, color: '#888', marginBottom: 12 }}>EDIT PROFILE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ ...B, fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>DISPLAY NAME</label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                maxLength={24}
                style={{ width: '100%', height: 44, padding: '0 12px', ...M, fontSize: 14, color: '#FFF', background: '#111', border: '1px solid #222', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ ...B, fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>HANDLE</label>
              <input
                value={editHandle}
                onChange={e => setEditHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                maxLength={20}
                placeholder="your_handle"
                style={{ width: '100%', height: 44, padding: '0 12px', ...M, fontSize: 14, color: '#FFF', background: '#111', border: '1px solid #222', outline: 'none' }}
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !editName.trim()}
              style={{
                height: 48, ...B, fontSize: 20, color: '#0A0A0A',
                background: saving ? '#888' : '#F5A0D0',
                border: 'none', cursor: saving ? 'default' : 'pointer',
                boxShadow: saving ? 'none' : '0 0 16px rgba(245,160,208,0.3)',
              }}
            >
              {saving ? 'SAVING...' : 'SAVE CHANGES'}
            </button>
          </div>
        </div>

        {/* Wallet */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ ...B, fontSize: 18, color: '#888', marginBottom: 12 }}>WALLET</div>
          {wallet ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#0D0D0D', border: '1px solid #1A1A1A' }}>
              <span style={{ fontSize: 20 }}>{wallet.type === 'solana' ? '👻' : '🦊'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ ...B, fontSize: 14, color: '#FFF' }}>{wallet.label}</div>
                <div style={{ ...M, fontSize: 12, color: '#00FF88' }}>{shortenAddress(wallet.address)}</div>
              </div>
              <span style={{ ...B, fontSize: 10, color: '#00FF88', border: '1px solid #00FF88', padding: '2px 8px' }}>CONNECTED</span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              {walletAvailable.evm && (
                <button
                  onClick={() => handleConnectWallet('evm')}
                  disabled={connectingWallet}
                  style={{
                    flex: 1, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    ...B, fontSize: 16, color: '#FFF', background: '#111', border: '1px solid #333', cursor: 'pointer',
                  }}
                >
                  🦊 METAMASK
                </button>
              )}
              {walletAvailable.solana && (
                <button
                  onClick={() => handleConnectWallet('solana')}
                  disabled={connectingWallet}
                  style={{
                    flex: 1, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    ...B, fontSize: 16, color: '#FFF', background: '#111', border: '1px solid #333', cursor: 'pointer',
                  }}
                >
                  👻 PHANTOM
                </button>
              )}
              {!walletAvailable.evm && !walletAvailable.solana && (
                <div style={{ ...S, fontSize: 13, color: '#666', padding: '12px 0' }}>
                  No wallet detected. Install MetaMask or Phantom to connect.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Match History */}
        <div>
          <div style={{ ...B, fontSize: 18, color: '#888', marginBottom: 12 }}>MATCH HISTORY</div>
          {history.length === 0 && (
            <div style={{ padding: '32px 0', textAlign: 'center', border: '1px solid #111', background: '#0D0D0D' }}>
              <div style={{ ...B, fontSize: 20, color: '#555' }}>NO MATCHES YET</div>
              <div style={{ ...S, fontSize: 12, color: '#555', marginTop: 8 }}>Join a lobby to start your battle record</div>
            </div>
          )}
          {history.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {history.map(h => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#0D0D0D', border: '1px solid #111' }}>
                  <span style={{ ...B, fontSize: 16, color: h.final_rank === 1 ? '#FFD700' : h.final_rank && h.final_rank <= 3 ? '#F5A0D0' : '#555', width: 40 }}>
                    {h.final_rank ? `#${h.final_rank}` : '—'}
                  </span>
                  <span style={{ ...B, fontSize: 14, color: '#FFF', flex: 1 }}>{h.lobby_name}</span>
                  <span style={{ ...M, fontSize: 14, fontWeight: 700, color: h.returnPct >= 0 ? '#00FF88' : '#FF3333' }}>
                    {h.returnPct >= 0 ? '+' : ''}{h.returnPct.toFixed(1)}%
                  </span>
                  <span style={{ ...M, fontSize: 10, color: '#555' }}>{h.date}</span>
                  {h.is_eliminated && <span style={{ ...B, fontSize: 10, color: '#FF3333' }}>KO</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
