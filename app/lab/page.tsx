'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const S = "var(--font-dm-sans, 'DM Sans'), sans-serif"
const M = "var(--font-jetbrains, 'JetBrains Mono'), monospace"
const B = "var(--font-bebas, 'Bebas Neue'), sans-serif"

type SortMode = 'hot' | 'new' | 'top'

interface Strategy {
  id: string; title: string; body: string; tags: string[]; upvotes: number
  usage_count: number; win_rate: number; created_at: string
  author_name?: string; author_rank_tier?: string; author_tr_score?: number
  voted?: boolean
}

const TIER_COLORS: Record<string, string> = {
  paper_hands: '#555', retail: '#CD7F32', swing_trader: '#C0C0C0',
  market_maker: '#F5A0D0', whale: '#00DC82', degen_king: '#F5A0D0', legendary: '#FFF',
}
const TIER_SHORTS: Record<string, string> = {
  paper_hands: 'PAPER', retail: 'RETAIL', swing_trader: 'SWING',
  market_maker: 'MAKER', whale: 'WHALE', degen_king: 'DEGEN', legendary: 'LEGEND',
}

const ALL_TAGS = ['strategy', 'analysis', 'tutorial', 'meta', 'alpha', 'risk-management', 'leverage', 'sabotage', 'psychology', 'beginner']

const REWARD_TIERS = [
  { upvotes: 1, reward: 5, label: 'First upvote' },
  { upvotes: 10, reward: 50, label: '10 upvotes bonus' },
  { upvotes: 25, reward: 100, label: '25 upvotes bonus' },
  { upvotes: 50, reward: 200, label: 'Featured status' },
  { upvotes: 100, reward: 500, label: 'Top contributor badge' },
]

export default function LabPage() {
  const router = useRouter()
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [sort, setSort] = useState<SortMode>('hot')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [showWrite, setShowWrite] = useState(false)
  const [showRewards, setShowRewards] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [scrolled, setScrolled] = useState(false)

  const [writeTitle, setWriteTitle] = useState('')
  const [writeBody, setWriteBody] = useState('')
  const [writeTags, setWriteTags] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setProfileId(localStorage.getItem('bt_profile_id')) }, [])
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])

  useEffect(() => {
    setLoaded(false)
    const sortParam = sort === 'new' ? 'recent' : 'upvotes'
    const tagParam = activeTag ? `&tag=${activeTag}` : ''
    fetch(`/api/strategies?sort=${sortParam}&limit=50${tagParam}`)
      .then(r => r.ok ? r.json() : { strategies: [] })
      .then(d => {
        let strats = d.strategies ?? []
        if (sort === 'hot') {
          const now = Date.now()
          strats = strats.sort((a: Strategy, b: Strategy) => {
            const ageA = (now - new Date(a.created_at).getTime()) / 864e5
            const ageB = (now - new Date(b.created_at).getTime()) / 864e5
            return ((b.upvotes + 1) / Math.pow(ageB + 2, 1.5)) - ((a.upvotes + 1) / Math.pow(ageA + 2, 1.5))
          })
        }
        setStrategies(strats)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [sort, activeTag])

  const handleVote = async (strategyId: string) => {
    if (!profileId) { router.push('/login?redirect=/lab'); return }
    const res = await fetch(`/api/strategies/${strategyId}/vote`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voter_id: profileId }),
    })
    if (res.ok) {
      const { voted, upvotes } = await res.json()
      setStrategies(prev => prev.map(s => s.id === strategyId ? { ...s, upvotes, voted } : s))
    }
  }

  const handleSubmit = async () => {
    if (!profileId || !writeTitle.trim() || !writeBody.trim()) return
    setSubmitting(true)
    const res = await fetch('/api/strategies', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author_id: profileId, title: writeTitle.trim(), body: writeBody.trim(), tags: writeTags }),
    })
    if (res.ok) {
      const data = await res.json()
      setStrategies(prev => [{ ...data, author_name: 'You', voted: false }, ...prev])
      setWriteTitle(''); setWriteBody(''); setWriteTags([]); setShowWrite(false)
    }
    setSubmitting(false)
  }

  const toggleTag = (tag: string) => {
    setWriteTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : prev.length < 5 ? [...prev, tag] : prev)
  }

  const tc = (tier?: string) => TIER_COLORS[tier ?? ''] ?? '#555'
  const ts = (tier?: string) => TIER_SHORTS[tier ?? ''] ?? ''

  const timeAgo = (dateStr: string) => {
    const d = (Date.now() - new Date(dateStr).getTime()) / 1000
    if (d < 60) return 'now'
    if (d < 3600) return `${Math.floor(d / 60)}m`
    if (d < 86400) return `${Math.floor(d / 3600)}h`
    if (d < 604800) return `${Math.floor(d / 86400)}d`
    return `${Math.floor(d / 604800)}w`
  }

  const goWrite = () => profileId ? setShowWrite(true) : router.push('/login?redirect=/lab')

  return (
    <div style={{minHeight:'100vh',background:'#0A0A0A'}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        button,input,textarea{border-radius:0!important}
        ::selection{background:rgba(245,160,208,.25)}

        .strat-row{transition:background .12s;-webkit-tap-highlight-color:transparent}
        .strat-row:hover{background:rgba(255,255,255,.02)!important}
        .vote-btn{transition:all .1s;-webkit-tap-highlight-color:transparent}
        .vote-btn:active{transform:scale(.88)}
        .tag-pill{
          font-family:${S};font-size:12px;font-weight:500;
          padding:4px 10px;cursor:pointer;border-radius:20px!important;
          transition:all .12s;-webkit-tap-highlight-color:transparent
        }
        .tag-pill:hover{border-color:rgba(255,255,255,.15)!important;color:#CCC!important}
        .sort-btn{
          font-family:${S};font-size:14px;font-weight:600;
          padding:8px 16px;cursor:pointer;border:none;background:none;
          border-radius:8px!important;transition:all .12s;-webkit-tap-highlight-color:transparent
        }
        .nav-link{transition:color .12s;-webkit-tap-highlight-color:transparent}
        .nav-link:hover{color:#FFF!important}
        .card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px!important;overflow:hidden}

        @media(max-width:768px){
          .main-grid{grid-template-columns:1fr!important}
          .sidebar{order:-1!important}
          .sidebar-leaderboard{display:none!important}
        }
      `}</style>

      {/* NAV */}
      <nav style={{
        position:'sticky',top:0,zIndex:100,height:64,
        display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 24px',
        background:scrolled?'rgba(10,10,10,.88)':'#0A0A0A',
        backdropFilter:scrolled?'blur(20px) saturate(1.2)':'none',
        borderBottom:'1px solid rgba(255,255,255,.06)',
        transition:'background .3s',
      }}>
        <a href="/" style={{display:'flex',alignItems:'center',textDecoration:'none'}}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-main.png" alt="Battle Trade" style={{height:36,width:'auto'}} onError={e=>{(e.target as HTMLImageElement).style.display='none'}} />
        </a>
        <div style={{display:'flex',alignItems:'center',gap:20}}>
          <a href="/dashboard" className="nav-link" style={{fontFamily:S,fontSize:14,fontWeight:500,color:'#555',textDecoration:'none'}}>Home</a>
          <a href="/markets" className="nav-link" style={{fontFamily:S,fontSize:14,fontWeight:500,color:'#555',textDecoration:'none'}}>Battles</a>
          <span style={{fontFamily:S,fontSize:14,fontWeight:600,color:'#FFF'}}>Lab</span>
          <a href="/profile" className="nav-link" style={{fontFamily:S,fontSize:14,fontWeight:500,color:'#555',textDecoration:'none'}}>Profile</a>
        </div>
        <button onClick={goWrite} style={{
          fontFamily:S,fontSize:14,fontWeight:600,color:'#0A0A0A',background:'#F5A0D0',
          border:'none',padding:'10px 24px',cursor:'pointer',borderRadius:'8px',minHeight:40,
        }}>
          Write
        </button>
      </nav>

      <main style={{maxWidth:1000,margin:'0 auto',padding:'32px 24px 80px'}}>

        {/* HEADER */}
        <div style={{marginBottom:28}}>
          <h1 style={{fontFamily:S,fontSize:32,fontWeight:800,color:'#FFF',letterSpacing:'-.02em',lineHeight:1}}>
            The Lab
          </h1>
          <p style={{fontFamily:S,fontSize:14,color:'#555',marginTop:8}}>
            Community strategies, alpha, and trading playbooks. Earn credits when your posts get upvoted.
          </p>
        </div>

        {/* REWARDS TOGGLE */}
        <button onClick={() => setShowRewards(!showRewards)} style={{
          fontFamily:S,fontSize:13,fontWeight:500,color:'#F5A0D0',background:'rgba(245,160,208,.06)',
          border:'1px solid rgba(245,160,208,.1)',padding:'8px 16px',cursor:'pointer',
          borderRadius:'8px',marginBottom:showRewards ? 16 : 24,
          display:'flex',alignItems:'center',gap:8,
        }}>
          Creator Rewards
          <span style={{fontSize:12,transform:showRewards?'rotate(180deg)':'none',transition:'transform .2s',display:'inline-block'}}>&#9662;</span>
        </button>

        {showRewards && (
          <div style={{padding:'20px 24px',background:'rgba(245,160,208,.03)',border:'1px solid rgba(245,160,208,.08)',borderRadius:12,marginBottom:24}}>
            <p style={{fontFamily:S,fontSize:13,color:'#888',marginBottom:16,lineHeight:1.6}}>
              5 credits per upvote. Hit milestones for bonus payouts. Top posts get featured on the dashboard.
            </p>
            <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
              {REWARD_TIERS.map(r => (
                <div key={r.upvotes}>
                  <div style={{fontFamily:S,fontSize:18,fontWeight:700,color:'#FFF'}}>{r.reward} CR</div>
                  <div style={{fontFamily:S,fontSize:11,color:'#555',marginTop:2}}>{r.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SORT TABS */}
        <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:20}}>
          {(['hot', 'new', 'top'] as SortMode[]).map(s => (
            <button key={s} className="sort-btn" onClick={() => setSort(s)} style={{
              color: sort === s ? '#FFF' : '#555',
              background: sort === s ? 'rgba(255,255,255,.08)' : 'none',
            }}>
              {s === 'hot' ? 'Trending' : s === 'new' ? 'Recent' : 'Top'}
            </button>
          ))}
          <div style={{flex:1}} />
          {activeTag && (
            <button onClick={() => setActiveTag(null)} className="tag-pill" style={{
              color:'#F5A0D0',background:'rgba(245,160,208,.08)',border:'1px solid rgba(245,160,208,.15)',
            }}>
              {activeTag} ×
            </button>
          )}
        </div>

        {/* MAIN GRID */}
        <div className="main-grid" style={{display:'grid',gridTemplateColumns:'1fr 260px',gap:32}}>

          {/* FEED */}
          <div>
            {!loaded ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{padding:'20px 0',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                  <div style={{width: 180 + i * 40,height:14,background:'rgba(255,255,255,.03)',borderRadius:6,marginBottom:10}} />
                  <div style={{width:'65%',height:10,background:'rgba(255,255,255,.02)',borderRadius:4}} />
                </div>
              ))
            ) : strategies.length > 0 ? (
              strategies.map(s => {
                const expanded = expandedId === s.id
                return (
                  <div key={s.id} className="strat-row" style={{padding:'18px 0',borderBottom:'1px solid rgba(255,255,255,.04)',display:'flex',gap:16}}>
                    {/* Vote */}
                    <div style={{width:40,flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center',gap:2,paddingTop:2}}>
                      <button onClick={() => handleVote(s.id)} className="vote-btn" style={{
                        width:36,height:30,display:'flex',alignItems:'center',justifyContent:'center',
                        background:s.voted?'rgba(245,160,208,.1)':'none',
                        border:s.voted?'1px solid rgba(245,160,208,.2)':'1px solid rgba(255,255,255,.06)',
                        borderRadius:'8px',cursor:'pointer',
                        color:s.voted?'#F5A0D0':'#444',fontFamily:M,fontSize:12,
                      }}>&#9650;</button>
                      <span style={{fontFamily:M,fontSize:12,color:s.voted?'#F5A0D0':'#666'}}>{s.upvotes}</span>
                    </div>

                    {/* Content */}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                        <span onClick={() => setExpandedId(expanded ? null : s.id)} style={{
                          fontFamily:S,fontSize:16,fontWeight:700,color:'#EEE',cursor:'pointer',lineHeight:1.3,
                        }}>
                          {s.title}
                        </span>
                        {s.win_rate > 0 && (
                          <span style={{fontFamily:M,fontSize:10,color:'#00DC82',background:'rgba(0,220,130,.08)',padding:'2px 6px',borderRadius:4}}>
                            {(s.win_rate * 100).toFixed(0)}% win
                          </span>
                        )}
                      </div>

                      <p style={{
                        fontFamily:S,fontSize:13,color:'#666',lineHeight:1.6,marginBottom:10,
                        ...(!expanded && { overflow:'hidden',textOverflow:'ellipsis',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' as const }),
                      }}>
                        {s.body}
                      </p>

                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                        {s.author_name && (
                          <>
                            <div style={{width:5,height:5,borderRadius:'50%',background:tc(s.author_rank_tier)}} />
                            <span style={{fontFamily:S,fontSize:12,fontWeight:500,color:'#888'}}>{s.author_name}</span>
                          </>
                        )}
                        <span style={{fontFamily:S,fontSize:12,color:'#333'}}>{timeAgo(s.created_at)}</span>
                        {s.usage_count > 0 && <span style={{fontFamily:S,fontSize:12,color:'#333'}}>{s.usage_count} used</span>}
                        {s.tags?.map(tag => (
                          <button key={tag} onClick={() => setActiveTag(tag)} className="tag-pill" style={{
                            fontSize:11,padding:'2px 8px',color:'#555',background:'none',border:'1px solid rgba(255,255,255,.06)',
                          }}>
                            {tag}
                          </button>
                        ))}
                      </div>

                      {expanded && (
                        <div style={{marginTop:14,paddingTop:14,borderTop:'1px solid rgba(255,255,255,.04)'}}>
                          <span style={{fontFamily:S,fontSize:13,fontWeight:500,color:'#F5A0D0'}}>
                            {s.upvotes * 5} CR earned from {s.upvotes} upvotes
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            ) : (
              <div style={{padding:'80px 0',textAlign:'center'}}>
                <div style={{fontFamily:S,fontSize:20,fontWeight:700,color:'#333',marginBottom:8}}>No posts yet</div>
                <div style={{fontFamily:S,fontSize:14,color:'#222',marginBottom:24}}>Be the first to share alpha</div>
                <button onClick={goWrite} style={{
                  fontFamily:S,fontSize:15,fontWeight:600,color:'#0A0A0A',background:'#F5A0D0',
                  border:'none',padding:'12px 32px',cursor:'pointer',borderRadius:8,
                }}>
                  Write First Post
                </button>
              </div>
            )}
          </div>

          {/* SIDEBAR */}
          <div className="sidebar" style={{display:'flex',flexDirection:'column',gap:24}}>

            {/* Write prompt */}
            <div className="card" style={{padding:'20px'}}>
              <div style={{fontFamily:S,fontSize:15,fontWeight:700,color:'#FFF',marginBottom:4}}>Share your alpha</div>
              <div style={{fontFamily:S,fontSize:12,color:'#555',marginBottom:14,lineHeight:1.5}}>Post strategies. Earn 5 CR per upvote.</div>
              <button onClick={goWrite} style={{
                width:'100%',fontFamily:S,fontSize:14,fontWeight:600,color:'#0A0A0A',background:'#F5A0D0',
                border:'none',padding:'10px',cursor:'pointer',borderRadius:8,
              }}>
                Write
              </button>
            </div>

            {/* Tags */}
            <div>
              <div style={{fontFamily:S,fontSize:12,fontWeight:600,color:'#555',marginBottom:10}}>Filter by tag</div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {ALL_TAGS.map(tag => (
                  <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)} className="tag-pill" style={{
                    color: activeTag === tag ? '#0A0A0A' : '#666',
                    background: activeTag === tag ? '#F5A0D0' : 'none',
                    border: activeTag === tag ? 'none' : '1px solid rgba(255,255,255,.06)',
                  }}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Top creators */}
            <div className="sidebar-leaderboard">
              <div style={{fontFamily:S,fontSize:12,fontWeight:600,color:'#555',marginBottom:10}}>Top creators</div>
              {loaded && strategies.length > 0 ? (() => {
                const authorMap = new Map<string, { name: string; tier: string; totalUpvotes: number }>()
                strategies.forEach(s => {
                  if (!s.author_name) return
                  const existing = authorMap.get(s.author_name)
                  if (existing) existing.totalUpvotes += s.upvotes
                  else authorMap.set(s.author_name, { name: s.author_name, tier: s.author_rank_tier ?? '', totalUpvotes: s.upvotes })
                })
                return Array.from(authorMap.values())
                  .sort((a, b) => b.totalUpvotes - a.totalUpvotes)
                  .slice(0, 5)
                  .map((a, i) => (
                    <div key={a.name} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,.03)'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontFamily:M,fontSize:12,color:i === 0 ? '#F5A0D0' : '#333',width:16}}>{i + 1}</span>
                        <div style={{width:5,height:5,borderRadius:'50%',background:tc(a.tier)}} />
                        <span style={{fontFamily:S,fontSize:13,color:'#999'}}>{a.name}</span>
                      </div>
                      <span style={{fontFamily:M,fontSize:11,color:'#F5A0D0'}}>{a.totalUpvotes * 5} cr</span>
                    </div>
                  ))
              })() : (
                <div style={{fontFamily:S,fontSize:12,color:'#222'}}>No creators yet</div>
              )}
            </div>

            {/* Links */}
            <div>
              <div style={{fontFamily:S,fontSize:12,fontWeight:600,color:'#555',marginBottom:10}}>Resources</div>
              {[
                { label: 'Trading Academy', href: '/learn' },
                { label: 'Weapon Guide', href: '/learn' },
                { label: 'Challenges', href: '/learn' },
              ].map(l => (
                <a key={l.label} href={l.href} className="nav-link" style={{
                  display:'block',fontFamily:S,fontSize:13,color:'#555',textDecoration:'none',
                  padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,.03)',
                }}>
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* WRITE MODAL */}
      {showWrite && (
        <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={() => setShowWrite(false)}>
          <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.7)',backdropFilter:'blur(12px)'}} />
          <div onClick={e => e.stopPropagation()} style={{
            position:'relative',width:'100%',maxWidth:520,
            background:'#111',border:'1px solid rgba(255,255,255,.08)',borderRadius:16,
            padding:'28px',maxHeight:'85vh',overflowY:'auto',
          }}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
              <span style={{fontFamily:S,fontSize:20,fontWeight:700,color:'#FFF'}}>New Post</span>
              <button onClick={() => setShowWrite(false)} style={{fontFamily:S,fontSize:18,color:'#555',background:'none',border:'none',cursor:'pointer',padding:4}}>&#10005;</button>
            </div>

            <div style={{fontFamily:S,fontSize:12,fontWeight:600,color:'#555',marginBottom:6}}>Title</div>
            <input type="text" value={writeTitle} onChange={e => setWriteTitle(e.target.value)} placeholder="Your strategy"
              style={{width:'100%',height:44,background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',borderRadius:8,color:'#FFF',fontFamily:S,fontSize:15,padding:'0 14px',outline:'none',marginBottom:20}} />

            <div style={{fontFamily:S,fontSize:12,fontWeight:600,color:'#555',marginBottom:6}}>Body</div>
            <textarea ref={bodyRef} value={writeBody} onChange={e => setWriteBody(e.target.value)} placeholder="Explain your strategy..."
              style={{width:'100%',minHeight:180,background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',borderRadius:8,color:'#FFF',fontFamily:S,fontSize:14,padding:'14px',outline:'none',resize:'vertical',lineHeight:1.6,marginBottom:20}} />

            <div style={{fontFamily:S,fontSize:12,fontWeight:600,color:'#555',marginBottom:8}}>Tags (up to 5)</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:24}}>
              {ALL_TAGS.map(tag => (
                <button key={tag} onClick={() => toggleTag(tag)} className="tag-pill" style={{
                  color: writeTags.includes(tag) ? '#0A0A0A' : '#666',
                  background: writeTags.includes(tag) ? '#F5A0D0' : 'none',
                  border: writeTags.includes(tag) ? 'none' : '1px solid rgba(255,255,255,.08)',
                }}>
                  {tag}
                </button>
              ))}
            </div>

            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontFamily:S,fontSize:12,color:'#333'}}>{writeBody.length}/2000</span>
              <button onClick={handleSubmit} disabled={submitting || !writeTitle.trim() || !writeBody.trim()} style={{
                fontFamily:S,fontSize:15,fontWeight:600,padding:'12px 32px',cursor:submitting?'not-allowed':'pointer',
                color:'#0A0A0A',background:(!writeTitle.trim()||!writeBody.trim())?'#333':'#F5A0D0',
                border:'none',borderRadius:8,
              }}>
                {submitting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
