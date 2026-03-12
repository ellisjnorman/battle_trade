import type React from 'react'

/**
 * Battle Trade Design System
 *
 * Gen Z fintech. Robinhood dark × Cash App confidence × Duolingo dopamine.
 * See GEN_Z_DESIGN_MANIFESTO.md for the full reference.
 *
 * Rules:
 * - ONE hero number per screen (48-64px mono)
 * - ONE primary CTA in thumb zone
 * - 90/8/2 contrast: 90% muted, 8% medium, 2% bright
 * - 5-layer dark depth: bg → surface → elevated → hover → border
 * - Skeleton screens, never spinners
 */

// ─── FONTS ──────────────────────────────────────────────────
export const font = {
  sans: "var(--font-dm-sans, 'DM Sans'), sans-serif",
  display: "var(--font-bebas, 'Bebas Neue'), sans-serif",
  mono: "var(--font-jetbrains, 'JetBrains Mono'), monospace",
}

// ─── COLORS (5-layer depth system) ──────────────────────────
export const c = {
  // Depth layers (each +6-8% luminance)
  bg: '#0A0A0A',           // L0: the void
  surface: '#111111',      // L1: cards, containers
  elevated: '#1A1A1A',     // L2: modals, active cards, dropdowns
  hover: '#222222',        // L3: hover states, selected
  border: '#2A2A2A',       // L4: dividers, card borders

  // Borders with alpha (for overlays)
  borderAlpha: 'rgba(255,255,255,.06)',
  borderHover: 'rgba(255,255,255,.10)',

  // Text hierarchy (restraint: most text is muted)
  text: '#FFFFFF',         // 2% of screen — hero numbers, active labels
  text2: '#999999',        // 8% — secondary values, descriptions
  text3: '#666666',        // Captions, timestamps
  text4: '#444444',        // Barely visible — metadata
  textMuted: '#333333',    // Ghost text — placeholders

  // Accent (60% of accent usage)
  pink: '#F5A0D0',
  pinkDim: 'rgba(245,160,208,.08)',
  pinkBorder: 'rgba(245,160,208,.12)',
  pinkGlow: '0 0 20px rgba(245,160,208,.15), 0 0 60px rgba(245,160,208,.05)',

  // Profit (25% of accent usage)
  green: '#00DC82',
  greenDim: 'rgba(0,220,130,.08)',
  greenGlow: '0 0 20px rgba(0,220,130,.3)',

  // Loss (5% — only on actual negatives)
  red: '#FF4466',
  redDim: 'rgba(255,68,102,.08)',

  // Supporting (10%)
  blue: '#7B93DB',
  blueDim: 'rgba(123,147,219,.08)',
  gold: '#FFD700',

  // Tier colors
  tierPaper: '#555555',
  tierRetail: '#CD7F32',
  tierSwing: '#C0C0C0',
  tierMaker: '#F5A0D0',
  tierWhale: '#00DC82',
  tierDegen: '#F5A0D0',
  tierLegend: '#FFFFFF',
}

// ─── RANK COLORS ────────────────────────────────────────────
export const rankColor = (rank: number) => {
  if (rank === 1) return { color: '#FFD700', glow: '0 0 20px rgba(255,215,0,.3)', label: 'GOLD' }
  if (rank === 2) return { color: '#C0C0C0', glow: '0 0 16px rgba(192,192,192,.25)', label: 'SILVER' }
  if (rank === 3) return { color: '#CD7F32', glow: '0 0 16px rgba(205,127,50,.25)', label: 'BRONZE' }
  return { color: c.text2, glow: 'none', label: '' }
}

// ─── STREAK COLORS ──────────────────────────────────────────
export const streakStyle = (streak: number) => {
  if (streak >= 5) return { color: '#FFD700', label: 'UNSTOPPABLE', intensity: 'high' as const }
  if (streak >= 3) return { color: c.pink, label: 'ON FIRE', intensity: 'medium' as const }
  if (streak >= 2) return { color: '#FF8C00', label: `${streak} STREAK`, intensity: 'low' as const }
  return { color: c.text4, label: '', intensity: 'none' as const }
}

// ─── RADII ──────────────────────────────────────────────────
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
}

// ─── TYPE SCALE ─────────────────────────────────────────────
// Hero:     56px mono 700 (the ONE number per screen)
// Mega:     64-80px mono 700 (recap card / celebration)
// Display:  48px display 700 (Bebas Neue headings)
// Title:    28px sans 700
// Section:  18px sans 600
// Card:     15px sans 600
// Body:     14px sans 400
// Caption:  12px sans 500 uppercase .05em
// Micro:    10px sans 600 uppercase .08em

// ─── RECAP CARD DIMENSIONS ──────────────────────────────────
// Story:  360x640 (9:16 for IG Story)
// Square: 360x360 (1:1 for feed)
// Always include: logo top, hero stat center, BTR bottom, watermark

// ─── SHARED STYLES ──────────────────────────────────────────
export const navHeight = 56

export const navStyle = (scrolled: boolean): React.CSSProperties => ({
  position: 'sticky',
  top: 0,
  zIndex: 100,
  height: navHeight,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 20px',
  background: scrolled ? 'rgba(10,10,10,.92)' : c.bg,
  backdropFilter: scrolled ? 'blur(20px) saturate(1.2)' : 'none',
  borderBottom: `1px solid ${scrolled ? c.border : 'transparent'}`,
  transition: 'all .25s ease',
})

export const logoStyle: React.CSSProperties = {
  height: 32,
  width: 'auto',
}

export const navLinkStyle = (active: boolean): React.CSSProperties => ({
  fontFamily: font.sans,
  fontSize: 14,
  fontWeight: active ? 600 : 400,
  color: active ? c.text : c.text4,
  textDecoration: 'none',
  transition: 'color .15s',
})

export const btnPrimary: React.CSSProperties = {
  fontFamily: font.sans,
  fontWeight: 600,
  color: c.bg,
  background: c.pink,
  border: 'none',
  borderRadius: radius.md,
  cursor: 'pointer',
  transition: 'all .2s cubic-bezier(.25,.1,.25,1)',
}

export const btnSecondary: React.CSSProperties = {
  fontFamily: font.sans,
  fontWeight: 500,
  color: c.text2,
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: radius.md,
  cursor: 'pointer',
  transition: 'all .2s cubic-bezier(.25,.1,.25,1)',
}

export const card: React.CSSProperties = {
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: radius.lg,
  overflow: 'hidden',
}

export const cardElevated: React.CSSProperties = {
  background: c.elevated,
  border: `1px solid ${c.border}`,
  borderRadius: radius.lg,
  overflow: 'hidden',
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: radius.md,
  color: c.text,
  fontFamily: font.sans,
  outline: 'none',
  transition: 'border-color .15s',
}

// ─── SHARED CSS ─────────────────────────────────────────────
export const globalCSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  ::selection{background:rgba(245,160,208,.2)}
  html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
  body{background:${c.bg};color:${c.text}}
  button,input,textarea{font-family:${font.sans};-webkit-tap-highlight-color:transparent}

  .btn-p{transition:all .2s cubic-bezier(.25,.1,.25,1)}
  .btn-p:hover{background:#F7B3DA;transform:translateY(-1px);box-shadow:${c.pinkGlow}}
  .btn-p:active{transform:scale(.97);box-shadow:none}

  .btn-s{transition:all .2s cubic-bezier(.25,.1,.25,1)}
  .btn-s:hover{color:#FFF;background:${c.hover};border-color:${c.borderHover}}
  .btn-s:active{transform:scale(.97)}

  .nav-a{transition:color .15s}
  .nav-a:hover{color:#FFF!important}

  .card-h{transition:all .2s cubic-bezier(.25,.1,.25,1)}
  .card-h:hover{border-color:${c.borderHover}!important;background:${c.elevated}!important;transform:translateY(-1px)}
  .card-h:active{transform:scale(.98)}

  .row-h{transition:background .12s}
  .row-h:hover{background:${c.hover}!important}

  .pill{
    font-family:${font.sans};font-size:12px;font-weight:500;
    padding:5px 12px;cursor:pointer;border-radius:999px;
    transition:all .15s
  }
  .pill:hover{border-color:${c.borderHover}!important;color:#CCC!important}

  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.15}}
  .live-dot{width:6px;height:6px;border-radius:50%;background:${c.green};animation:pulse 1.6s ease-in-out infinite}

  @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
  .skeleton{
    background:linear-gradient(90deg,${c.surface} 25%,${c.elevated} 50%,${c.surface} 75%);
    background-size:200% 100%;animation:shimmer 1.5s ease-in-out infinite;border-radius:${radius.sm}px;
  }

  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  .fade-up{animation:fadeUp .35s cubic-bezier(.4,0,.2,1) both}

  @keyframes slideIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}

  @keyframes streakPulse{0%,100%{transform:scale(1);filter:brightness(1)}50%{transform:scale(1.08);filter:brightness(1.2)}}
  .streak-pulse{animation:streakPulse 1.2s ease-in-out infinite}

  @keyframes streakShake{0%,100%{transform:translateX(0)}10%,30%,50%,70%,90%{transform:translateX(-2px)}20%,40%,60%,80%{transform:translateX(2px)}}
  .streak-shake{animation:streakShake .4s ease-in-out infinite}

  @keyframes celebBurst{0%{transform:scale(0);opacity:1}50%{transform:scale(1.3);opacity:.6}100%{transform:scale(1);opacity:1}}
  .celeb-burst{animation:celebBurst .6s cubic-bezier(.34,1.56,.64,1) both}

  @keyframes confetti{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(120vh) rotate(720deg);opacity:0}}

  @keyframes goldGlow{0%,100%{box-shadow:0 0 20px rgba(255,215,0,.2)}50%{box-shadow:0 0 40px rgba(255,215,0,.4)}}
  .gold-glow{animation:goldGlow 2s ease-in-out infinite}

  @keyframes countUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  .count-up{animation:countUp .4s ease-out both}
`

// ─── HELPERS ────────────────────────────────────────────────
export const tierColor = (tier?: string) => {
  const map: Record<string, string> = {
    paper_hands: c.tierPaper, retail: c.tierRetail, swing_trader: c.tierSwing,
    market_maker: c.tierMaker, whale: c.tierWhale, degen_king: c.tierDegen, legendary: c.tierLegend,
  }
  return map[tier ?? ''] ?? c.text4
}

export const tierShort = (tier?: string) => {
  const map: Record<string, string> = {
    paper_hands: 'PAPER', retail: 'RETAIL', swing_trader: 'SWING',
    market_maker: 'MAKER', whale: 'WHALE', degen_king: 'DEGEN', legendary: 'LEGEND',
  }
  return map[tier ?? ''] ?? ''
}

export const tierName = (tier?: string) => {
  const map: Record<string, string> = {
    paper_hands: 'Paper Hands', retail: 'Retail', swing_trader: 'Swing Trader',
    market_maker: 'Market Maker', whale: 'Whale', degen_king: 'Degen King', legendary: 'Legendary',
  }
  return map[tier ?? ''] ?? 'Unranked'
}
