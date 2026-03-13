'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { font, c, radius, globalCSS, tierColor, tierShort, tierName, navStyle, logoStyle, rankColor } from '@/app/design'
import { RANK_TIERS } from '@/lib/reputation'

interface LeaderboardTrader {
  id: string
  display_name: string
  handle: string | null
  avatar_url: string | null
  tr_score: number
  rank_tier: string
  total_wins: number
  win_rate: number
  best_return: number
  bio: string | null
  total_lobbies_played: number
}

type SortMode = 'tr_score' | 'wins' | 'win_rate' | 'best_return' | 'lobbies'

const SORT_OPTIONS: { key: SortMode; label: string; short: string }[] = [
  { key: 'tr_score', label: 'TR Score', short: 'TR' },
  { key: 'wins', label: 'Total Wins', short: 'WINS' },
  { key: 'win_rate', label: 'Win Rate', short: 'W%' },
  { key: 'best_return', label: 'Best Return', short: 'BEST' },
  { key: 'lobbies', label: 'Lobbies Played', short: 'GAMES' },
]

const PAGE_SIZE = 20

export default function GlobalLeaderboard() {
  const router = useRouter()
  const [traders, setTraders] = useState<LeaderboardTrader[]>([])
  const [total, setTotal] = useState(0)
  const [sort, setSort] = useState<SortMode>('tr_score')
  const [tierFilter, setTierFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [scrolled, setScrolled] = useState(false)
  const [myRank, setMyRank] = useState<{ position: number; profile: LeaderboardTrader } | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Debounce search
  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearchDebounced(search)
      setOffset(0)
    }, 300)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  // Scroll detection
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ sort, limit: String(PAGE_SIZE), offset: String(offset) })
    if (tierFilter) params.set('tier', tierFilter)
    if (searchDebounced) params.set('q', searchDebounced)

    // Include profile_id for "my rank" if available
    const profileId = typeof window !== 'undefined' ? localStorage.getItem('bt_profile_id') || localStorage.getItem('bt_guest_profile_id') : null
    if (profileId) params.set('profile_id', profileId)

    try {
      const res = await fetch(`/api/leaderboard/global?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTraders(data.traders ?? [])
        setTotal(data.total ?? 0)
        if (data.my_rank) {
          setMyRank({ position: data.my_rank.position, profile: data.my_rank.profile as LeaderboardTrader })
        }
      }
    } catch {}
    setLoading(false)
  }, [sort, offset, tierFilter, searchDebounced])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  const formatPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`

  const getSortValue = (t: LeaderboardTrader) => {
    switch (sort) {
      case 'tr_score': return t.tr_score.toFixed(0)
      case 'wins': return String(t.total_wins)
      case 'win_rate': return `${(t.win_rate * 100).toFixed(0)}%`
      case 'best_return': return formatPct(t.best_return)
      case 'lobbies': return String(t.total_lobbies_played)
    }
  }

  // Top 3 podium
  const top3 = !loading && offset === 0 && !searchDebounced ? traders.slice(0, 3) : []
  const listTraders = offset === 0 && !searchDebounced ? traders.slice(3) : traders
  const listStartRank = offset === 0 && !searchDebounced ? 4 : offset + 1

  return (
    <>
      <style>{globalCSS}</style>
      <style>{`
        @keyframes scoreReveal { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        .score-reveal { animation: scoreReveal 0.4s cubic-bezier(.34,1.56,.64,1) both; }
        .tier-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
      `}</style>

      <div style={{ minHeight: '100vh', background: c.bg }}>
        {/* Nav */}
        <nav style={navStyle(scrolled)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img
              src="/brand/logo-main.png" alt="Battle Trade" style={logoStyle}
              onClick={() => router.push('/dashboard')}
              role="button" tabIndex={0}
            />
            <span style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text2 }}>Global Leaderboard</span>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="btn-s"
            style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 500, color: c.text3, background: c.surface, border: `1px solid ${c.border}`, borderRadius: radius.md, padding: '8px 16px', cursor: 'pointer' }}
          >Dashboard</button>
        </nav>

        <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>

          {/* My Rank Card */}
          {myRank && (
            <div className="fade-up" style={{
              background: c.surface, border: `1px solid ${c.pinkBorder}`, borderRadius: radius.lg,
              padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', background: c.elevated,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: font.mono, fontSize: 14, fontWeight: 700, color: c.pink,
                }}>#{myRank.position}</div>
                <div>
                  <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text }}>Your Rank</div>
                  <div style={{ fontFamily: font.sans, fontSize: 12, color: c.text3 }}>{myRank.profile.display_name}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: font.mono, fontSize: 20, fontWeight: 700, color: c.pink }}>{myRank.profile.tr_score}</div>
                <span className="tier-badge" style={{ color: tierColor(myRank.profile.rank_tier), border: `1px solid ${tierColor(myRank.profile.rank_tier)}30` }}>
                  {tierShort(myRank.profile.rank_tier)}
                </span>
              </div>
            </div>
          )}

          {/* Search + Sort */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search traders..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: '1 1 200px', padding: '10px 14px', background: c.surface, border: `1px solid ${c.border}`,
                borderRadius: radius.md, color: c.text, fontFamily: font.sans, fontSize: 14, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              {SORT_OPTIONS.map(s => (
                <button
                  key={s.key}
                  onClick={() => { setSort(s.key); setOffset(0) }}
                  className="pill"
                  style={{
                    color: sort === s.key ? c.pink : c.text3,
                    background: sort === s.key ? c.pinkDim : 'transparent',
                    border: `1px solid ${sort === s.key ? c.pinkBorder : c.border}`,
                  }}
                >{s.short}</button>
              ))}
            </div>
          </div>

          {/* Tier Filters */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
            <button
              className="pill"
              onClick={() => { setTierFilter(null); setOffset(0) }}
              style={{
                color: !tierFilter ? c.text : c.text4,
                background: !tierFilter ? c.elevated : 'transparent',
                border: `1px solid ${!tierFilter ? c.border : 'transparent'}`,
              }}
            >ALL</button>
            {RANK_TIERS.map(t => (
              <button
                key={t.id}
                className="pill"
                onClick={() => { setTierFilter(t.id === tierFilter ? null : t.id); setOffset(0) }}
                style={{
                  color: tierFilter === t.id ? t.color : c.text4,
                  background: tierFilter === t.id ? `${t.color}10` : 'transparent',
                  border: `1px solid ${tierFilter === t.id ? `${t.color}30` : 'transparent'}`,
                }}
              >{t.name}</button>
            ))}
          </div>

          {/* Top 3 Podium */}
          {top3.length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 32, alignItems: 'flex-end' }}>
              {[1, 0, 2].map((podiumIdx, displayIdx) => {
                const t = top3[podiumIdx]
                if (!t) return <div key={displayIdx} style={{ flex: 1 }} />
                const rank = podiumIdx + 1
                const rc = rankColor(rank)
                const heights = [140, 170, 120]
                return (
                  <div
                    key={t.id}
                    className="card-h score-reveal"
                    onClick={() => router.push(`/profile/${t.id}`)}
                    style={{
                      flex: 1, cursor: 'pointer', textAlign: 'center',
                      background: c.surface, border: `1px solid ${rank === 1 ? c.pinkBorder : c.border}`,
                      borderRadius: radius.lg, padding: '20px 12px',
                      minHeight: heights[displayIdx],
                      animationDelay: `${displayIdx * 0.1}s`,
                      boxShadow: rank === 1 ? c.pinkGlow : 'none',
                    }}
                  >
                    <div style={{ fontFamily: font.mono, fontSize: rank === 1 ? 32 : 24, fontWeight: 700, color: rc.color, textShadow: rc.glow }}>
                      #{rank}
                    </div>
                    {t.avatar_url ? (
                      <img src={t.avatar_url} alt="" style={{ width: rank === 1 ? 56 : 44, height: rank === 1 ? 56 : 44, borderRadius: '50%', border: `2px solid ${rc.color}`, margin: '8px auto', display: 'block', objectFit: 'cover' }} />
                    ) : (
                      <div style={{
                        width: rank === 1 ? 56 : 44, height: rank === 1 ? 56 : 44, borderRadius: '50%',
                        background: c.elevated, border: `2px solid ${rc.color}`, margin: '8px auto',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: font.sans, fontSize: rank === 1 ? 20 : 16, fontWeight: 700, color: rc.color,
                      }}>{t.display_name?.[0]?.toUpperCase() ?? '?'}</div>
                    )}
                    <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.display_name}
                    </div>
                    <div style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 700, color: c.pink, marginTop: 4 }}>
                      {t.tr_score}
                    </div>
                    <span className="tier-badge" style={{ color: tierColor(t.rank_tier), border: `1px solid ${tierColor(t.rank_tier)}30`, marginTop: 6, fontSize: 9 }}>
                      {tierName(t.rank_tier)}
                    </span>
                    <div style={{ fontFamily: font.mono, fontSize: 11, color: c.text3, marginTop: 6 }}>
                      {t.total_wins}W · {formatPct(t.best_return)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Loading skeletons */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 56, borderRadius: radius.md }} />
              ))}
            </div>
          )}

          {/* Trader List */}
          {!loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '48px 1fr 80px 80px 60px', gap: 8,
                padding: '8px 12px', fontFamily: font.sans, fontSize: 11, fontWeight: 600,
                color: c.text4, textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                <span>RANK</span>
                <span>TRADER</span>
                <span style={{ textAlign: 'right' }}>TR</span>
                <span style={{ textAlign: 'right' }}>{SORT_OPTIONS.find(s => s.key === sort)?.short}</span>
                <span style={{ textAlign: 'right' }}>TIER</span>
              </div>

              {listTraders.map((t, i) => {
                const rank = listStartRank + i
                const rc = rankColor(rank)
                return (
                  <div
                    key={t.id}
                    className="row-h fade-up"
                    onClick={() => router.push(`/profile/${t.id}`)}
                    style={{
                      display: 'grid', gridTemplateColumns: '48px 1fr 80px 80px 60px', gap: 8,
                      padding: '12px', borderRadius: radius.sm, cursor: 'pointer',
                      animationDelay: `${i * 0.02}s`,
                      background: rank <= 3 ? `${rc.color}08` : 'transparent',
                    }}
                  >
                    <span style={{
                      fontFamily: font.mono, fontSize: 14, fontWeight: 700,
                      color: rank <= 3 ? rc.color : c.text3,
                    }}>#{rank}</span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      {t.avatar_url ? (
                        <img src={t.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
                      ) : (
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', background: c.elevated, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text3,
                        }}>{t.display_name?.[0]?.toUpperCase() ?? '?'}</div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.display_name}
                        </div>
                        {t.handle && (
                          <div style={{ fontFamily: font.sans, fontSize: 11, color: c.text4 }}>@{t.handle}</div>
                        )}
                      </div>
                    </div>

                    <span style={{ fontFamily: font.mono, fontSize: 15, fontWeight: 700, color: c.pink, textAlign: 'right' }}>
                      {t.tr_score}
                    </span>

                    <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 500, color: c.text2, textAlign: 'right' }}>
                      {getSortValue(t)}
                    </span>

                    <span className="tier-badge" style={{
                      color: tierColor(t.rank_tier), border: `1px solid ${tierColor(t.rank_tier)}30`,
                      fontSize: 9, justifySelf: 'end',
                    }}>
                      {tierShort(t.rank_tier)}
                    </span>
                  </div>
                )
              })}

              {listTraders.length === 0 && !top3.length && (
                <div style={{ textAlign: 'center', padding: 48, fontFamily: font.sans, fontSize: 14, color: c.text3 }}>
                  {searchDebounced ? `No traders found for "${searchDebounced}"` : 'No ranked traders yet'}
                </div>
              )}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 24 }}>
              <button
                className="btn-s"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                style={{
                  fontFamily: font.sans, fontSize: 13, fontWeight: 500, padding: '8px 16px',
                  color: offset === 0 ? c.text4 : c.text2, background: c.surface, border: `1px solid ${c.border}`,
                  borderRadius: radius.md, cursor: offset === 0 ? 'default' : 'pointer', opacity: offset === 0 ? 0.5 : 1,
                }}
              >Prev</button>
              <span style={{ fontFamily: font.mono, fontSize: 13, color: c.text3 }}>
                {currentPage} / {totalPages}
              </span>
              <button
                className="btn-s"
                disabled={currentPage >= totalPages}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                style={{
                  fontFamily: font.sans, fontSize: 13, fontWeight: 500, padding: '8px 16px',
                  color: currentPage >= totalPages ? c.text4 : c.text2, background: c.surface, border: `1px solid ${c.border}`,
                  borderRadius: radius.md, cursor: currentPage >= totalPages ? 'default' : 'pointer', opacity: currentPage >= totalPages ? 0.5 : 1,
                }}
              >Next</button>
            </div>
          )}

          {/* Total count */}
          {!loading && (
            <div style={{ textAlign: 'center', marginTop: 16, fontFamily: font.sans, fontSize: 12, color: c.text4 }}>
              {total} ranked traders
            </div>
          )}
        </div>
      </div>
    </>
  )
}
