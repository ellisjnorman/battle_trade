'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { getOrCreateProfile } from '@/lib/auth'

const B = "var(--font-bebas, 'Bebas Neue'), sans-serif"
const M = "var(--font-jetbrains, 'JetBrains Mono'), monospace"
const S = "var(--font-dm-sans, 'DM Sans'), sans-serif"

interface LiveBattle {
  id: string; name: string; status: 'waiting' | 'active'
  player_count: number; spectator_count: number
  top_trader?: { name: string; return_pct: number }
}

const HERO_WORDS = ['YOUR ROOMMATE', 'SOME DEGEN', 'YOUR GIRLFRIEND', 'CRYPTO TWITTER', 'YOUR COWORKER', 'THAT GUY ON X', 'EVERYONE']

const BATTLE_PLAYERS = [
  { name: 'wolfpack', rank: 847, tier: 'WHALE', tierCol: '#00DC82', grad: 'linear-gradient(135deg,#006B3F,#00DC82)' },
  { name: 'vega', rank: 612, tier: 'MARKET MAKER', tierCol: '#F5A0D0', grad: 'linear-gradient(135deg,#8B3A62,#F5A0D0)' },
  { name: 'iron_hands', rank: 489, tier: 'SWING', tierCol: '#C0C0C0', grad: 'linear-gradient(135deg,#808080,#C0C0C0)' },
  { name: 'degen_prime', rank: 203, tier: 'RETAIL', tierCol: '#CD7F32', grad: 'linear-gradient(135deg,#8B4513,#CD7F32)' },
]

const BATTLE_EVENTS = [
  { text: 'wolfpack survived EXCHANGE OUTAGE — rank +12', col: '#00DC82', icon: '📈' },
  { text: 'vega hedged MARGIN CALL — risk score rising', col: '#7B93DB', icon: '🛡' },
  { text: 'iron_hands 10x LONG BTC — high conviction', col: '#00DC82', icon: '⚡' },
  { text: 'degen_prime LIQUIDATED — rank frozen', col: '#FF4466', icon: '💀' },
  { text: 'wolfpack hit 20 battles — COPY TRADING unlocked', col: '#FFD700', icon: '🔓' },
  { text: 'FLASH CRASH event — testing risk management', col: '#F5A0D0', icon: '📰' },
  { text: 'vega consistency score +8 — diversified trades', col: '#7B93DB', icon: '📊' },
  { text: 'iron_hands streak broken — adaptability test', col: '#FF4466', icon: '⚡' },
]

const RANK_PILLARS = [
  { name: 'PERFORMANCE', weight: '35%', desc: 'Win rate and average return across battles', col: '#00DC82' },
  { name: 'RISK MGMT', weight: '25%', desc: 'Max drawdown control, loss prevention under stress', col: '#F5A0D0' },
  { name: 'CONSISTENCY', weight: '20%', desc: 'Asset diversity, leverage discipline, order sophistication', col: '#7B93DB' },
  { name: 'ADAPTABILITY', weight: '10%', desc: 'Recovery from losses, streak maintenance', col: '#FFD700' },
  { name: 'COMMUNITY', weight: '10%', desc: 'Strategy contributions, followers, engagement', col: '#FF4466' },
]

const MARKET_EVENTS = [
  { name: 'EXCHANGE OUTAGE', desc: 'Trades frozen — test your patience', type: 'STRESS' },
  { name: 'FLASH CRASH', desc: 'Sudden drop — test your risk mgmt', type: 'STRESS' },
  { name: 'MARGIN CALL', desc: '10% balance hit — test your reserves', type: 'STRESS' },
  { name: 'REGULATORY HALT', desc: 'Asset frozen — test your diversification', type: 'STRESS' },
  { name: 'BREAKING NEWS', desc: 'Market shakes — test your conviction', type: 'STRESS' },
  { name: 'HEDGE', desc: 'Insurance blocks next event', type: 'DEFENSE' },
]

function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect() } }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, v }
}

function Reveal({ children, delay = 0, style, className }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties; className?: string }) {
  const { ref, v } = useReveal()
  return (
    <div ref={ref} className={className} style={{
      ...style, opacity: v ? 1 : 0, transform: v ? 'none' : 'translateY(24px)',
      transition: `opacity .7s cubic-bezier(.22,1,.36,1) ${delay}s, transform .7s cubic-bezier(.22,1,.36,1) ${delay}s`,
    }}>{children}</div>
  )
}

export default function LandingPage() {
  const router = useRouter()
  const { login, authenticated, user, ready, getAccessToken } = usePrivy()
  const [battles, setBattles] = useState<LiveBattle[]>([])
  const [loaded, setLoaded] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [wordIdx, setWordIdx] = useState(0)
  const [scrollY, setScrollY] = useState(0)
  const [battlePnls, setBattlePnls] = useState([0, 0, 0, 0])
  const [battleEvents, setBattleEvents] = useState<typeof BATTLE_EVENTS>([])
  const [battleTimer, setBattleTimer] = useState(127)
  const battleEvtRef = useRef(0)

  useEffect(() => {
    if (!ready) return
    if (authenticated && user) {
      getOrCreateProfile(user, getAccessToken).then(profile => {
        if (profile) localStorage.setItem('bt_profile_id', profile.id)
        router.replace('/dashboard')
      }).catch(err => {
        console.error('[auth] getOrCreateProfile failed:', err)
        router.replace('/dashboard')
      })
    }
  }, [ready, authenticated, user, router])

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const i = setInterval(() => setWordIdx(p => (p + 1) % HERO_WORDS.length), 2400)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    const i = setInterval(() => {
      setBattlePnls(prev => prev.map(p => {
        const delta = (Math.random() - 0.45) * 8
        return Math.max(-50, Math.min(80, +(p + delta).toFixed(1)))
      }))
    }, 1200)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    const i = setInterval(() => {
      battleEvtRef.current = (battleEvtRef.current + 1) % BATTLE_EVENTS.length
      setBattleEvents(prev => [BATTLE_EVENTS[battleEvtRef.current], ...prev].slice(0, 4))
    }, 2500)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    const i = setInterval(() => {
      setBattleTimer(prev => prev <= 0 ? 180 : prev - 1)
    }, 1000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    fetch('/api/lobbies/active').then(r => r.ok ? r.json() : { lobbies: [] })
      .then(d => { setBattles(d.lobbies ?? []); setLoaded(true) }).catch(() => setLoaded(true))
  }, [])

  useEffect(() => {
    const h = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])

  const total = battles.reduce((a, b) => a + b.player_count, 0)
  const sorted = [...BATTLE_PLAYERS].map((p, i) => ({ ...p, pnl: battlePnls[i] })).sort((a, b) => b.pnl - a.pnl)
  const timerMin = Math.floor(battleTimer / 60)
  const timerSec = battleTimer % 60

  return (
    <div style={{background:'#0A0A0A',color:'#FFF',overflowX:'hidden'}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        button,input{border-radius:0!important}
        html{scroll-behavior:smooth;-webkit-font-smoothing:antialiased}
        ::selection{background:rgba(245,160,208,.25)}

        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.2}}
        @keyframes wordCycle{0%{opacity:0;transform:translateY(100%) rotateX(-40deg)}12%{opacity:1;transform:none}88%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-100%) rotateX(40deg)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
        @keyframes marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        @keyframes barPulse{0%,100%{opacity:.8}50%{opacity:1}}
        @keyframes eventSlide{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
        @keyframes timerGlow{0%,100%{text-shadow:0 0 8px rgba(255,68,102,.3)}50%{text-shadow:0 0 16px rgba(255,68,102,.5)}}
        @keyframes scanline{0%{top:-2px}100%{top:100%}}
        @keyframes rankPulse{0%,100%{opacity:.6}50%{opacity:1}}
        @keyframes pillarFill{from{width:0}to{width:var(--fill)}}

        .anim-up{opacity:0;animation:slideUp .8s cubic-bezier(.22,1,.36,1) forwards}
        .live-dot{width:6px;height:6px;background:#00DC82;border-radius:50%;animation:pulse 1.6s infinite}

        .btn-primary{
          font-family:${S};font-weight:600;letter-spacing:-.01em;
          color:#0A0A0A;background:#F5A0D0;border:none;cursor:pointer;
          transition:all .15s ease;-webkit-tap-highlight-color:transparent;
          border-radius:8px!important;
        }
        .btn-primary:hover{background:#F7B3DA;transform:translateY(-1px);box-shadow:0 8px 32px rgba(245,160,208,.25)}
        .btn-primary:active{transform:scale(.98);box-shadow:none}

        .btn-secondary{
          font-family:${S};font-weight:500;letter-spacing:-.01em;
          color:#999;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);cursor:pointer;
          transition:all .15s ease;-webkit-tap-highlight-color:transparent;
          border-radius:8px!important;
        }
        .btn-secondary:hover{color:#FFF;background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.12)}
        .btn-secondary:active{transform:scale(.98)}

        .card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px!important;overflow:hidden}
        .card-row{transition:background .12s}
        .card-row:hover{background:rgba(255,255,255,.03)}

        .marquee-track{display:flex;animation:marquee 40s linear infinite;width:max-content}

        @media(min-width:769px){.mob-only{display:none!important}}
        @media(max-width:768px){
          .desk-only{display:none!important}
          .hero-grid{flex-direction:column!important;gap:40px!important;padding-top:100px!important}
          .hero-left{max-width:100%!important}
          .hero-right{max-width:100%!important;min-width:0!important}
          .h1-size{font-size:clamp(44px,14vw,72px)!important}
          .section-pad{padding:64px 20px!important}
          .steps-grid{grid-template-columns:1fr 1fr!important}
          .problem-grid{grid-template-columns:1fr 1fr!important}
          .pillar-grid{grid-template-columns:1fr!important}
          .copy-layout{flex-direction:column!important}
          .spec-layout{flex-direction:column!important}
          .cta-stack{flex-direction:column!important;width:100%!important}
          .cta-stack>button,.cta-stack>a{width:100%!important}
          .footer-row{flex-direction:column!important;text-align:center!important;gap:16px!important}
        }
        @media(max-width:480px){
          .h1-size{font-size:clamp(36px,13vw,56px)!important}
          .steps-grid{grid-template-columns:1fr!important}
          .problem-grid{grid-template-columns:1fr!important}
        }
      `}</style>

      {/* NAV */}
      <nav style={{
        position:'fixed',top:0,left:0,right:0,height:64,zIndex:100,
        display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 24px',
        background:scrollY>30?'rgba(10,10,10,.85)':'transparent',
        backdropFilter:scrollY>30?'blur(24px) saturate(1.2)':'none',
        borderBottom:scrollY>30?'1px solid rgba(255,255,255,.06)':'1px solid transparent',
        transition:'all .3s ease',
      }}>
        <Link href="/" style={{display:'flex',alignItems:'center',textDecoration:'none'}}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-main.png" alt="Battle Trade" style={{height:40,width:'auto'}} onError={e=>{(e.target as HTMLImageElement).style.display='none'}} />
        </Link>
        <div style={{display:'flex',alignItems:'center',gap:20}}>
          {total > 0 && (
            <div className="desk-only" style={{display:'flex',alignItems:'center',gap:6}}>
              <div className="live-dot" style={{width:5,height:5}} />
              <span style={{fontFamily:M,fontSize:11,color:'#00DC82'}}>{total} live</span>
            </div>
          )}
          <Link href="/markets" className="desk-only" style={{fontFamily:S,fontSize:14,fontWeight:500,color:'#666',textDecoration:'none',transition:'color .15s'}}>Battles</Link>
          <Link href="/learn" className="desk-only" style={{fontFamily:S,fontSize:14,fontWeight:500,color:'#666',textDecoration:'none',transition:'color .15s'}}>Learn</Link>
          <button onClick={login} className="btn-primary" style={{fontSize:14,padding:'10px 24px'}}>
            Sign In
          </button>
        </div>
      </nav>

      {/* ================================================================== */}
      {/* HERO — Identity-first                                              */}
      {/* ================================================================== */}
      <section style={{minHeight:'100dvh',display:'flex',flexDirection:'column',justifyContent:'center',position:'relative'}}>
        <div style={{position:'absolute',top:'20%',left:'50%',transform:'translateX(-50%)',width:'80vw',height:'50vh',background:'radial-gradient(ellipse at center,rgba(245,160,208,.04) 0%,transparent 70%)',pointerEvents:'none'}} />

        <div className="hero-grid" style={{maxWidth:1200,width:'100%',margin:'0 auto',padding:'100px 32px 60px',display:'flex',alignItems:'center',gap:80}}>
          <div className="hero-left" style={{flex:1,maxWidth:560}}>
            <div className="anim-up" style={{animationDelay:'.1s',marginBottom:20}}>
              <span style={{fontFamily:M,fontSize:12,color:'#F5A0D0',letterSpacing:'.08em',fontWeight:500}}>LEARN TO TRADE · COMPETE TO PROVE IT</span>
            </div>

            <h1 className="anim-up h1-size" style={{
              animationDelay:'.2s',fontFamily:B,
              fontSize:'clamp(48px,6.5vw,96px)',lineHeight:.95,letterSpacing:'-.02em',
              marginBottom:28,
            }}>
              <span style={{display:'block'}}>PROVE YOU</span>
              <span style={{display:'block'}}>TRADE BETTER</span>
              <span style={{display:'block'}}>THAN</span>
              <span style={{display:'block',position:'relative',overflow:'hidden',height:'1.15em',color:'#F5A0D0'}}>
                {mounted && <span key={wordIdx} style={{display:'block',position:'absolute',left:0,right:0,animation:'wordCycle 2.4s cubic-bezier(.22,1,.36,1) both'}}>{HERO_WORDS[wordIdx]}</span>}
              </span>
            </h1>

            <p className="anim-up" style={{animationDelay:'.4s',fontFamily:S,fontSize:17,color:'#666',lineHeight:1.7,marginBottom:36,maxWidth:440}}>
              Learn to trade by actually trading — risk-free. Compete in live battles with real market data, build real skills through play, and earn a verified rank that proves what you know.
            </p>

            <div className="anim-up cta-stack" style={{animationDelay:'.55s',display:'flex',gap:12,marginBottom:48}}>
              <button onClick={login} className="btn-primary" style={{fontSize:17,padding:'16px 44px'}}>
                Build Your Rank
              </button>
              <Link href="#how-it-works" className="btn-secondary" style={{fontSize:15,padding:'16px 32px',textDecoration:'none',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                How It Works
              </Link>
            </div>

            <div className="anim-up" style={{animationDelay:'.7s',display:'flex',gap:36,flexWrap:'wrap'}}>
              {[
                { v: '$0', l: 'risk to start' },
                { v: '60+', l: 'real assets' },
                { v: 'Top 20', l: 'earn income' },
              ].map(s => (
                <div key={s.l}>
                  <span style={{fontFamily:S,fontSize:20,fontWeight:700,color:'#FFF'}}>{s.v}</span>
                  <span style={{fontFamily:S,fontSize:13,color:'#444',marginLeft:6}}>{s.l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Live Rank Builder — animated widget */}
          <div className="anim-up hero-right" style={{animationDelay:'.4s',flex:0,minWidth:340,maxWidth:420}}>
            <div className="card" style={{overflow:'hidden',position:'relative'}}>
              <div style={{position:'absolute',left:0,right:0,height:1,background:'linear-gradient(90deg,transparent,rgba(245,160,208,.06),transparent)',animation:'scanline 4s linear infinite',pointerEvents:'none',zIndex:1}} />

              {/* Header */}
              <div style={{padding:'12px 20px',borderBottom:'1px solid rgba(255,255,255,.05)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div className="live-dot" style={{width:5,height:5}} />
                  <span style={{fontFamily:M,fontSize:10,fontWeight:600,color:'#888',letterSpacing:'.06em'}}>LIVE BATTLE · RANKS UPDATING</span>
                </div>
                <span style={{fontFamily:M,fontSize:14,fontWeight:700,color:battleTimer < 30 ? '#FF4466' : '#FFF',animation:battleTimer < 30 ? 'timerGlow 1s ease infinite' : 'none',letterSpacing:'.04em'}}>{timerMin}:{timerSec.toString().padStart(2, '0')}</span>
              </div>

              {/* Leaderboard with ranks */}
              <div style={{padding:'14px 20px 10px'}}>
                {sorted.map((p, i) => {
                  const barW = Math.max(5, Math.min(95, 50 + p.pnl))
                  const isPositive = p.pnl >= 0
                  return (
                    <div key={p.name} style={{marginBottom:i < 3 ? 10 : 0}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <div style={{width:20,height:20,borderRadius:6,background:p.grad,border:`1.5px solid ${p.tierCol}50`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:M,fontSize:9,fontWeight:700,color:'#FFF',textShadow:'0 1px 2px rgba(0,0,0,.4)'}}>{p.name[0].toUpperCase()}</div>
                          <span style={{fontFamily:S,fontSize:12,fontWeight:i===0?700:500,color:i===0?'#FFF':'#999'}}>{p.name}</span>
                          <span style={{fontFamily:M,fontSize:9,color:p.tierCol,opacity:.7}}>{p.rank}</span>
                        </div>
                        <span style={{fontFamily:M,fontSize:13,fontWeight:700,color:isPositive?'#00DC82':'#FF4466',transition:'all .3s'}}>
                          {isPositive?'+':''}{p.pnl.toFixed(1)}%
                        </span>
                      </div>
                      <div style={{height:3,background:'rgba(255,255,255,.04)',borderRadius:99,overflow:'hidden'}}>
                        <div style={{height:'100%',borderRadius:99,background:isPositive?'linear-gradient(90deg,rgba(0,220,130,.3),rgba(0,220,130,.6))':'linear-gradient(90deg,rgba(255,68,102,.3),rgba(255,68,102,.6))',width:`${barW}%`,transition:'width .8s cubic-bezier(.4,0,.2,1)',animation:'barPulse 2s ease infinite'}} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Rank event feed */}
              <div style={{borderTop:'1px solid rgba(255,255,255,.04)',padding:'8px 0',maxHeight:120,overflow:'hidden'}}>
                {battleEvents.length > 0 ? battleEvents.map((e, i) => (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 20px',animation:'eventSlide .3s ease both'}}>
                    <span style={{fontSize:11,flexShrink:0}}>{e.icon}</span>
                    <span style={{fontFamily:M,fontSize:10,color:e.col,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{e.text}</span>
                  </div>
                )) : (
                  <div style={{padding:'8px 20px'}}>
                    <span style={{fontFamily:M,fontSize:10,color:'#222'}}>Waiting for trades...</span>
                  </div>
                )}
              </div>

              <div style={{padding:'8px 20px',borderTop:'1px solid rgba(255,255,255,.04)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontFamily:M,fontSize:9,color:'#444'}}>Learn by competing — every trade builds your rank</span>
                <button onClick={login} style={{fontFamily:S,fontSize:11,fontWeight:600,color:'#0A0A0A',background:'#F5A0D0',border:'none',padding:'6px 16px',borderRadius:6,cursor:'pointer',transition:'all .15s'}}>Start Now</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ASSET TICKER */}
      <div style={{borderTop:'1px solid rgba(255,255,255,.04)',borderBottom:'1px solid rgba(255,255,255,.04)',overflow:'hidden',padding:'12px 0',background:'rgba(255,255,255,.01)'}}>
        <div className="marquee-track">
          {[...Array(2)].map((_, rep) => (
            <div key={rep} style={{display:'flex',gap:40,paddingRight:40,alignItems:'center'}}>
              {[
                { s: 'BTC', p: '67,241', ch: '+2.4%', up: true },
                { s: 'ETH', p: '3,412', ch: '+1.1%', up: true },
                { s: 'SOL', p: '148.20', ch: '-0.8%', up: false },
                { s: 'AAPL', p: '189.43', ch: '+0.3%', up: true },
                { s: 'TSLA', p: '248.91', ch: '-1.2%', up: false },
                { s: 'NVDA', p: '721.33', ch: '+3.1%', up: true },
                { s: 'GOLD', p: '2,341', ch: '+0.5%', up: true },
                { s: 'DOGE', p: '0.143', ch: '+5.2%', up: true },
              ].map(t => (
                <div key={`${t.s}-${rep}`} style={{display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>
                  <span style={{fontFamily:S,fontSize:12,fontWeight:600,color:'#555'}}>{t.s}</span>
                  <span style={{fontFamily:M,fontSize:11,color:'#444'}}>${t.p}</span>
                  <span style={{fontFamily:M,fontSize:10,color:t.up?'#00DC82':'#FF4466'}}>{t.ch}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ================================================================== */}
      {/* THE PROBLEM                                                        */}
      {/* ================================================================== */}
      <section className="section-pad" style={{padding:'100px 32px'}}>
        <div style={{maxWidth:1000,margin:'0 auto'}}>
          <Reveal>
            <p style={{fontFamily:S,fontSize:14,fontWeight:500,color:'#FF4466',marginBottom:12}}>The problem</p>
            <h2 style={{fontFamily:B,fontSize:'clamp(32px,5vw,56px)',lineHeight:.92,letterSpacing:'-.01em',marginBottom:56}}>
              YOUR TRADING RECORD IS INVISIBLE
            </h2>
          </Reveal>
          <div className="problem-grid" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:24}}>
            <Reveal delay={.05}>
              <div className="card" style={{padding:'32px 28px',height:'100%'}}>
                <div style={{fontFamily:M,fontSize:48,lineHeight:1,color:'#FF4466',marginBottom:16,opacity:.3}}>01</div>
                <div style={{fontFamily:S,fontSize:20,fontWeight:700,color:'#FFF',marginBottom:12}}>Learning is boring</div>
                <div style={{fontFamily:S,fontSize:14,color:'#555',lineHeight:1.7}}>
                  Trading courses charge thousands and teach theory. Simulators have no stakes. Nobody actually learns to manage risk until they lose real money.
                </div>
              </div>
            </Reveal>
            <Reveal delay={.1}>
              <div className="card" style={{padding:'32px 28px',height:'100%'}}>
                <div style={{fontFamily:M,fontSize:48,lineHeight:1,color:'#FF4466',marginBottom:16,opacity:.3}}>02</div>
                <div style={{fontFamily:S,fontSize:20,fontWeight:700,color:'#FFF',marginBottom:12}}>Identity is trapped</div>
                <div style={{fontFamily:S,fontSize:14,color:'#555',lineHeight:1.7}}>
                  50-100M crypto traders globally. Zero portable proof of skill. Switch exchanges, start from zero. Your reputation belongs to the platform, not you.
                </div>
              </div>
            </Reveal>
            <Reveal delay={.15}>
              <div className="card" style={{padding:'32px 28px',height:'100%'}}>
                <div style={{fontFamily:M,fontSize:48,lineHeight:1,color:'#FF4466',marginBottom:16,opacity:.3}}>03</div>
                <div style={{fontFamily:S,fontSize:20,fontWeight:700,color:'#FFF',marginBottom:12}}>Copy trading is broken</div>
                <div style={{fontFamily:S,fontSize:14,color:'#555',lineHeight:1.7}}>
                  $50B+ in copy trading volume. Anyone can self-select as a &ldquo;lead trader.&rdquo; Fake records, cherry-picked accounts. No verification layer exists.
                </div>
              </div>
            </Reveal>
          </div>
          <Reveal delay={.25}>
            <div style={{marginTop:32,padding:'20px 28px',background:'rgba(245,160,208,.04)',border:'1px solid rgba(245,160,208,.08)',borderRadius:12,textAlign:'center'}}>
              <span style={{fontFamily:S,fontSize:15,color:'#999',lineHeight:1.7}}>
                The best way to learn trading is by doing it — with <span style={{color:'#F5A0D0',fontWeight:700}}>real competition, real market data, and zero financial risk</span>. Your skills become a verified rank that follows you everywhere.
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================================================================== */}
      {/* HOW IT WORKS — Identity pipeline                                   */}
      {/* ================================================================== */}
      <section id="how-it-works" className="section-pad" style={{padding:'100px 32px',background:'rgba(255,255,255,.01)',borderTop:'1px solid rgba(255,255,255,.04)',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
        <div style={{maxWidth:1000,margin:'0 auto'}}>
          <Reveal>
            <p style={{fontFamily:S,fontSize:14,fontWeight:500,color:'#F5A0D0',marginBottom:12}}>How it works</p>
            <h2 style={{fontFamily:B,fontSize:'clamp(32px,5vw,56px)',lineHeight:.92,letterSpacing:'-.01em',marginBottom:56}}>
              FROM ZERO TO VERIFIED
            </h2>
          </Reveal>
          <div className="steps-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:20}}>
            {[
              { n: '01', t: 'Practice Free', d: 'Start with paper money and real market data. Learn longs, shorts, leverage, and risk management — zero cost, zero risk.', c: '#F5A0D0' },
              { n: '02', t: 'Battle Live', d: 'Compete against real traders. Survive flash crashes, exchange outages, and margin calls. Every event teaches you something.', c: '#FF4466' },
              { n: '03', t: 'Build Your Rank', d: 'Your rank reflects real skill — performance, risk management, consistency, adaptability. You can\'t fake it.', c: '#00DC82' },
              { n: '04', t: 'Earn From Skill', d: 'Top 20 unlock copy trading. Followers mirror your trades. You earn 15% of their profits.', c: '#FFD700' },
            ].map((step, i) => (
              <Reveal key={i} delay={i * .08}>
                <div className="card" style={{padding:'28px 24px',height:'100%',position:'relative'}}>
                  <div style={{fontFamily:M,fontSize:11,color:step.c,marginBottom:16,opacity:.6}}>{step.n}</div>
                  <div style={{fontFamily:S,fontSize:20,fontWeight:700,color:'#FFF',marginBottom:8}}>{step.t}</div>
                  <div style={{fontFamily:S,fontSize:13,color:'#555',lineHeight:1.6}}>{step.d}</div>
                  {i < 3 && <div className="desk-only" style={{position:'absolute',right:-14,top:'50%',transform:'translateY(-50%)',fontFamily:M,fontSize:16,color:'#222'}}>→</div>}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* YOUR RANK — The product                                            */}
      {/* ================================================================== */}
      <section className="section-pad" style={{padding:'100px 32px'}}>
        <div style={{maxWidth:1000,margin:'0 auto'}}>
          <Reveal>
            <p style={{fontFamily:S,fontSize:14,fontWeight:500,color:'#00DC82',marginBottom:12}}>Your rank</p>
            <h2 style={{fontFamily:B,fontSize:'clamp(32px,5vw,56px)',lineHeight:.92,letterSpacing:'-.01em',marginBottom:20}}>
              FIVE PILLARS. ONE SCORE.
            </h2>
            <p style={{fontFamily:S,fontSize:15,color:'#555',maxWidth:500,lineHeight:1.7,marginBottom:56}}>
              Each battle teaches you something new. Your rank reflects real skills earned through practice — risk management, market reading, and discipline. You cannot fake it. You earn it.
            </p>
          </Reveal>

          <div className="pillar-grid" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24}}>
            {/* Pillars */}
            <Reveal delay={.05}>
              <div className="card" style={{padding:0}}>
                <div style={{padding:'16px 24px',borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                  <span style={{fontFamily:M,fontSize:10,fontWeight:600,color:'#00DC82',letterSpacing:'.06em'}}>RANK PILLARS</span>
                </div>
                {RANK_PILLARS.map((p, i) => (
                  <div key={p.name} className="card-row" style={{padding:'14px 24px',borderBottom:i<4?'1px solid rgba(255,255,255,.03)':'none'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                      <span style={{fontFamily:S,fontSize:14,fontWeight:700,color:p.col}}>{p.name}</span>
                      <span style={{fontFamily:M,fontSize:12,fontWeight:700,color:'#FFF'}}>{p.weight}</span>
                    </div>
                    <div style={{fontFamily:S,fontSize:12,color:'#444',lineHeight:1.5,marginBottom:8}}>{p.desc}</div>
                    <div style={{height:3,background:'rgba(255,255,255,.04)',borderRadius:99,overflow:'hidden'}}>
                      <div style={{height:'100%',borderRadius:99,background:`linear-gradient(90deg,${p.col}40,${p.col})`,width:p.weight,transition:'width 1s ease'}} />
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>

            {/* Tiers */}
            <Reveal delay={.15}>
              <div className="card" style={{padding:0}}>
                <div style={{padding:'16px 24px',borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                  <span style={{fontFamily:M,fontSize:10,fontWeight:600,color:'#888',letterSpacing:'.06em'}}>7 RANK TIERS</span>
                </div>
                {[
                  { name: 'PAPER HANDS', range: '0-99', col: '#555555', tag: 'PH', grad: 'linear-gradient(135deg,#333,#555)', note: null },
                  { name: 'RETAIL', range: '100-299', col: '#CD7F32', tag: 'RT', grad: 'linear-gradient(135deg,#8B4513,#CD7F32)', note: null },
                  { name: 'SWING TRADER', range: '300-599', col: '#C0C0C0', tag: 'SW', grad: 'linear-gradient(135deg,#808080,#C0C0C0)', note: null },
                  { name: 'MARKET MAKER', range: '600-999', col: '#F5A0D0', tag: 'MM', grad: 'linear-gradient(135deg,#8B3A62,#F5A0D0)', note: null },
                  { name: 'WHALE', range: '1000-1999', col: '#00DC82', tag: 'WH', grad: 'linear-gradient(135deg,#006B3F,#00DC82)', note: null },
                  { name: 'DEGEN KING', range: '2000-4999', col: '#F5A0D0', tag: 'DK', grad: 'linear-gradient(135deg,#8B008B,#F5A0D0)', note: 'copy eligible' },
                  { name: 'LEGENDARY', range: '5000+', col: '#FFFFFF', tag: 'LG', grad: 'linear-gradient(135deg,#FFD700,#FFF)', note: 'copy eligible' },
                ].map((rank, i) => (
                  <div key={rank.name} className="card-row" style={{display:'flex',alignItems:'center',gap:12,padding:'10px 24px',borderBottom:i<6?'1px solid rgba(255,255,255,.03)':'none'}}>
                    <div style={{
                      width:32,height:32,borderRadius:8,flexShrink:0,
                      background:rank.grad,border:`1.5px solid ${rank.col}40`,
                      display:'flex',alignItems:'center',justifyContent:'center',
                      fontFamily:M,fontSize:10,fontWeight:700,color:'#FFF',
                      boxShadow:i>=5?`0 0 12px ${rank.col}30`:'none',
                    }}>{rank.tag}</div>
                    <div style={{flex:1}}>
                      <span style={{fontFamily:S,fontSize:13,fontWeight:600,color:rank.col}}>{rank.name}</span>
                    </div>
                    {rank.note && (
                      <span style={{fontFamily:M,fontSize:8,color:'#FFD700',background:'rgba(255,215,0,.1)',padding:'2px 6px',borderRadius:4,letterSpacing:'.04em'}}>{rank.note.toUpperCase()}</span>
                    )}
                    <span style={{fontFamily:M,fontSize:10,color:'#444'}}>{rank.range}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* COPY TRADING — The destination                                     */}
      {/* ================================================================== */}
      <section className="section-pad" style={{padding:'100px 32px',background:'rgba(255,255,255,.01)',borderTop:'1px solid rgba(255,255,255,.04)',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
        <div style={{maxWidth:1000,margin:'0 auto'}}>
          <Reveal>
            <p style={{fontFamily:S,fontSize:14,fontWeight:500,color:'#FFD700',marginBottom:12}}>The destination</p>
            <h2 style={{fontFamily:B,fontSize:'clamp(32px,5vw,56px)',lineHeight:.92,letterSpacing:'-.01em',marginBottom:20}}>
              TOP 20 BECOME INVESTABLE
            </h2>
            <p style={{fontFamily:S,fontSize:15,color:'#555',maxWidth:520,lineHeight:1.7,marginBottom:56}}>
              Prove yourself in competition. Reach the top 20 by rank. Followers mirror your trades across any exchange. You earn 15% of every profitable trade they copy.
            </p>
          </Reveal>

          <div className="copy-layout" style={{display:'flex',gap:32}}>
            <Reveal delay={.1} style={{flex:1}}>
              <div style={{display:'flex',flexDirection:'column',gap:24}}>
                {[
                  { t: 'Earn By Trading Well', d: 'Top 20 traders earn 15% of follower profits. No marketing needed. Your rank is your resume.', c: '#FFD700', stat: '15%', statLabel: 'leader fee' },
                  { t: 'Verified, Not Self-Reported', d: '20+ battles minimum. Max drawdown below -15%. Stress-tested by market events. You cannot cherry-pick your record.', c: '#00DC82', stat: '20+', statLabel: 'battles required' },
                  { t: 'Cross-Exchange', d: 'Followers on Coinbase can copy a trader on Binance. Your rank follows you everywhere. No platform lock-in.', c: '#F5A0D0', stat: '5+', statLabel: 'exchanges' },
                ].map((f, i) => (
                  <div key={i} style={{display:'flex',gap:16,alignItems:'flex-start'}}>
                    <div style={{minWidth:56,textAlign:'center',paddingTop:2}}>
                      <div style={{fontFamily:M,fontSize:24,fontWeight:700,color:f.c,lineHeight:1}}>{f.stat}</div>
                      <div style={{fontFamily:M,fontSize:8,color:'#444',letterSpacing:'.04em',marginTop:2}}>{f.statLabel}</div>
                    </div>
                    <div>
                      <div style={{fontFamily:S,fontSize:16,fontWeight:700,color:'#FFF',marginBottom:4}}>{f.t}</div>
                      <div style={{fontFamily:S,fontSize:13,color:'#555',lineHeight:1.6}}>{f.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={.2} style={{flex:0,minWidth:300,maxWidth:380}}>
              <div className="card" style={{padding:0}}>
                <div style={{padding:'16px 24px',borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                  <span style={{fontFamily:M,fontSize:10,fontWeight:600,color:'#FFD700',letterSpacing:'.06em'}}>HOW FEES WORK</span>
                </div>
                <div style={{padding:'24px'}}>
                  {[
                    { label: 'Follower keeps', pct: '75%', col: '#00DC82', w: '75%' },
                    { label: 'Leader earns', pct: '15%', col: '#FFD700', w: '15%' },
                    { label: 'Platform', pct: '10%', col: '#F5A0D0', w: '10%' },
                  ].map((f, i) => (
                    <div key={i} style={{marginBottom:i<2?16:0}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                        <span style={{fontFamily:S,fontSize:13,color:'#999'}}>{f.label}</span>
                        <span style={{fontFamily:M,fontSize:14,fontWeight:700,color:f.col}}>{f.pct}</span>
                      </div>
                      <div style={{height:4,background:'rgba(255,255,255,.04)',borderRadius:99,overflow:'hidden'}}>
                        <div style={{height:'100%',borderRadius:99,background:f.col,width:f.w,transition:'width 1s ease'}} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{padding:'16px 24px',borderTop:'1px solid rgba(255,255,255,.05)',background:'rgba(255,215,0,.02)'}}>
                  <span style={{fontFamily:S,fontSize:12,color:'#666',lineHeight:1.5}}>
                    Fees only on <span style={{color:'#FFD700'}}>net positive PnL</span>. No fee on losses. Aligned incentives.
                  </span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* THE GAME — Game mechanics (compressed)                              */}
      {/* ================================================================== */}
      <section className="section-pad" style={{padding:'100px 32px'}}>
        <div style={{maxWidth:1000,margin:'0 auto'}}>
          <Reveal>
            <p style={{fontFamily:S,fontSize:14,fontWeight:500,color:'#F5A0D0',marginBottom:12}}>Learn by playing</p>
            <h2 style={{fontFamily:B,fontSize:'clamp(32px,5vw,56px)',lineHeight:.92,letterSpacing:'-.01em',marginBottom:20}}>
              THE GAME TEACHES YOU
            </h2>
            <p style={{fontFamily:S,fontSize:15,color:'#555',maxWidth:520,lineHeight:1.7,marginBottom:48}}>
              Every battle is a trading lesson disguised as competition. Learn entries, exits, leverage, risk management, and how to stay cool during market chaos — all with zero financial risk.
            </p>
          </Reveal>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24}}>
            {/* Market events */}
            <Reveal delay={.05}>
              <div className="card" style={{padding:0}}>
                <div style={{padding:'16px 24px',borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                  <span style={{fontFamily:M,fontSize:10,fontWeight:600,color:'#F5A0D0',letterSpacing:'.06em'}}>MARKET STRESS TESTS</span>
                </div>
                {MARKET_EVENTS.map((w, i) => (
                  <div key={i} className="card-row" style={{
                    display:'flex',alignItems:'center',justifyContent:'space-between',
                    padding:'12px 24px',borderBottom:i<5?'1px solid rgba(255,255,255,.03)':'none',
                  }}>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
                        <span style={{fontFamily:S,fontSize:13,fontWeight:700,color:'#FFF'}}>{w.name}</span>
                        <span style={{fontFamily:M,fontSize:8,color:w.type==='DEFENSE'?'#00DC82':'#FF4466',background:w.type==='DEFENSE'?'rgba(0,220,130,.1)':'rgba(255,68,102,.08)',padding:'1px 5px',borderRadius:3}}>{w.type}</span>
                      </div>
                      <span style={{fontFamily:S,fontSize:11,color:'#444'}}>{w.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>

            {/* Spectator + prizes */}
            <Reveal delay={.15}>
              <div style={{display:'flex',flexDirection:'column',gap:24}}>
                {/* Spectator */}
                <div className="card" style={{padding:0}}>
                  <div style={{padding:'16px 24px',borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                    <span style={{fontFamily:M,fontSize:10,fontWeight:600,color:'#00DC82',letterSpacing:'.06em'}}>SPECTATOR ECONOMY</span>
                  </div>
                  {[
                    { t: 'Live Broadcast', d: 'OBS-ready overlays for streamers', c: '#00DC82' },
                    { t: 'Prediction Markets', d: 'Bet credits on round winners', c: '#F5A0D0' },
                    { t: 'Crowd Events', d: 'Spectators trigger market events on traders', c: '#FF4466' },
                  ].map((f, i) => (
                    <div key={i} className="card-row" style={{display:'flex',alignItems:'center',gap:12,padding:'10px 24px',borderBottom:i<2?'1px solid rgba(255,255,255,.03)':'none'}}>
                      <div style={{width:3,height:20,background:f.c,borderRadius:2,flexShrink:0}} />
                      <div>
                        <span style={{fontFamily:S,fontSize:13,fontWeight:600,color:'#CCC'}}>{f.t}</span>
                        <span style={{fontFamily:S,fontSize:11,color:'#444',marginLeft:8}}>{f.d}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Live battles */}
                <div className="card" style={{padding:0}}>
                  <div style={{padding:'14px 24px',borderBottom:'1px solid rgba(255,255,255,.05)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontFamily:M,fontSize:10,fontWeight:600,color:'#888',letterSpacing:'.06em'}}>LIVE BATTLES</span>
                    <Link href="/markets" style={{fontFamily:S,fontSize:11,color:'#F5A0D0',textDecoration:'none'}}>View all</Link>
                  </div>
                  {loaded && battles.length > 0 ? battles.slice(0, 4).map(b => (
                    <div key={b.id} className="card-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 24px',borderBottom:'1px solid rgba(255,255,255,.03)'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        {b.status === 'active' && <div className="live-dot" style={{width:4,height:4}} />}
                        <span style={{fontFamily:S,fontSize:13,fontWeight:600,color:'#CCC'}}>{b.name}</span>
                        <span style={{fontFamily:M,fontSize:10,color:'#333'}}>{b.player_count}p</span>
                      </div>
                      <button onClick={()=>router.push(`/lobby/${b.id}`)} className="btn-primary" style={{fontSize:10,padding:'4px 10px'}}>Join</button>
                    </div>
                  )) : (
                    <div style={{padding:'32px 24px',textAlign:'center'}}>
                      <div style={{fontFamily:S,fontSize:14,fontWeight:600,color:'#333',marginBottom:8}}>No battles live</div>
                      <button onClick={login} className="btn-primary" style={{fontSize:12,padding:'8px 20px'}}>Start Battle</button>
                    </div>
                  )}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* FINAL CTA                                                          */}
      {/* ================================================================== */}
      <section className="section-pad" style={{padding:'120px 32px',textAlign:'center',borderTop:'1px solid rgba(255,255,255,.04)'}}>
        <Reveal>
          <h2 style={{fontFamily:B,fontSize:'clamp(40px,7vw,88px)',lineHeight:.9,letterSpacing:'-.02em',marginBottom:20}}>
            START LEARNING<br/><span style={{color:'#F5A0D0'}}>START TRADING</span>
          </h2>
        </Reveal>
        <Reveal delay={.1}>
          <p style={{fontFamily:S,fontSize:17,color:'#555',marginBottom:36,maxWidth:480,margin:'0 auto 36px'}}>
            Free to start. Practice with paper money and real market data. Compete to build real skills and a verified rank. Top traders earn income through copy trading.
          </p>
        </Reveal>
        <Reveal delay={.2}>
          <button onClick={login} className="btn-primary" style={{fontSize:20,padding:'18px 56px'}}>
            Start Free
          </button>
          <div style={{fontFamily:S,fontSize:12,color:'#333',marginTop:20}}>Google · X · Email · WalletConnect</div>
        </Reveal>
      </section>

      {/* FOOTER */}
      <footer style={{borderTop:'1px solid rgba(255,255,255,.04)',padding:'32px'}}>
        <div className="footer-row" style={{maxWidth:1000,margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',gap:24}}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-main.png" alt="" style={{height:20,width:'auto',opacity:.2}} onError={e=>{(e.target as HTMLImageElement).style.display='none'}} />
          <span style={{fontFamily:S,fontSize:11,color:'#222',maxWidth:440,lineHeight:1.5}}>
            Learn to trade through live competition. Build real skills with zero risk. Your rank is your verified trading resume.
          </span>
          <div style={{display:'flex',gap:20}}>
            <Link href="/markets" style={{fontFamily:S,fontSize:12,color:'#333',textDecoration:'none'}}>Battles</Link>
            <Link href="/learn" style={{fontFamily:S,fontSize:12,color:'#333',textDecoration:'none'}}>Learn</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
