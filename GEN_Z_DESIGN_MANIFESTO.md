# Gen Z App Design Manifesto

**A reusable design prompt for building screens that feel fast, addictive, and high-status.**

Derived from deep analysis of: Robinhood, Cash App, Discord, TikTok, Duolingo, Clash Royale, Brawl Stars, BeReal, Revolut, and Spotify Wrapped.

---

## 1. Speed Perception

The app must FEEL instant, even when it isn't. Users judge speed in the first 100ms.

### Rules

| Technique | Timing | Implementation |
|---|---|---|
| Skeleton screens | Show within 50ms of navigation | Gray shimmer placeholders that mirror final layout. Pulse animation: `opacity 0.2 -> 1.0`, 1.2s ease-in-out infinite. Users perceive skeleton screens as 20% faster than spinners for identical wait times. |
| Optimistic updates | 0ms | Reflect the action in UI immediately, reconcile with server after. Robinhood shows your trade as "filled" before confirmation. |
| Staggered entry | 30-50ms per item | Cards/rows animate in sequentially, not all at once. `translateY(12px) -> 0` with 30ms stagger per element. |
| Tap feedback | < 16ms (1 frame) | Background color shift on press. `scale(0.97)` on `:active`. No tap delay: use `-webkit-tap-highlight-color: transparent` and `touch-action: manipulation`. |
| Preloading | Before user navigates | Prefetch the next likely screen's data on hover/focus. TikTok preloads the next 2-3 videos. |
| Transition duration | 200-350ms | Any longer feels sluggish. Any shorter feels jarring. Use `ease-out` for elements entering, `ease-in` for elements leaving. |
| Page transitions | 250ms max | Shared element transitions where possible. New content slides/fades in; old content fades out simultaneously (no sequential animation). |

### Easing Curves

```
Micro-interactions (buttons, toggles):  cubic-bezier(0.25, 0.1, 0.25, 1.0)   // 150-200ms
Screen transitions:                     cubic-bezier(0.4, 0.0, 0.2, 1.0)     // 250-300ms
Spring/bounce (celebrations):           cubic-bezier(0.34, 1.56, 0.64, 1.0)   // 400-600ms
Dismissals:                             cubic-bezier(0.4, 0.0, 1.0, 1.0)     // 150-200ms
```

### Spring Animation Parameters (Framer Motion)

```ts
// Snappy feedback (button press, toggle)
{ type: "spring", stiffness: 500, damping: 30 }

// Smooth entry (cards, modals)
{ type: "spring", stiffness: 300, damping: 25 }

// Bouncy celebration (rank-up, achievement)
{ type: "spring", stiffness: 200, damping: 15, bounce: 0.4 }

// Gentle settle (drawer, sheet)
{ type: "spring", stiffness: 250, damping: 20 }
```

---

## 2. Information Hierarchy

One number. One action. Per screen.

TikTok's entire home screen is ONE video with a single scroll gesture. Robinhood's portfolio screen is ONE number (your total balance) at 48px. Cash App's home screen is ONE input field. Copy this relentlessly.

### The Hierarchy Stack

```
Layer 1: THE NUMBER        48-64px, font-weight 700, mono font, top 20% of screen
Layer 2: Context label      12-14px, font-weight 400, muted color, directly above/below the number
Layer 3: Primary CTA        Full-width or centered, 48-56px height, accent color
Layer 4: Supporting data    Cards/list below fold, 14-16px, secondary text color
Layer 5: Navigation         Sticky bottom bar, 5 items max, icon + 10px label
```

### Specific Ratios

- **Hero number to body text ratio**: 3.5:1 minimum (e.g., 56px number vs 16px body)
- **Heading to subheading**: 1.5-2:1 (e.g., 32px heading, 16-20px subheading)
- **Maximum items visible before scroll**: 5-7 (Miller's Law)
- **Cards per row on mobile**: 1 (full-width) or 2 max
- **Data points per card**: 3 max (primary value, label, trend indicator)
- **CTA buttons per screen**: 1 primary, 1 secondary max. Never 3.

### The "Squint Test"

If you squint at the screen and can't immediately identify: (1) the primary number/status, (2) the main action to take -- the hierarchy is wrong. Blur your Figma frame to 10px gaussian and check.

---

## 3. Color Psychology

### Dark Mode Depth System (5 Layers)

```
Layer 0 — True background:    #0A0A0A    (app bg, "the void")
Layer 1 — Surface:            #111111    (cards, containers)
Layer 2 — Elevated surface:   #1A1A1A    (modals, dropdowns, active cards)
Layer 3 — Hover/active:       #222222    (hover states, selected items)
Layer 4 — Borders:            #2A2A2A    (dividers, card borders)
```

Each layer is +6-8% luminance from the previous. Never use pure black (#000) for backgrounds (Discord/Material Design both avoid it). The darkest surface should be #0A0A0A-#121212.

In dark mode, elevation = lightness. Higher = lighter. The opposite of light mode's shadow model.

### PnL Color System

```
Profit (green):    #00DC82   — bright, saturated, optimistic
Loss (red):        #FF4466   — warm red, not aggressive crimson
Neutral:           #888888   — desaturated, doesn't compete
Positive subtle:   rgba(0, 220, 130, 0.10)   — green tint for bg
Negative subtle:   rgba(255, 68, 102, 0.10)  — red tint for bg
```

**Robinhood's insight**: Green is ALWAYS the dominant accent. Even in the brand. This creates a subconscious association: "this app = gains." Use your profit color as 60% of your accent usage, loss color only when displaying actual losses.

**Colorblind-safe**: Always pair color with a symbol. Up arrow + green, down arrow + red. Never rely on color alone. Provide an accessible-colors toggle (Robinhood does this).

### Accent Color Usage Rule

```
60% — Primary accent (#F5A0D0 pink for Battle Trade)
25% — Profit green (#00DC82)
10% — Supporting (blue #7B93DB, gold #FFD700)
5%  — Loss red (only on actual negative numbers)
```

### Glow & Emphasis

```css
/* Accent glow for CTAs and highlights */
box-shadow: 0 0 20px rgba(245, 160, 208, 0.15),
            0 0 60px rgba(245, 160, 208, 0.05);

/* Profit glow for positive numbers */
text-shadow: 0 0 20px rgba(0, 220, 130, 0.3);

/* Status glow for live indicators */
box-shadow: 0 0 8px rgba(0, 220, 130, 0.4);
animation: pulse 1.6s ease-in-out infinite;
```

---

## 4. Typography That Hits

### The Three-Font Stack

| Role | Font | Usage |
|---|---|---|
| Display | Bebas Neue (or condensed sans) | Headlines, hero text, rank labels. ALL CAPS. Tight tracking (-0.02em). |
| Body | DM Sans (or geometric sans) | Everything else. Clean, modern, high x-height. |
| Data | JetBrains Mono (or tabular mono) | Numbers, prices, PnL, timers, codes. Fixed-width for alignment. |

### Size Scale (Mobile-First)

```
Hero number:     56px / weight 700 / mono / line-height 1.0
Page title:      32px / weight 700 / display / line-height 1.1
Section header:  20px / weight 600 / body / line-height 1.3
Card title:      16px / weight 600 / body / line-height 1.4
Body text:       14px / weight 400 / body / line-height 1.5
Caption/label:   12px / weight 500 / body / line-height 1.4 / uppercase tracking 0.05em
Micro label:     10px / weight 600 / body / line-height 1.2 / uppercase tracking 0.08em
```

### Weight Contrast Rule

The minimum weight jump between hierarchy levels is 200 (e.g., 400 body to 600 title). Within a card, use exactly 2 weights: 400 for descriptions, 600 for titles/values. Never use 300 on dark backgrounds (thin text bleeds on OLED, per APCA research).

### Number Formatting

- Always use tabular figures (`font-variant-numeric: tabular-nums`)
- Prices: 2-6 decimal places, right-aligned
- PnL: prefix with `+` for gains, display sign always
- Large numbers: comma-separated (`1,234.56`), never abbreviate below 1M
- Percentages: 1 decimal place max (`+12.4%`)

---

## 5. Dopamine Loops

### The Trigger-Action-Reward Cycle

Every interaction should complete this cycle in under 2 seconds:

```
TRIGGER  -->  ACTION  -->  VARIABLE REWARD  -->  INVESTMENT
notification   open app    see new rank           check PnL
red dot        tap it      surprise content        scroll more
CTA button     place trade confirmation + number   track position
```

### Streak System (Duolingo Model)

Users who maintain a 7-day streak are 3.6x more likely to stay engaged long-term.

```
Day marker:        Filled circle (done) vs outline circle (pending)
Streak counter:    Fire emoji + number, prominent in header
Streak freeze:     "Save your streak" modal with urgency
Milestone:         7, 30, 100, 365 days — each with unique celebration
Streak at risk:    Push notification + in-app banner, warm orange color
```

### Celebration Animations

| Event | Animation | Duration |
|---|---|---|
| Trade placed | Checkmark draws in + subtle pulse | 400ms |
| Position in profit | Number color transitions green + brief glow | 300ms |
| Rank up | Full-screen confetti/particles + badge scales up with bounce | 1200ms |
| Streak milestone | Phoenix/fire animation + haptic burst pattern | 1500ms |
| Achievement unlocked | Badge slides from bottom + star burst | 800ms |
| Leaderboard #1 | Crown drops from top + gold particle shower | 1500ms |

### Progress Systems

```
XP bar:            Linear progress, accent color fill, show "X/Y XP" label
Level indicator:   Circular progress ring around avatar, 3px stroke
Daily goal:        3-step progress (bronze/silver/gold completion)
Season pass:       Horizontal track with reward nodes, scroll to see future
```

### Micro-Reward Frequency

- Something positive every 30-60 seconds of active use
- Visual feedback on EVERY tap (color change, scale, ripple)
- Sound/haptic on significant events (trade fill, rank change)
- Never let 3 screens pass without showing progress toward something

---

## 6. Social Proof

### Live Activity Indicators

```
"127 traders online"     — top of lobby, with pulsing green dot
"$2.4M traded today"     — hero stat, updates in real-time
"Jake just went 3x"      — toast notification, slides in from bottom
Activity feed:           — scrolling ticker of recent actions, 1 line each
```

### Real-Time Counter Patterns

```tsx
// Animate number changes (Robinhood-style rolling numbers)
<AnimatedNumber
  value={totalVolume}
  format="$0,0"
  duration={600}
  easing="ease-out"
/>
```

When a number changes, animate the transition. Never jump. Old digits roll up/out, new digits roll up/in. Duration: 400-600ms.

### Social Toast Notifications

```
Position:        Fixed bottom, 16px from edge, above tab bar
Size:            Full-width minus 32px margin, 48px height
Content:         Avatar (24px circle) + "Username did X" + timestamp
Animation:       Slide up 40px + fade in, auto-dismiss after 3s
Stack:           Max 2 visible, older ones compress to 32px then dismiss
```

### Lobby Presence

```
Active avatars:   Stack up to 5 overlapping circles (28px each, -8px overlap)
Overflow:         "+12 more" pill after the stack
Status dots:      Green = active, yellow = idle, none = offline
Typing/trading:   Animated dots or pulsing ring around avatar
```

---

## 7. Touch-First Design

### Thumb Zone Map (For 6.1" - 6.7" screens)

```
+---------------------------+
|     HARD TO REACH         |    Status info, non-interactive
|     (top 20%)             |    headers, display-only data
+---------------------------+
|     REACHABLE             |    Scrollable content area
|     (middle 40%)          |    Cards, lists, data
+---------------------------+
|     EASY / NATURAL        |    Primary CTA, bottom sheet
|     (bottom 40%)          |    triggers, tab bar, FAB
+---------------------------+
```

### Tap Target Sizes

```
Primary CTA button:     48-56px height, full-width or min 160px wide
Icon button:            44x44px minimum (Apple HIG), 48x48px preferred
List row:               56-64px height, full-width tap area
Card:                   Min 120px height on mobile
Tab bar item:           Min 48px wide, 56px tall (icon + label)
Spacing between targets: Min 8px (prevents mis-taps)
```

### Swipe Gestures

```
Swipe to dismiss:       Threshold 40% of width, then auto-complete
Swipe actions (mail):   Reveal 80px action strip, spring-back if < 30%
Pull to refresh:        60px pull distance, haptic at threshold
Horizontal pagination:  Snap to card edges, 85% width cards with peek
Vertical scroll:        12px momentum multiplier, rubber-band at edges
```

### Bottom Sheet Pattern (The "Cash App Drawer")

```
Peek height:      40% of screen (shows header + first actions)
Expanded:         90% of screen (full content, scrollable)
Handle:           40px wide, 4px tall, centered, #333 color
Corner radius:    20px top-left and top-right
Backdrop:         rgba(0, 0, 0, 0.5) with blur(8px)
Spring:           stiffness 300, damping 25
```

---

## 8. Status & Flex

### Shareable Rank Cards (Spotify Wrapped Model)

The single most viral feature any app can build. Spotify Wrapped generates 2+ billion social media impressions per year.

```
Card dimensions:     1080x1920px (IG Story), 1080x1080px (Feed)
Layout:              Bold gradient bg + username + hero stat + rank badge
Typography:          Oversized number (120px+), tight line-height
Brand:               Logo watermark bottom-right, 40% opacity
CTA:                 "Battle Trade" text at bottom for organic reach
Format:              PNG with metadata, or auto-post to IG Stories
```

### Rank Card Content

```
Line 1:   "SEASON 3 RESULTS"        — 14px, uppercase, tracking 0.1em
Line 2:   "+247.3%"                  — 80px, mono, bold, green
Line 3:   "Return this season"       — 14px, muted
Line 4:   "#4 of 128 traders"        — 20px, accent color
Line 5:   [WHALE badge]              — 48px badge icon
Footer:   "battletrade.gg"           — 12px, 40% opacity
```

### Badge & Tier System

```
Tier progression:    Paper Hands -> Retail -> Swing -> Maker -> Whale -> Degen -> Legend
Visual treatment:    Each tier gets unique color + icon + border glow
Badge size:          32px inline, 64px profile, 128px on rank card
Unlock animation:    Old badge shatters/dissolves, new badge materializes with particle effect
Profile ring:        Colored ring around avatar matching current tier (3px stroke)
```

### Tier Visual Language

```
Paper Hands:   #555555, torn paper icon, no glow
Retail:        #CD7F32 (bronze), shopping bag, subtle warm glow
Swing:         #C0C0C0 (silver), pendulum, cool shimmer
Maker:         #F5A0D0 (pink), factory gear, pink pulse
Whale:         #00DC82 (green), whale tail, green aura
Degen:         #F5A0D0 (hot pink), skull/fire, animated flame border
Legend:        #FFFFFF with rainbow chromatic border, crown, particle trail
```

### Screenshot-Worthy Moments

Design these moments so users WANT to screenshot and share:

1. Hitting a new all-time high PnL (full-screen celebration)
2. Reaching a new tier (badge reveal animation)
3. Topping the leaderboard (crown + your name in gold)
4. Season end rank card (auto-generated, share button prominent)
5. Rare achievement unlock (unique visual treatment)

---

## 9. Empty States

Empty states are conversion opportunities, not dead ends.

### The Formula

```
+---------------------------+
|                           |
|      [Illustration]       |    64-80px, accent-tinted, minimal
|                           |
|    Bold headline          |    20px, weight 600
|    One line of context    |    14px, muted color, max 2 lines
|                           |
|    [ Primary CTA ]        |    Full-width accent button
|    Secondary action link  |    Text link below, subtle
|                           |
+---------------------------+
```

### Per-Screen Empty States

| Screen | Headline | CTA |
|---|---|---|
| Portfolio (no positions) | "Your first trade is waiting" | "Browse Markets" |
| Leaderboard (no lobby) | "Join the arena" | "Enter Lobby Code" |
| Activity feed (nothing) | "It's quiet... too quiet" | "Place a Trade" |
| Notifications (empty) | "You're all caught up" | No CTA needed (positive) |
| Search (no results) | "Nothing matches '{query}'" | "Try a different search" |
| Lobby (no members) | "Invite your first opponent" | "Share Invite Link" |

### Anti-Patterns

- Never show a plain "No data" message
- Never show a sad face or negative imagery
- Never leave the CTA off an empty state
- Never make the empty state feel like an error
- Always make the illustration relate to what WILL be there

### Skeleton -> Empty State Transition

```
1. Show skeleton immediately on mount (0ms)
2. After data loads (200-2000ms):
   a. If data exists: crossfade skeleton -> real content (200ms)
   b. If no data: skeleton fades out (150ms) -> empty state fades in (200ms)
3. Never show empty state during loading — always skeleton first
```

---

## 10. The "It" Factor

What separates apps that feel DESIGNED from apps that feel CODED.

### Intentional Asymmetry

Not everything should be centered. Top apps break the grid deliberately:

```
- Left-align hero numbers (Robinhood: portfolio value is left-aligned)
- Offset section headers by 4-8px from content grid
- Use unequal padding: more space above a section than below (64px top, 32px bottom)
- Stagger card sizes in a grid (1 large + 2 small per row, not 3 equal)
```

### Rhythm Breaks

A page should have a RHYTHM — consistent spacing — and then BREAK it for emphasis:

```
Section 1:  24px gap between items    (regular rhythm)
Section 2:  24px gap between items    (continues rhythm)
[HERO STAT BLOCK]                      (48px padding, breaks rhythm)
Section 3:  24px gap between items    (rhythm resumes)
```

The break creates a visual "deep breath" that draws the eye.

### White Space as Status

Premium apps use 2-3x more white space than free apps. This is not wasted space; it's luxury.

```
Budget app:    16px card padding, 8px gaps
Premium app:   24-32px card padding, 16-24px gaps
Ultra premium:  32-48px card padding, 24-32px gaps
```

Battle Trade should sit at "premium" level. Generous padding signals confidence.

### Motion Signature

Every app needs a motion "accent" that appears nowhere else:

```
Robinhood:   The portfolio line chart that draws itself
Cash App:    The money "swoosh" on send
Duolingo:    Duo's animated reactions
Discord:     The "wumpus" idle animations
TikTok:      The logo spin transition
```

**Battle Trade's motion signature** should be: the PnL number that rolls/counts up from 0 to current value on every screen entry, with a subtle glow pulse at the end.

### Contrast Ratios That Pop

For dark UI, the magic is in how FEW things are bright:

```
90% of the screen:   Low contrast (text at 40-60% opacity, borders at 6-12%)
8% of the screen:    Medium contrast (secondary text at 100%, icons)
2% of the screen:    HIGH contrast (primary number, CTA button, accent elements)
```

This creates visual hierarchy through restraint. When everything is bright, nothing is.

### The 2-Second Rule

A new user should understand what to do within 2 seconds of seeing any screen. Test: show the screen to someone for 2 seconds, hide it, ask "what would you do?" If they can't answer, simplify.

### Sound Design (Optional but Powerful)

```
Trade placed:      Short "click" + subtle bass thud (50ms)
Profit milestone:  Ascending chime, 2 notes (200ms)
Rank up:           Victory fanfare, 3-4 notes (600ms)
Error:             Soft "bonk", non-alarming (100ms)
Button tap:        Barely audible tick (30ms)
```

All sounds should be optional and off by default. But when on, they transform the experience.

---

## Quick Reference: The Checklist

Before shipping any screen, verify:

- [ ] **1 hero number** visible without scrolling
- [ ] **1 primary CTA** with 48px+ height in thumb zone
- [ ] **Skeleton screen** renders within 50ms
- [ ] **Tap feedback** on every interactive element (< 16ms)
- [ ] **Max 3 data points** per card
- [ ] **Color hierarchy**: 90% muted, 8% medium, 2% bright
- [ ] **Empty state** with illustration + CTA (no "no data" messages)
- [ ] **Font weights**: exactly 2 per card (400 + 600)
- [ ] **Spacing rhythm** with at least 1 intentional break per scroll
- [ ] **Transition timing** between 200-350ms, ease-out for entry
- [ ] **Bottom 40%** of screen contains all primary actions
- [ ] **Progress toward something** visible on every screen
- [ ] **Squint test** passes (hierarchy clear at 10px blur)
- [ ] **2-second test** passes (intent clear immediately)
- [ ] **Screenshot-worthy** moment exists if this is a results/rank screen

---

## Applying to Battle Trade

Map these principles to Battle Trade's existing design system (`app/design.ts`):

| Principle | Status | Implementation |
|---|---|---|
| Depth layers | DONE | 5-layer system in `design.ts`: bg/surface/elevated/hover/border |
| Hero numbers | DONE | Type scale in `design.ts`, hero 56px mono 700. ONE hero number per screen enforced. |
| Celebrations | DONE | `battle-end-overlay.tsx` — full-screen rank reveal with confetti CSS for #1. `celeb-burst`, `gold-glow` keyframes in globalCSS. |
| Skeleton screens | DONE | `.skeleton` shimmer class in globalCSS. `BtrSkeleton` in `components/ui/index.tsx`. Used across trading terminal, predictions, dashboard. |
| Empty states | DONE | Dashboard, duel, predictions panel all have contextual empty states with CTAs. |
| Shareable cards | DONE | `recap-card.tsx` — 360x640 "Spotify Wrapped for trading" card with hero return %, rank badge, stats grid, BTR tier, share button. |
| Streaks | DONE | `streak-badge.tsx` — fire animation at 2+, pulse at 3-4, shake at 5+. `streakStyle()` helper + keyframes in `design.ts`. |
| Battle end + Rematch | DONE | `battle-end-overlay.tsx` — rank reveal, return %, REMATCH (primary), VIEW RECAP, back to dashboard. |
| Social proof | DONE | Dashboard shows live player count + battles live with pulsing green dot. `/api/activity` returns `activePlayers`, `battlesCompleted`. |
| Motion signature | DONE | PnL rolling counter on dashboard (rAF spring animation). `count-up` keyframe in globalCSS. |
| Bottom sheets | PARTIAL | Mobile trading terminal uses tab-based layout. Full bottom sheet component not yet built. |
| Sound | NOT STARTED | Optional sound pack for trades, rank-ups. Low priority. |

---

*This manifesto is a living document. Update it as the design evolves. Every screen should be measured against these principles before shipping.*
