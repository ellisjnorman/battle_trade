'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { font, c, radius, navStyle, logoStyle, navLinkStyle, btnPrimary, btnSecondary, card, globalCSS } from '@/app/design'

type Filter = 'all' | 'live' | 'upcoming' | 'free' | 'paid'

interface LobbyItem {
  id: string; name: string; format: string; status: 'waiting' | 'active'
  invite_code: string | null; config: Record<string, unknown>
  player_count: number; spectator_count: number
  current_round?: { number: number; status: string; time_remaining?: number }
  top_trader?: { name: string; return_pct: number }
}

export default function MarketsPage() {
  const router = useRouter()
  const [lobbies, setLobbies] = useState<LobbyItem[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/lobbies/active')
        if (r.ok) { const d = await r.json(); setLobbies(d.lobbies ?? []) }
      } catch {}
      setLoading(false)
    }
    load()
    const i = setInterval(load, 5000)
    return () => clearInterval(i)
  }, [])

  const filtered = lobbies.filter(l => {
    if (filter === 'live') return l.status === 'active'
    if (filter === 'upcoming') return l.status === 'waiting'
    if (filter === 'free') return !((l.config?.entry_fee as number) > 0)
    if (filter === 'paid') return (l.config?.entry_fee as number) > 0
    return true
  })

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'live', label: 'Live' },
    { id: 'upcoming', label: 'Starting Soon' },
    { id: 'free', label: 'Free' },
    { id: 'paid', label: 'Paid' },
  ]

  return (
    <div style={{minHeight:'100vh',background:c.bg}}>
      <style>{globalCSS}{`
        .lobby-card{transition:border-color .15s,transform .15s;-webkit-tap-highlight-color:transparent}
        .lobby-card:hover{border-color:rgba(245,160,208,.2)!important;transform:translateY(-2px)}
        @media(max-width:600px){
          .lobby-grid{grid-template-columns:1fr!important}
        }
      `}</style>

      {/* Nav */}
      <nav style={navStyle(scrolled)}>
        <a href="/" style={{display:'flex',alignItems:'center',textDecoration:'none'}}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-main.png" alt="Battle Trade" style={logoStyle} onError={e=>{(e.target as HTMLImageElement).style.display='none'}} />
        </a>
        <div style={{display:'flex',alignItems:'center',gap:20}}>
          <a href="/dashboard" className="nav-a" style={navLinkStyle(false)}>Home</a>
          <span style={navLinkStyle(true)}>Battles</span>
          <a href="/lab" className="nav-a" style={navLinkStyle(false)}>Lab</a>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>router.push('/profile')} className="btn-s" style={{...btnSecondary,fontSize:13,padding:'8px 16px'}}>Profile</button>
          <button onClick={()=>router.push('/create')} className="btn-p" style={{...btnPrimary,fontSize:13,padding:'8px 20px'}}>Create</button>
        </div>
      </nav>

      <main style={{maxWidth:1000,margin:'0 auto',padding:'32px 24px'}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
          <h1 style={{fontFamily:font.sans,fontSize:28,fontWeight:800,color:c.text,letterSpacing:'-.02em'}}>Battles</h1>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div className="live-dot" style={{width:6,height:6}} />
            <span style={{fontFamily:font.mono,fontSize:12,color:c.green}}>{lobbies.filter(l=>l.status==='active').length} live</span>
          </div>
        </div>

        {/* Filter pills */}
        <div style={{display:'flex',gap:6,marginBottom:24,flexWrap:'wrap'}}>
          {filters.map(f => (
            <button key={f.id} className="pill" onClick={()=>setFilter(f.id)} style={{
              color: filter===f.id ? c.bg : c.text3,
              background: filter===f.id ? c.pink : 'none',
              border: filter===f.id ? 'none' : `1px solid ${c.border}`,
            }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Lobbies */}
        {loading ? (
          <div style={{textAlign:'center',padding:80}}>
            <span style={{fontFamily:font.sans,fontSize:15,color:c.text3}}>Loading battles...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{...card,padding:'64px 24px',textAlign:'center'}}>
            <div style={{fontFamily:font.sans,fontSize:20,fontWeight:700,color:c.text4,marginBottom:8}}>No battles found</div>
            <div style={{fontFamily:font.sans,fontSize:14,color:c.textMuted,marginBottom:24}}>Be the first — create a lobby and invite friends.</div>
            <button onClick={()=>router.push('/create')} className="btn-p" style={{...btnPrimary,fontSize:15,padding:'12px 32px'}}>Create Battle</button>
          </div>
        ) : (
          <div className="lobby-grid" style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))',gap:14}}>
            {filtered.map(l => {
              const fee = (l.config?.entry_fee as number) ?? 0
              const isLive = l.status === 'active'
              return (
                <div key={l.id} className="lobby-card" onClick={()=>router.push(`/lobby/${l.id}`)}
                  style={{...card,padding:20,cursor:'pointer'}}>
                  {/* Header */}
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                    <span style={{fontFamily:font.sans,fontSize:17,fontWeight:700,color:c.text}}>{l.name}</span>
                    <span style={{
                      fontFamily:font.sans,fontSize:11,fontWeight:500,
                      color:isLive?c.green:c.pink,
                      background:isLive?c.greenDim:c.pinkDim,
                      padding:'3px 10px',borderRadius:radius.pill,
                    }}>{isLive?'Live':'Open'}</span>
                  </div>

                  {/* Meta */}
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                    <span style={{fontFamily:font.mono,fontSize:10,color:c.pink,background:c.pinkDim,padding:'2px 6px',borderRadius:4}}>{l.format.toUpperCase()}</span>
                    <span style={{fontFamily:font.sans,fontSize:12,color:c.text3}}>{l.player_count} players</span>
                    {l.spectator_count > 0 && <span style={{fontFamily:font.sans,fontSize:12,color:c.text4}}>{l.spectator_count} watching</span>}
                  </div>

                  {/* Leader */}
                  {l.top_trader && (
                    <div style={{fontFamily:font.mono,fontSize:13,color:l.top_trader.return_pct>=0?c.green:c.red,marginBottom:8}}>
                      #1 {l.top_trader.name} {l.top_trader.return_pct>=0?'+':''}{l.top_trader.return_pct.toFixed(1)}%
                    </div>
                  )}

                  {/* Round */}
                  {l.current_round && (
                    <div style={{fontFamily:font.mono,fontSize:11,color:c.text4,marginBottom:12}}>
                      R{l.current_round.number} · {l.current_round.status}
                    </div>
                  )}

                  {/* Footer */}
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:12,paddingTop:12,borderTop:`1px solid ${c.border}`}}>
                    <span style={{fontFamily:font.mono,fontSize:12,color:fee>0?c.pink:c.green}}>
                      {fee > 0 ? `$${fee} buy-in` : 'Free'}
                    </span>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={e=>{e.stopPropagation();router.push(`/lobby/${l.id}/spectate`)}} className="btn-s"
                        style={{...btnSecondary,fontSize:11,padding:'6px 14px'}}>Watch</button>
                      <button onClick={e=>{e.stopPropagation();router.push(`/lobby/${l.id}`)}} className="btn-p"
                        style={{...btnPrimary,fontSize:11,padding:'6px 14px'}}>Join</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
