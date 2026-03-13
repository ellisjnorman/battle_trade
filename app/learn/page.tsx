'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const B = "var(--font-bebas, 'Bebas Neue'), sans-serif"
const M = "var(--font-jetbrains, 'JetBrains Mono'), monospace"
const S = "var(--font-dm-sans, 'DM Sans'), sans-serif"

type Tab = 'lessons' | 'strategies' | 'mentors' | 'challenges'

interface StrategyItem {
  id: string; title: string; body: string; tags: string[]; upvotes: number
  author_name?: string; author_rank_tier?: string; author_tr_score?: number
  voted?: boolean
}

interface MentorItem {
  id: string; display_name: string; tr_score: number; rank_tier: string
  total_wins: number; win_rate: number; bio: string | null
}

const LESSONS = [
  { id: 'leverage', title: 'LEVERAGE 101', desc: 'Leverage multiplies your gains AND your losses. 10x means a 10% move wipes you out. Start at 2-3x.', icon: '📊', tag: 'BEGINNER', duration: '2 min' },
  { id: 'candles', title: 'READING CANDLES', desc: 'Green = close above open (bullish). Red = close below open (bearish). Wicks show rejection. Body size shows conviction.', icon: '🕯', tag: 'BEGINNER', duration: '3 min' },
  { id: 'risk', title: 'RISK MANAGEMENT', desc: 'Never risk more than 2% of your balance on a single trade. Set stops. Position sizing > entry timing.', icon: '🛡', tag: 'ESSENTIAL', duration: '4 min' },
  { id: 'shorts', title: 'SHORTING EXPLAINED', desc: 'You borrow, sell high, buy back low. Profit from price drops. Unlimited risk if price goes up.', icon: '📉', tag: 'INTERMEDIATE', duration: '3 min' },
  { id: 'stops', title: 'STOP LOSSES', desc: 'A stop-loss automatically closes your position at a set price. Prevents catastrophic losses. Always use one.', icon: '🛑', tag: 'ESSENTIAL', duration: '2 min' },
  { id: 'events', title: 'MARKET EVENTS', desc: 'Save credits early. Trigger events on the leader in round 3+. Shield before you take the lead. Timing > brute force.', icon: '⚡', tag: 'STRATEGY', duration: '5 min' },
  { id: 'psychology', title: 'TRADING PSYCHOLOGY', desc: 'Fear and greed are your real opponents. Stick to your plan. Don\'t revenge trade after a loss.', icon: '🧠', tag: 'ADVANCED', duration: '4 min' },
  { id: 'correlation', title: 'ASSET CORRELATION', desc: 'BTC leads the market. When BTC dumps, alts dump harder. Diversify across uncorrelated assets.', icon: '🔗', tag: 'INTERMEDIATE', duration: '3 min' },
]

const CHALLENGES = [
  { id: 'c1', title: 'THE MINIMALIST', desc: 'Win a round with only 1 trade.', reward: '200 CR', badge: 'DISCIPLINE', difficulty: 'MEDIUM' },
  { id: 'c2', title: 'DIVERSIFIER', desc: 'Trade 5 different assets in one round.', reward: '150 CR', badge: null, difficulty: 'EASY' },
  { id: 'c3', title: 'SURVIVOR', desc: 'Survive 3 market events in a single round.', reward: '300 CR', badge: 'TANK', difficulty: 'HARD' },
  { id: 'c4', title: 'PACIFIST', desc: 'Win a round without triggering any events.', reward: '250 CR', badge: 'PACIFIST', difficulty: 'HARD' },
  { id: 'c5', title: 'NO LEVERAGE', desc: 'Win with 1x leverage only.', reward: '200 CR', badge: null, difficulty: 'MEDIUM' },
  { id: 'c6', title: 'SPEED RUN', desc: 'Open and close 5 profitable trades in 2 minutes.', reward: '400 CR', badge: 'SCALPER', difficulty: 'EXPERT' },
]

const TIER_COLORS: Record<string, string> = {
  paper_hands: '#555', retail: '#CD7F32', swing_trader: '#C0C0C0',
  market_maker: '#FFD700', whale: '#00BFFF', degen_king: '#F5A0D0',
}

export default function LearnPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('lessons')
  const [strategies, setStrategies] = useState<StrategyItem[]>([])
  const [mentors, setMentors] = useState<MentorItem[]>([])
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null)

  useEffect(() => {
    if (tab === 'strategies') {
      fetch('/api/strategies?sort=upvotes&limit=20').then(r => r.ok ? r.json() : { strategies: [] }).then(d => setStrategies(d.strategies ?? [])).catch(() => {})
    }
    if (tab === 'mentors') {
      fetch('/api/leaderboard/global?min_tr=60&limit=10').then(r => r.ok ? r.json() : { traders: [] }).then(d => setMentors(d.traders ?? [])).catch(() => {})
    }
  }, [tab])

  const handleVote = async (stratId: string) => {
    // TODO: wire to real auth
    const profileId = localStorage.getItem('bt_profile_id')
    if (!profileId) { router.push('/login'); return }
    try {
      const r = await fetch(`/api/strategies/${stratId}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voter_id: profileId }) })
      if (r.ok) {
        const d = await r.json()
        setStrategies(prev => prev.map(s => s.id === stratId ? { ...s, upvotes: d.upvotes, voted: d.voted } : s))
      }
    } catch {}
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'lessons', label: 'LESSONS', icon: '📚' },
    { id: 'strategies', label: 'STRATEGY LAB', icon: '🧪' },
    { id: 'mentors', label: 'MENTORS', icon: '🎓' },
    { id: 'challenges', label: 'CHALLENGES', icon: '🎯' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A' }}>
      <style>{`
        .card:hover { border-color: #F5A0D0 !important; }
        .tab-btn:hover { color: #FFF !important; }
      `}</style>

      {/* Nav */}
      <nav style={{ height: 56, borderBottom: '1px solid #1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: '#0D0D0D' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-icon.png" alt="" style={{ height: 24, width: 'auto' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <span style={{ fontFamily: B, fontSize: 20, color: '#F5A0D0', letterSpacing: '0.1em' }}>BATTLE TRADE</span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <a href="/markets" style={{ fontFamily: B, fontSize: 14, color: '#888', letterSpacing: '0.08em', textDecoration: 'none' }}>MARKETS</a>
          <a href="/learn" style={{ fontFamily: B, fontSize: 14, color: '#FFF', letterSpacing: '0.08em', textDecoration: 'none' }}>LEARN</a>
        </div>
        <button onClick={() => router.push('/markets')} style={{ fontFamily: B, fontSize: 14, color: '#0A0A0A', background: '#F5A0D0', border: 'none', padding: '8px 20px', cursor: 'pointer' }}>PLAY NOW</button>
      </nav>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontFamily: B, fontSize: 48, color: 'white', letterSpacing: '0.05em', marginBottom: 8 }}>TRADING ACADEMY</h1>
        <p style={{ fontFamily: S, fontSize: 14, color: '#888', marginBottom: 32 }}>Learn to trade. Sharpen your strategy. Build your edge.</p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 32, borderBottom: '1px solid #1A1A1A', paddingBottom: 0 }}>
          {tabs.map(t => (
            <button key={t.id} className="tab-btn" onClick={() => setTab(t.id)}
              style={{
                fontFamily: B, fontSize: 14, letterSpacing: '0.08em', padding: '10px 20px', cursor: 'pointer', transition: 'color 150ms',
                background: 'transparent', border: 'none', borderBottom: tab === t.id ? '2px solid #F5A0D0' : '2px solid transparent',
                color: tab === t.id ? '#FFF' : '#666',
              }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* LESSONS TAB */}
        {tab === 'lessons' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {LESSONS.map(l => (
              <div key={l.id} className="card" onClick={() => setExpandedLesson(expandedLesson === l.id ? null : l.id)}
                style={{ padding: 20, background: '#0D0D0D', border: '1px solid #1A1A1A', cursor: 'pointer', transition: 'border-color 150ms' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 20 }}>{l.icon}</span>
                    <span style={{ fontFamily: M, fontSize: 9, color: '#F5A0D0', border: '1px solid rgba(245,160,208,0.3)', padding: '2px 6px' }}>{l.tag}</span>
                  </div>
                  <span style={{ fontFamily: M, fontSize: 10, color: '#555' }}>{l.duration}</span>
                </div>
                <h3 style={{ fontFamily: B, fontSize: 20, color: 'white', letterSpacing: '0.05em', marginBottom: 6 }}>{l.title}</h3>
                <p style={{ fontFamily: S, fontSize: 13, color: expandedLesson === l.id ? '#CCC' : '#888', lineHeight: 1.5, maxHeight: expandedLesson === l.id ? 200 : 40, overflow: 'hidden', transition: 'max-height 300ms ease' }}>
                  {l.desc}
                </p>
                {expandedLesson === l.id && (
                  <button onClick={e => { e.stopPropagation(); router.push('/markets') }}
                    style={{ marginTop: 12, fontFamily: B, fontSize: 13, color: '#0A0A0A', background: '#F5A0D0', border: 'none', padding: '8px 20px', cursor: 'pointer' }}>
                    TRY IT IN A FREE LOBBY →
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* STRATEGIES TAB */}
        {tab === 'strategies' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontFamily: S, fontSize: 13, color: '#888' }}>{strategies.length} strategies</span>
              <button onClick={() => router.push('/create')} style={{ fontFamily: B, fontSize: 13, color: '#F5A0D0', background: 'transparent', border: '1px solid #F5A0D0', padding: '8px 16px', cursor: 'pointer' }}>
                SHARE STRATEGY
              </button>
            </div>
            {strategies.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, border: '1px solid #1A1A1A', background: '#0D0D0D' }}>
                <span style={{ fontFamily: B, fontSize: 24, color: '#555' }}>NO STRATEGIES YET</span>
                <p style={{ fontFamily: S, fontSize: 13, color: '#888', marginTop: 8 }}>Be the first to share your trading wisdom.</p>
              </div>
            ) : strategies.map(s => (
              <div key={s.id} style={{ padding: 20, background: '#0D0D0D', border: '1px solid #1A1A1A', marginBottom: 8, display: 'flex', gap: 16 }}>
                <button onClick={() => handleVote(s.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, minWidth: 40 }}>
                  <span style={{ fontSize: 16, color: s.voted ? '#F5A0D0' : '#555' }}>▲</span>
                  <span style={{ fontFamily: M, fontSize: 14, color: s.voted ? '#F5A0D0' : '#888' }}>{s.upvotes}</span>
                </button>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontFamily: B, fontSize: 18, color: 'white', letterSpacing: '0.03em', marginBottom: 4 }}>{s.title}</h3>
                  <p style={{ fontFamily: S, fontSize: 13, color: '#888', lineHeight: 1.5, marginBottom: 8 }}>{s.body.slice(0, 200)}{s.body.length > 200 ? '...' : ''}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {s.tags.map(t => (
                      <span key={t} style={{ fontFamily: M, fontSize: 9, color: '#F5A0D0', border: '1px solid rgba(245,160,208,0.2)', padding: '2px 6px' }}>#{t}</span>
                    ))}
                    {s.author_name && (
                      <span style={{ fontFamily: S, fontSize: 11, color: '#666' }}>
                        by <span style={{ color: TIER_COLORS[s.author_rank_tier ?? 'paper_hands'] ?? '#888' }}>{s.author_name}</span>
                        {s.author_tr_score ? ` · TR ${s.author_tr_score}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MENTORS TAB */}
        {tab === 'mentors' && (
          <div>
            <p style={{ fontFamily: S, fontSize: 14, color: '#888', marginBottom: 24 }}>Top-ranked traders who can help you level up. Challenge them to a battle or watch their replays.</p>
            {mentors.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, border: '1px solid #1A1A1A', background: '#0D0D0D' }}>
                <span style={{ fontFamily: B, fontSize: 24, color: '#555' }}>NO MENTORS YET</span>
                <p style={{ fontFamily: S, fontSize: 13, color: '#888', marginTop: 8 }}>Reach Market Maker rank (TR 60+) to become a mentor.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {mentors.map(m => (
                  <div key={m.id} className="card" onClick={() => router.push('/profile')}
                    style={{ padding: 20, background: '#0D0D0D', border: `1px solid ${TIER_COLORS[m.rank_tier] ?? '#1A1A1A'}33`, cursor: 'pointer', transition: 'border-color 150ms' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontFamily: B, fontSize: 20, color: '#FFF', letterSpacing: '0.03em' }}>{m.display_name}</span>
                      <span style={{ fontFamily: M, fontSize: 12, color: TIER_COLORS[m.rank_tier] ?? '#888' }}>TR {m.tr_score}</span>
                    </div>
                    <div style={{ fontFamily: M, fontSize: 11, color: '#888', marginBottom: 4 }}>
                      {m.rank_tier.replace(/_/g, ' ').toUpperCase()} · {m.total_wins}W · {(m.win_rate * 100).toFixed(0)}%
                    </div>
                    {m.bio && <p style={{ fontFamily: S, fontSize: 12, color: '#666', marginTop: 8, lineHeight: 1.4 }}>{m.bio.slice(0, 100)}</p>}
                    <button onClick={e => { e.stopPropagation(); router.push('/profile') }}
                      style={{ marginTop: 12, fontFamily: B, fontSize: 12, color: '#F5A0D0', background: 'transparent', border: '1px solid #F5A0D0', padding: '6px 16px', cursor: 'pointer', width: '100%' }}>
                      VIEW PROFILE
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CHALLENGES TAB */}
        {tab === 'challenges' && (
          <div>
            <p style={{ fontFamily: S, fontSize: 14, color: '#888', marginBottom: 24 }}>Complete challenges to earn credits, badges, and boost your TR score.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {CHALLENGES.map(c => {
                const diffColors: Record<string, string> = { EASY: '#00FF88', MEDIUM: '#FFD700', HARD: '#FF3333', EXPERT: '#F5A0D0' }
                return (
                  <div key={c.id} style={{ padding: 20, background: '#0D0D0D', border: '1px solid #1A1A1A' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontFamily: M, fontSize: 9, color: diffColors[c.difficulty] ?? '#888', border: `1px solid ${diffColors[c.difficulty] ?? '#888'}44`, padding: '2px 6px' }}>{c.difficulty}</span>
                      <span style={{ fontFamily: M, fontSize: 11, color: '#F5A0D0' }}>{c.reward}</span>
                    </div>
                    <h3 style={{ fontFamily: B, fontSize: 20, color: 'white', letterSpacing: '0.05em', marginBottom: 4 }}>{c.title}</h3>
                    <p style={{ fontFamily: S, fontSize: 13, color: '#888', lineHeight: 1.4, marginBottom: 8 }}>{c.desc}</p>
                    {c.badge && (
                      <span style={{ fontFamily: M, fontSize: 9, color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)', padding: '2px 8px' }}>UNLOCKS: {c.badge} BADGE</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
