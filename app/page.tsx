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

const WORDS = ['YOUR FRIENDS', 'STRANGERS', 'DEGENS', 'YOUR EX', 'ANYONE', 'THE MARKET']
const FEED = [
  { user: 'wolfpack', action: 'dropped BLACKOUT on vega', pnl: '-12.4%', side: 'atk' },
  { user: 'degen_prime', action: '10x long BTC', pnl: '+31.2%', side: 'pos' },
  { user: 'iron_hands', action: 'liquidated', pnl: '-100%', side: 'neg' },
  { user: 'anonymous', action: 'went DARK POOL', pnl: '+8.1%', side: 'def' },
  { user: 'whale_hunter', action: '+47% this round', pnl: '+47.3%', side: 'pos' },
  { user: 'paper_hands', action: 'panic sold everything', pnl: '-22.6%', side: 'neg' },
  { user: 'vega', action: 'blocked TRADING HALT', pnl: '+5.3%', side: 'def' },
  { user: 'moon_boy', action: 'forced trade on wolfpack', pnl: '-8.9%', side: 'atk' },
]

const WEAPONS = [
  { name: 'BLACKOUT', desc: 'Lock their screen for 30s', cost: 200, type: 'ATK' },
  { name: 'FAKE HEADLINE', desc: 'Force panic with fake news', cost: 150, type: 'ATK' },
  { name: 'LEVERAGE CAP', desc: 'Slash their max leverage', cost: 300, type: 'ATK' },
  { name: 'REVEAL', desc: 'Expose their positions', cost: 100, type: 'INTEL' },
  { name: 'TRADING HALT', desc: 'Freeze one of their assets', cost: 250, type: 'ATK' },
  { name: 'FORCE TRADE', desc: 'Make them buy or sell', cost: 500, type: 'ATK' },
  { name: 'HEDGE', desc: 'Block the next attack', cost: 150, type: 'DEF' },
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
  const { login, authenticated, user, ready } = usePrivy()
  const [battles, setBattles] = useState<LiveBattle[]>([])
  const [loaded, setLoaded] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [wordIdx, setWordIdx] = useState(0)
  const [feedItems, setFeedItems] = useState<typeof FEED>([])
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    if (!ready) return
    if (authenticated && user) {
      getOrCreateProfile(user).then(profile => {
        if (profile) localStorage.setItem('bt_profile_id', profile.id)
        router.replace('/dashboard')
      }).catch(err => {
        console.error('[auth] getOrCreateProfile failed:', err)
        // Still redirect — dashboard will retry profile creation
        router.replace('/dashboard')
      })
    }
  }, [ready, authenticated, user, router])

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const i = setInterval(() => setWordIdx(p => (p + 1) % WORDS.length), 2400)
    return () => clearInterval(i)
  }, [])
  useEffect(() => {
    let idx = 0
    const i = setInterval(() => {
      idx = (idx + 1) % FEED.length
      setFeedItems(prev => [FEED[idx], ...prev].slice(0, 6))
    }, 2200)
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
  const feedColor = (side: string) => side === 'pos' ? '#00DC82' : side === 'neg' ? '#FF4466' : side === 'atk' ? '#F5A0D0' : '#7B93DB'

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
        @keyframes feedIn{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}
        @keyframes marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        @keyframes glow{0%,100%{opacity:.4}50%{opacity:.8}}

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
          .weap-grid{grid-template-columns:1fr!important}
          .spec-layout{flex-direction:column!important}
          .cta-stack{flex-direction:column!important;width:100%!important}
          .cta-stack>button{width:100%!important}
          .footer-row{flex-direction:column!important;text-align:center!important;gap:16px!important}
        }
        @media(max-width:480px){
          .h1-size{font-size:clamp(36px,13vw,56px)!important}
          .steps-grid{grid-template-columns:1fr!important}
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
          <Link href="/lab" className="desk-only" style={{fontFamily:S,fontSize:14,fontWeight:500,color:'#666',textDecoration:'none',transition:'color .15s'}}>Lab</Link>
          <button onClick={login} className="btn-primary" style={{fontSize:14,padding:'10px 24px'}}>
            Sign In
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{minHeight:'100dvh',display:'flex',flexDirection:'column',justifyContent:'center',position:'relative'}}>
        {/* Subtle glow */}
        <div style={{position:'absolute',top:'20%',left:'50%',transform:'translateX(-50%)',width:'80vw',height:'50vh',background:'radial-gradient(ellipse at center,rgba(245,160,208,.04) 0%,transparent 70%)',pointerEvents:'none'}} />

        <div className="hero-grid" style={{maxWidth:1200,width:'100%',margin:'0 auto',padding:'140px 32px 80px',display:'flex',alignItems:'center',gap:80}}>
          <div className="hero-left" style={{flex:1,maxWidth:560}}>
            <div className="anim-up" style={{animationDelay:'.1s',marginBottom:20}}>
              <span style={{fontFamily:M,fontSize:12,color:'#F5A0D0',letterSpacing:'.08em',fontWeight:500}}>LEARN. COMPETE. WIN.</span>
            </div>

            <h1 className="anim-up h1-size" style={{
              animationDelay:'.2s',fontFamily:B,
              fontSize:'clamp(56px,7.5vw,110px)',lineHeight:.9,letterSpacing:'-.02em',
              marginBottom:28,
            }}>
              <span style={{display:'block'}}>OUT-TRADE</span>
              <span style={{display:'block',position:'relative',overflow:'hidden',height:'1.1em',color:'#F5A0D0'}}>
                {mounted && <span key={wordIdx} style={{display:'block',position:'absolute',animation:'wordCycle 2.4s cubic-bezier(.22,1,.36,1) both'}}>{WORDS[wordIdx]}</span>}
              </span>
            </h1>

            <p className="anim-up" style={{animationDelay:'.4s',fontFamily:S,fontSize:17,color:'#666',lineHeight:1.7,marginBottom:36,maxWidth:420}}>
              Trade against real people with live market prices. Drop market event cards on opponents. Climb the ranks. Free to play.
            </p>

            <div className="anim-up cta-stack" style={{animationDelay:'.55s',display:'flex',gap:12,marginBottom:48}}>
              <button onClick={login} className="btn-primary" style={{fontSize:17,padding:'16px 44px'}}>
                Play Free
              </button>
              <Link href="/markets" className="btn-secondary" style={{fontSize:15,padding:'16px 32px',textDecoration:'none',display:'inline-block'}}>
                Watch Live
              </Link>
            </div>

            <div className="anim-up" style={{animationDelay:'.7s',display:'flex',gap:36,flexWrap:'wrap'}}>
              {[
                { v: '60+', l: 'assets' },
                { v: '7', l: 'weapons' },
                { v: '$0', l: 'to start' },
              ].map(s => (
                <div key={s.l}>
                  <span style={{fontFamily:S,fontSize:20,fontWeight:700,color:'#FFF'}}>{s.v}</span>
                  <span style={{fontFamily:S,fontSize:13,color:'#444',marginLeft:6}}>{s.l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Live feed — looks like part of the product */}
          <div className="anim-up hero-right" style={{animationDelay:'.4s',flex:0,minWidth:340,maxWidth:400}}>
            <div className="card" style={{overflow:'hidden'}}>
              <div style={{padding:'14px 20px',borderBottom:'1px solid rgba(255,255,255,.05)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div className="live-dot" style={{width:5,height:5}} />
                  <span style={{fontFamily:S,fontSize:12,fontWeight:600,color:'#888'}}>Live Activity</span>
                </div>
                <span style={{fontFamily:M,fontSize:10,color:'#333'}}>REAL-TIME</span>
              </div>
              <div style={{minHeight:280}}>
                {feedItems.map((item, i) => (
                  <div key={`${item.user}-${i}`} style={{
                    display:'flex',alignItems:'center',justifyContent:'space-between',
                    padding:'10px 20px',borderBottom:'1px solid rgba(255,255,255,.03)',
                    animation:'feedIn .3s ease both',
                  }}>
                    <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0,flex:1}}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:feedColor(item.side),flexShrink:0}} />
                      <div style={{minWidth:0}}>
                        <span style={{fontFamily:M,fontSize:11,color:'#888'}}>@{item.user}</span>
                        <span style={{fontFamily:S,fontSize:12,color:'#555',marginLeft:6}}>{item.action}</span>
                      </div>
                    </div>
                    <span style={{fontFamily:M,fontSize:11,color:feedColor(item.side),flexShrink:0,marginLeft:12}}>
                      {item.pnl}
                    </span>
                  </div>
                ))}
                {feedItems.length === 0 && (
                  <div style={{padding:'60px 20px',textAlign:'center'}}>
                    <span style={{fontFamily:S,fontSize:13,color:'#222'}}>Waiting for activity...</span>
                  </div>
                )}
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

      {/* HOW IT WORKS */}
      <section className="section-pad" style={{padding:'100px 32px'}}>
        <div style={{maxWidth:1000,margin:'0 auto'}}>
          <Reveal>
            <p style={{fontFamily:S,fontSize:14,fontWeight:500,color:'#F5A0D0',marginBottom:12}}>How it works</p>
            <h2 style={{fontFamily:B,fontSize:'clamp(32px,5vw,56px)',lineHeight:.92,letterSpacing:'-.01em',marginBottom:56}}>
              FOUR STEPS TO YOUR FIRST BATTLE
            </h2>
          </Reveal>
          <div className="steps-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:20}}>
            {[
              { n: '01', t: 'Join', d: 'Pick a lobby. Get $100K virtual cash. You\'re in.', c: '#F5A0D0' },
              { n: '02', t: 'Trade', d: 'Real BTC, ETH, SOL prices. Real charts. Your strategy.', c: '#00DC82' },
              { n: '03', t: 'Sabotage', d: 'Earn credits. Buy weapons. Wreck opponents.', c: '#FF4466' },
              { n: '04', t: 'Win', d: 'Highest return takes the crown. Climb global ranks.', c: '#FFF' },
            ].map((step, i) => (
              <Reveal key={i} delay={i * .08}>
                <div className="card" style={{padding:'28px 24px',height:'100%'}}>
                  <div style={{fontFamily:M,fontSize:11,color:step.c,marginBottom:16,opacity:.6}}>{step.n}</div>
                  <div style={{fontFamily:S,fontSize:20,fontWeight:700,color:'#FFF',marginBottom:8}}>{step.t}</div>
                  <div style={{fontFamily:S,fontSize:13,color:'#555',lineHeight:1.6}}>{step.d}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* WEAPONS — product card style */}
      <section className="section-pad" style={{padding:'100px 32px',background:'rgba(255,255,255,.01)',borderTop:'1px solid rgba(255,255,255,.04)',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
        <div style={{maxWidth:1000,margin:'0 auto'}}>
          <Reveal>
            <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:48,flexWrap:'wrap',gap:16}}>
              <div>
                <p style={{fontFamily:S,fontSize:14,fontWeight:500,color:'#F5A0D0',marginBottom:12}}>Arsenal</p>
                <h2 style={{fontFamily:B,fontSize:'clamp(32px,5vw,56px)',lineHeight:.92,letterSpacing:'-.01em'}}>
                  7 MARKET EVENT CARDS
                </h2>
              </div>
              <p style={{fontFamily:S,fontSize:14,color:'#444',maxWidth:320}}>
                Earn credits each round. Spend them to attack opponents or defend yourself.
              </p>
            </div>
          </Reveal>

          <div className="weap-grid" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:2}}>
            {WEAPONS.map((w, i) => (
              <Reveal key={i} delay={i * .04}>
                <div className="card-row" style={{
                  display:'flex',alignItems:'center',justifyContent:'space-between',
                  padding:'18px 24px',background:'rgba(255,255,255,.02)',
                }}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:2}}>
                      <span style={{fontFamily:S,fontSize:15,fontWeight:700,color:'#FFF'}}>{w.name}</span>
                      <span style={{
                        fontFamily:M,fontSize:9,
                        color:w.type==='ATK'?'#FF4466':w.type==='DEF'?'#00DC82':'#7B93DB',
                        background:w.type==='ATK'?'rgba(255,68,102,.1)':w.type==='DEF'?'rgba(0,220,130,.1)':'rgba(123,147,219,.1)',
                        padding:'2px 6px',borderRadius:'4px',
                      }}>{w.type}</span>
                    </div>
                    <span style={{fontFamily:S,fontSize:12,color:'#555'}}>{w.desc}</span>
                  </div>
                  <div style={{fontFamily:M,fontSize:12,color:'#555',marginLeft:20,whiteSpace:'nowrap'}}>{w.cost} cr</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* SPECTATE + BATTLES */}
      <section className="section-pad" style={{padding:'100px 32px'}}>
        <div style={{maxWidth:1000,margin:'0 auto'}}>
          <Reveal>
            <p style={{fontFamily:S,fontSize:14,fontWeight:500,color:'#00DC82',marginBottom:12}}>Spectator mode</p>
            <h2 style={{fontFamily:B,fontSize:'clamp(32px,5vw,56px)',lineHeight:.92,letterSpacing:'-.01em',marginBottom:48}}>
              TRADING AS A SPECTATOR SPORT
            </h2>
          </Reveal>

          <div className="spec-layout" style={{display:'flex',gap:32}}>
            <Reveal delay={.1} style={{flex:1}}>
              <div style={{display:'flex',flexDirection:'column',gap:20}}>
                {[
                  { t: 'Live Broadcast', d: 'OBS-ready overlays for streamers. Full spectator view with leaderboard, trade feed, and event alerts.', c: '#00DC82' },
                  { t: 'Prediction Markets', d: 'Bet credits on who wins each round. Put your conviction where your mouth is.', c: '#F5A0D0' },
                  { t: 'Crowd Sabotage', d: 'Spectators pool credits to drop weapons on traders. The audience is never passive.', c: '#FF4466' },
                ].map((f, i) => (
                  <div key={i} style={{display:'flex',gap:16,alignItems:'flex-start'}}>
                    <div style={{width:3,height:32,background:f.c,marginTop:4,flexShrink:0,borderRadius:2}} />
                    <div>
                      <div style={{fontFamily:S,fontSize:16,fontWeight:700,color:'#FFF',marginBottom:4}}>{f.t}</div>
                      <div style={{fontFamily:S,fontSize:13,color:'#555',lineHeight:1.6}}>{f.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={.2} style={{flex:1,maxWidth:420}}>
              <div className="card">
                <div style={{padding:'14px 20px',borderBottom:'1px solid rgba(255,255,255,.05)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontFamily:S,fontSize:13,fontWeight:600,color:'#888'}}>Battle Markets</span>
                  <Link href="/markets" style={{fontFamily:S,fontSize:12,color:'#F5A0D0',textDecoration:'none'}}>View all</Link>
                </div>
                {loaded && battles.length > 0 ? battles.slice(0, 5).map(b => (
                  <div key={b.id} className="card-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 20px',borderBottom:'1px solid rgba(255,255,255,.03)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      {b.status === 'active' && <div className="live-dot" style={{width:4,height:4}} />}
                      <span style={{fontFamily:S,fontSize:14,fontWeight:600,color:'#CCC'}}>{b.name}</span>
                      <span style={{fontFamily:M,fontSize:10,color:'#333'}}>{b.player_count}p</span>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      {b.top_trader && (
                        <span style={{fontFamily:M,fontSize:11,color:b.top_trader.return_pct>=0?'#00DC82':'#FF4466'}}>
                          {b.top_trader.return_pct>=0?'+':''}{b.top_trader.return_pct.toFixed(1)}%
                        </span>
                      )}
                      <button onClick={()=>router.push(`/lobby/${b.id}/spectate`)} className="btn-secondary" style={{fontSize:11,padding:'4px 10px'}}>Watch</button>
                      <button onClick={()=>router.push(`/lobby/${b.id}`)} className="btn-primary" style={{fontSize:11,padding:'4px 10px'}}>Join</button>
                    </div>
                  </div>
                )) : (
                  <div style={{padding:'48px 20px',textAlign:'center'}}>
                    <div style={{fontFamily:S,fontSize:15,fontWeight:600,color:'#333',marginBottom:8}}>No battles yet</div>
                    <div style={{fontFamily:S,fontSize:12,color:'#222',marginBottom:16}}>Be the first to start one</div>
                    <button onClick={login} className="btn-primary" style={{fontSize:13,padding:'10px 24px'}}>Create Battle</button>
                  </div>
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="section-pad" style={{padding:'120px 32px',textAlign:'center',borderTop:'1px solid rgba(255,255,255,.04)'}}>
        <Reveal>
          <h2 style={{fontFamily:B,fontSize:'clamp(40px,7vw,88px)',lineHeight:.9,letterSpacing:'-.02em',marginBottom:20}}>
            STOP TRADING<br/><span style={{color:'#F5A0D0'}}>ALONE</span>
          </h2>
        </Reveal>
        <Reveal delay={.1}>
          <p style={{fontFamily:S,fontSize:17,color:'#555',marginBottom:36}}>
            Free. No download. Sign in and go.
          </p>
        </Reveal>
        <Reveal delay={.2}>
          <button onClick={login} className="btn-primary" style={{fontSize:20,padding:'18px 56px'}}>
            Enter the Arena
          </button>
          <div style={{fontFamily:S,fontSize:12,color:'#333',marginTop:20}}>Google · X · Email · WalletConnect</div>
        </Reveal>
      </section>

      {/* MOBILE STICKY CTA */}
      <div className="mob-only" style={{
        position:'fixed',bottom:0,left:0,right:0,zIndex:100,
        padding:'12px 16px env(safe-area-inset-bottom)',
        background:'rgba(10,10,10,.92)',backdropFilter:'blur(20px)',
        borderTop:'1px solid rgba(255,255,255,.06)',
        display:'flex',gap:10,
      }}>
        <button onClick={login} className="btn-primary" style={{flex:1,fontSize:15,padding:'14px 0',textAlign:'center'}}>
          Play Free
        </button>
        <button onClick={()=>router.push('/markets')} className="btn-secondary" style={{fontSize:13,padding:'14px 20px',whiteSpace:'nowrap'}}>
          Watch
        </button>
      </div>

      {/* FOOTER */}
      <footer style={{borderTop:'1px solid rgba(255,255,255,.04)',padding:'32px'}}>
        <div className="footer-row" style={{maxWidth:1000,margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',gap:24}}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-main.png" alt="" style={{height:20,width:'auto',opacity:.2}} onError={e=>{(e.target as HTMLImageElement).style.display='none'}} />
          <span style={{fontFamily:S,fontSize:11,color:'#222',maxWidth:440,lineHeight:1.5}}>
            Battle Trade is a competitive simulation platform. Virtual capital only. No real funds at risk.
          </span>
          <div style={{display:'flex',gap:20}}>
            <Link href="/markets" style={{fontFamily:S,fontSize:12,color:'#333',textDecoration:'none'}}>Battles</Link>
            <Link href="/lab" style={{fontFamily:S,fontSize:12,color:'#333',textDecoration:'none'}}>Lab</Link>
            <Link href="/learn" style={{fontFamily:S,fontSize:12,color:'#333',textDecoration:'none'}}>Learn</Link>
          </div>
        </div>
      </footer>
      <div className="mob-only" style={{height:72}} />
    </div>
  )
}
