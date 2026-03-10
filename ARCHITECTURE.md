# Battle Trade — Technical Architecture

> **For engineering teams.** Complete system reference covering every layer from database to real-time broadcast.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Database Schema](#4-database-schema)
5. [Authentication Flow](#5-authentication-flow)
6. [Game Loop](#6-game-loop)
7. [Price Feed Pipeline](#7-price-feed-pipeline)
8. [Trading Engine](#8-trading-engine)
9. [Sabotage & Weapons System](#9-sabotage--weapons-system)
10. [Prediction Markets](#10-prediction-markets)
11. [Real-Time Architecture](#11-real-time-architecture)
12. [Broadcast & Spectator System](#12-broadcast--spectator-system)
13. [Payments & Revenue](#13-payments--revenue)
14. [Reputation & Ranking](#14-reputation--ranking)
15. [API Reference](#15-api-reference)
16. [Environment Variables](#16-environment-variables)
17. [Deployment](#17-deployment)

---

## 1. System Overview

Battle Trade is a multiplayer trading arena where players compete in real-time using live market prices. Players open leveraged positions, sabotage opponents with weapon cards, and bet on outcomes — all within timed rounds with progressive elimination.

### Core Loop

```
Create Lobby → Players Join → Countdown → Round Starts → Trade + Sabotage → Round Ends
    → Eliminate Bottom X% → Next Round → ... → Final Round → Winner → Prize Distribution
```

### Five Audiences

| Audience | Role | Primary View |
|----------|------|-------------|
| **Player** | Trades, attacks, defends | `/lobby/[id]/trade` |
| **Spectator** | Watches, bets, drops weapons | `/lobby/[id]/spectate` |
| **Broadcaster** | Streams via OBS | `/lobby/[id]/broadcast` |
| **Caster** | Commentates with intel dashboard | `/lobby/[id]/cast` |
| **Operator** | Hosts event, controls rounds | `/lobby/[id]/admin` |

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript (strict) | 5.x |
| UI | React | 19.2.3 |
| Styling | Tailwind CSS + Inline Styles | v4 |
| Animation | Framer Motion | 12.35 |
| State | Zustand | 5.0.11 |
| Database | Supabase (PostgreSQL) | — |
| Real-time | Supabase Realtime (WebSocket) | — |
| Auth | Privy (social + wallet) | 3.16.0 |
| Payments | Stripe + Coinbase Commerce | 20.4.1 |
| Price Feeds | Pyth Network + Binance REST | — |
| Validation | Zod | 4.3.6 |
| Testing | Jest + ts-jest | — |

---

## 3. Project Structure

```
battle-trade/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Landing page
│   ├── layout.tsx                # Root layout (fonts, providers)
│   ├── design.ts                 # Design system tokens
│   ├── login/page.tsx            # Privy auth
│   ├── dashboard/page.tsx        # User home
│   ├── create/page.tsx           # Lobby creation wizard
│   ├── markets/page.tsx          # Browse active battles
│   ├── lab/page.tsx              # Community strategies
│   ├── learn/page.tsx            # Education
│   ├── profile/page.tsx          # User profile
│   ├── profile/[id]/page.tsx     # Public profile
│   ├── register/[lobby_id]/      # Lobby registration
│   ├── lobby/[id]/
│   │   ├── page.tsx              # Lobby hub (join/spectate)
│   │   ├── trade/page.tsx        # Trading terminal
│   │   ├── spectate/page.tsx     # Spectator view
│   │   ├── broadcast/page.tsx    # OBS overlay (1920×1080)
│   │   ├── cast/page.tsx         # Commentary dashboard
│   │   ├── stage/page.tsx        # Venue screen
│   │   ├── admin/page.tsx        # Admin control panel
│   │   ├── leaderboard/page.tsx  # Live standings
│   │   └── recap/page.tsx        # Post-game recap
│   └── api/                      # API Routes (see §15)
│
├── lib/                          # Core business logic
│   ├── auto-admin.ts             # Game loop automation
│   ├── pnl.ts                    # P&L calculations
│   ├── scoring.ts                # Leaderboard generation
│   ├── lobby.ts                  # Lobby CRUD
│   ├── prices.ts                 # Pyth + Binance feed
│   ├── pyth-feeds.ts             # 60+ asset feed catalog
│   ├── trade-executor.ts         # Paper + DEX execution
│   ├── volatility-engine.ts      # 9 event types + price mods
│   ├── sabotage.ts               # Attack/defense mechanics
│   ├── weapons.ts                # Weapon definitions (SSOT)
│   ├── prediction-markets.ts     # Market lifecycle + odds
│   ├── liquidation.ts            # Auto-liquidation (90% margin)
│   ├── entry-fees.ts             # Fee collection + prize pool
│   ├── payments.ts               # Stripe + Coinbase
│   ├── auth.ts                   # Profile mgmt + badges
│   ├── reputation.ts             # TR score algorithm
│   ├── supabase.ts               # Client singleton
│   ├── supabase-server.ts        # Server singleton (service role)
│   ├── validation.ts             # Zod schemas
│   ├── rate-limit.ts             # Per-IP rate limiting
│   └── ...                       # See full list in §3
│
├── components/
│   ├── providers.tsx              # PrivyProvider wrapper
│   ├── cockpit/                   # Trading terminal components
│   │   ├── trading-terminal.tsx   # Main terminal (111KB)
│   │   ├── top-bar.tsx            # Timer, prices
│   │   ├── left-column.tsx        # Leaderboard, positions
│   │   ├── center-column.tsx      # Chart, order form
│   │   ├── right-column.tsx       # Orders, credits
│   │   └── overlays.tsx           # Sabotage/defense effects
│   └── broadcast/
│       ├── scanlines.tsx          # CRT overlay effect
│       └── connection-banner.tsx  # Disconnect indicator
│
├── hooks/
│   └── use-broadcast-data.ts     # Real-time data aggregator
│
├── types/
│   └── index.ts                  # All shared interfaces
│
├── supabase/
│   ├── migrations/               # 13 migration files
│   └── seed/                     # Demo data
│
├── middleware.ts                  # Rate limiting on /api/*
├── __tests__/                    # Jest test suites
└── public/brand/                 # Logo assets
```

---

## 4. Database Schema

### Entity Relationship Diagram

```
lobbies ──┬── traders ──┬── positions
          │             ├── sessions
          │             ├── credit_allocations
          │             ├── sabotages (as attacker)
          │             ├── sabotages (as target)
          │             ├── defenses
          │             └── bets
          │
          ├── rounds
          ├── volatility_events
          ├── prediction_markets ── market_outcomes ── bets
          ├── entry_fee_pots ── entry_fee_payouts
          └── audit_logs

profiles ──┬── traders (via profile_id)
           ├── strategies ── strategy_votes
           ├── follows
           ├── daily_stats
           ├── purchases
           └── payouts
```

### Core Tables

#### `lobbies`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | TEXT | Display name |
| format | TEXT | `elimination`, `round_robin`, `blitz` |
| status | TEXT | `waiting`, `active`, `completed` |
| config | JSONB | See LobbyConfig below |
| invite_code | TEXT | 6-char shareable code |
| auto_admin | BOOLEAN | Auto-run game loop |
| min_players | INT | Default 2 |
| max_players | INT | Default 50 |
| entry_fee_amount | DECIMAL | 0 = free |
| created_by | UUID FK → profiles | |

#### `LobbyConfig` (JSONB)
```typescript
{
  starting_balance: number       // Default 10000
  max_leverage: number           // Default 10
  allowed_symbols: string[]      // ['BTC','ETH','SOL',...]
  round_duration_seconds: number // Default 300 (5 min)
  num_rounds: number             // Default 5
  elimination_pct: number        // Default 25 (bottom 25%)
  scoring_mode: string           // 'return_pct' | 'absolute_pnl'
  volatility_engine: boolean     // Enable events
  sabotage_enabled: boolean      // Enable weapons
  prediction_rake_pct: number    // 0-100
  entry_fee: number              // Credits charged on join
  trade_execution_mode: string   // 'paper' | 'sponsor_api'
}
```

#### `traders`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| lobby_id | UUID FK → lobbies | |
| profile_id | UUID FK → profiles | |
| display_name | TEXT | |
| status | TEXT | `active`, `eliminated`, `disconnected` |
| starting_balance | DECIMAL | From config |
| current_balance | DECIMAL | Updated on trade close |
| is_competitor | BOOLEAN | false = spectator |

#### `rounds`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| lobby_id | UUID FK → lobbies | |
| number | INT | Sequential |
| status | TEXT | `pending`, `active`, `frozen`, `completed` |
| started_at | TIMESTAMP | |
| ended_at | TIMESTAMP | |
| duration_seconds | INT | From config |

#### `positions`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| trader_id | UUID FK → traders | |
| round_id | UUID FK → rounds | |
| symbol | TEXT | e.g. `BTC` |
| side | TEXT | `long` or `short` |
| size | DECIMAL | Position size |
| entry_price | DECIMAL | |
| exit_price | DECIMAL | NULL if open |
| leverage | INT | 1-100x |
| realized_pnl | DECIMAL | Set on close |
| order_type | TEXT | `market`, `limit`, `stop_limit`, `trailing_stop` |
| limit_price | DECIMAL | For limit orders |
| stop_price | DECIMAL | For stop orders |
| status | TEXT | `open`, `closed`, `liquidated`, `pending` |

#### `profiles`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| auth_user_id | TEXT | Privy user ID |
| display_name | TEXT | |
| handle | TEXT | Unique @handle |
| email | TEXT | |
| wallet_address | TEXT | |
| tr_score | INT | Reputation (0-100) |
| rank_tier | TEXT | `paper_hands` → `legendary` |
| credits | INT | Earned credits |
| total_wins | INT | |
| total_lobbies_played | INT | |
| win_rate | DECIMAL | |
| best_return | DECIMAL | |
| badges | JSONB | Array of earned badges |

#### `sabotages`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| lobby_id | UUID FK | |
| attacker_id | UUID FK → traders | |
| target_id | UUID FK → traders | |
| type | TEXT | Weapon type |
| cost | INT | Credits spent |
| status | TEXT | `hit`, `blocked`, `deflected` |
| duration_seconds | INT | Effect duration |
| payload | JSONB | Type-specific data |

#### `prediction_markets`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| lobby_id | UUID FK | |
| round_id | UUID FK | |
| question | TEXT | "Who wins Round 3?" |
| status | TEXT | `open`, `locked`, `resolved` |
| total_volume | INT | Total credits bet |
| total_rake | INT | Platform revenue |

---

## 5. Authentication Flow

```
┌─────────┐     ┌──────────┐     ┌────────────┐     ┌──────────┐
│ Landing  │────→│  Privy   │────→│  Profile   │────→│Dashboard │
│  Page    │     │  Modal   │     │  Creation  │     │          │
└─────────┘     └──────────┘     └────────────┘     └──────────┘
                Google/Apple/      getOrCreate        localStorage
                Email/Wallet       Profile()          bt_profile_id
```

1. User clicks "Sign In" → Privy modal opens
2. Privy handles OAuth/email/wallet auth
3. On success, `getOrCreateProfile(privyUser)` runs:
   - Checks `profiles.auth_user_id` for existing profile
   - If none, creates new profile (display name from Google/email/wallet)
4. Profile ID stored in `localStorage('bt_profile_id')`
5. Redirect to `/dashboard`

**Spectator Quick Join** (no auth required):
- `POST /api/lobby/[id]/spectate-join` creates anonymous profile + trader + 500 credits
- Returns trader_id for immediate spectating

---

## 6. Game Loop

### State Machine

```
LOBBY                    ROUND                    GAME
┌──────────┐            ┌─────────┐              ┌──────────┐
│ waiting  │───start───→│ pending │              │          │
└──────────┘            └────┬────┘              │          │
                             │                    │          │
                        ┌────▼────┐              │ active   │
                        │ active  │──duration──→ │          │
                        └────┬────┘              │          │
                             │                    │          │
                        ┌────▼────┐              │          │
                        │ frozen  │──elim──→     │          │
                        └────┬────┘              │          │
                             │                    │          │
                        ┌────▼─────┐             │          │
                        │completed │──next?──→   │          │
                        └──────────┘             └──────────┘
                             │ no more                │
                             └────────────────────────▼
                                               ┌──────────┐
                                               │completed  │
                                               └──────────┘
```

### Detailed Flow (`lib/auto-admin.ts`)

```
1. Lobby created (status: waiting)
2. Players register via POST /api/lobby/[id]/register
   → Creates trader + session + credit_allocations
3. When player_count >= min_players:
   → 30-second countdown starts (auto_start_countdown)
4. startAutoAdmin(lobbyId) fires:

   ROUND LOOP:
   ┌─────────────────────────────────────────────────┐
   │ a. Create round N (status: pending)             │
   │ b. Start round (status: active)                 │
   │    → Start price feed (Pyth + Binance)          │
   │    → Broadcast: round_started                   │
   │ c. Wait round_duration_seconds                  │
   │ d. Freeze round (status: frozen)                │
   │ e. Calculate standings (getRoundStandings)       │
   │ f. Eliminate bottom elimination_pct%             │
   │    → Mark traders as eliminated                 │
   │    → Broadcast: elimination                     │
   │ g. Complete round (status: completed)            │
   │ h. If alive_players <= 1: → GAME OVER           │
   │ i. 15-second intermission                       │
   │    → Broadcast: intermission + next_round_number│
   │ j. Loop to (a)                                  │
   └─────────────────────────────────────────────────┘

   GAME OVER:
   → Mark lobby status: completed
   → distributePrizePool(lobbyId)
     → 60% to rank 1, 25% to rank 2, 15% to rank 3
   → Update profile stats (wins, lobbies_played)
   → Broadcast: game_complete + final standings
```

---

## 7. Price Feed Pipeline

```
Pyth Network (hermes.pyth.network)
  │
  │  HTTP GET /v2/updates/price/latest
  │  Batched: 50 feed IDs per request
  │  Polling: every 2 seconds
  │
  ▼
┌──────────────────┐
│ latestPrices Map │  In-memory cache
└────────┬─────────┘
         │
         │  flushPricesToSupabase()
         │  Upsert by symbol
         │
         ▼
┌──────────────────┐     ┌─────────────────────┐
│  prices table    │────→│ Supabase Realtime    │
│  (PostgreSQL)    │     │ bc-{id}-prices       │
└──────────────────┘     └────────┬────────────┘
                                  │
         ┌────────────────────────┼────────────────────┐
         │                        │                     │
         ▼                        ▼                     ▼
   Trading Terminal        Broadcast Views        Liquidation Engine
   (PnL calculation)       (useBroadcastData)     (shouldLiquidate)
```

### Volatility Event Price Modification

```
Base Price from DB
       │
       ▼
VolatilityEngine.getModifiedPrice(asset, basePrice)
       │
       ├── Check activeEvents for matching asset
       │
       ▼
applyPriceModifier(basePrice, event, elapsedSeconds)
       │
       ├── circuit_breaker: freeze at pre-event price
       ├── moon_shot: +20% spike, exponential decay
       ├── volatility_spike: ±random oscillation
       ├── dead_cat: -30% drop, partial recovery
       ├── margin_call: -15% sustained drop
       ├── leverage_surge: +10% amplified move
       ├── wild_card: random walk ±5%
       ├── blackout: price hidden (return NaN)
       └── reversal: invert direction
       │
       ▼
Modified Price → Client
```

### Fallback Chain
- If Pyth data stale (>30s) → Binance REST (BTC/ETH/SOL only)
- If Binance fails → Use last known price
- Stale check runs every 10 seconds

### Asset Catalog (`lib/pyth-feeds.ts`)
60+ feeds across: Crypto (BTC, ETH, SOL, DOGE, ...), Equities (AAPL, TSLA, NVDA, ...), Commodities (Gold, Silver, Oil), Memecoins (PEPE, WIF, BONK)

---

## 8. Trading Engine

### Order Types

| Type | Behavior |
|------|----------|
| `market` | Execute immediately at current price |
| `limit` | Execute when price reaches limit_price |
| `stop_limit` | Activate limit when stop_price hit |
| `trailing_stop` | Dynamic stop that follows price by trail_pct% |

### Execution Flow

```
POST /api/lobby/[id]/positions
       │
       ▼
┌─────────────────┐
│ Validate:       │
│ • Max 3 open    │
│ • Symbol allowed│
│ • Leverage limit│
│ • Not frozen    │
│ • No trading    │
│   halt on asset │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ TradeExecutor   │
│ .execute()      │
│                 │
│ Paper: Insert   │
│ position in DB  │
│                 │
│ DEX (future):   │
│ Submit to       │
│ Jupiter/Hyper   │
└────────┬────────┘
         │
         ▼
Broadcast position
update on Realtime
```

### Liquidation (`lib/liquidation.ts`)
- Runs every 2 seconds on price tick
- Maintenance margin: 90%
- Formula: `unrealizedPnl <= -(margin * 0.9)`
- On liquidation: close position at current price, broadcast to trader

### Trade Executor Abstraction
```typescript
interface TradeExecutor {
  execute(trade: TradeParams): Promise<Position>
  closePosition(positionId: string, price: number): Promise<Position>
}

// Current: PaperOnlyExecutor (simulated)
// Future: SponsorApiExecutor (real DEX via Jupiter/Hyperliquid)
```

---

## 9. Sabotage & Weapons System

### Weapons (`lib/weapons.ts` — Single Source of Truth)

**Attacks (7)**

| Weapon | Cost | Duration | Effect |
|--------|------|----------|--------|
| Blackout | 200 CR | 90s | Lock target's trading screen |
| Fake News | 150 CR | 8s | Broadcast panic headline |
| Leverage Cap | 300 CR | — | Reduce balance by 10% |
| Reveal | 100 CR | 120s | Expose target's positions |
| Trading Halt | 250 CR | 60s | Freeze one asset for target |
| Glitch | 50 CR | 10s | UI chaos on target's screen |
| Forced Trade | 500 CR | — | Insert random position |

**Defenses (5)**

| Defense | Cost | Duration | Effect |
|---------|------|----------|--------|
| Hedge | 150 CR | 120s | Block next attack |
| Stop Loss | 200 CR | 90s | Deflect attack to sender |
| Dark Pool | 300 CR | 180s | Hide from target selection |
| Insurance | 100 CR | 300s | Reduce attack damage 50% |
| Firewall | 250 CR | 60s | Block all attacks |

### Attack Flow

```
Spectator/Player selects weapon + target
       │
       ▼
POST /api/lobby/[id]/sabotage
       │
       ├── Validate credits ≥ cost
       ├── Check 45s cooldown
       ├── Deduct credits
       │
       ▼
Check Target Defenses
       │
       ├── hedge active? → BLOCKED (no effect)
       ├── stop_loss? → DEFLECTED (attack hits sender)
       ├── dark_pool? → TARGET NOT FOUND
       ├── insurance? → REDUCED (50% effect)
       ├── firewall? → BLOCKED
       └── none → HIT
       │
       ▼
applySabotageEffect()
       │
       ├── Modify sessions table (locked, frozen_asset, etc.)
       ├── Schedule auto-cleanup (setTimeout for duration)
       │
       ▼
Broadcast on:
  • t-{targetId} (trader receives attack notification)
  • lobby-{id}-sabotage (everyone sees attack in feed)
```

---

## 10. Prediction Markets

### Market Lifecycle

```
Round Starts → Market Created (open)
       │
       ▼
  Betting Phase
  (spectators + players bet on who wins)
       │
       ▼
  Round Ends → Market Locked
       │
       ▼
  Admin Resolves → Payouts
  (winner determined by standings)
```

### Odds Calculation

```typescript
recalcProbabilities(marketId):
  totalVolume = sum(all outcome volumes)
  for each outcome:
    baseProbability = 1 / outcomeCount          // equal weight
    volumeShare = outcome.volume / totalVolume   // market weight
    probability = base * 0.3 + volumeShare * 0.7 // blended
    odds = 1 / probability
```

### Rake
- Configurable per lobby (default 10%)
- Applied on winning payouts: `netPayout = grossPayout - (grossPayout * rake%)`
- Tracked in `prediction_markets.total_rake`

---

## 11. Real-Time Architecture

### Channel Map

All real-time data flows through Supabase Realtime (WebSocket).

```
POSTGRES CHANGES (database triggers)
├── bc-{lobbyId}-positions    → Position INSERT/UPDATE
├── bc-{lobbyId}-prices       → Price updates
├── bc-{lobbyId}-traders      → Trader status changes
├── bc-{lobbyId}-rounds       → Round lifecycle
└── bc-{lobbyId}-lobby        → Lobby metadata

BROADCAST CHANNELS (custom events)
├── lobby-{lobbyId}-events    → Volatility events
├── lobby-{lobbyId}-sabotage  → Attacks & defenses
├── lobby-{lobbyId}-markets   → Odds updates
├── lobby-{lobbyId}           → Admin volatility events
├── lobby-{lobbyId}-auto      → Auto-admin lifecycle
└── lobby-{lobbyId}-presence  → Connection tracking

TRADER-SPECIFIC
└── t-{traderId}              → Sabotage effects, liquidation
```

### Data Aggregation Hook

`hooks/use-broadcast-data.ts` subscribes to all channels and derives a unified `LobbyState`:

```typescript
interface LobbyState {
  lobby: Lobby
  round: Round | null
  traders: BroadcastTrader[]  // with rankings, PnL
  positions: Position[]
  prices: Map<string, number>
  events: VolatilityEvent[]
  markets: PredictionMarket[]
  sabotages: SabotageEvent[]
  isConnected: boolean
}
```

---

## 12. Broadcast & Spectator System

### View Matrix

| View | Path | Resolution | Interactive | Auth Required |
|------|------|-----------|-------------|---------------|
| **Trade** | `/lobby/[id]/trade` | Responsive | Full trading | Yes |
| **Spectate** | `/lobby/[id]/spectate` | Mobile-first | Bet + sabotage | No (quick-join) |
| **OBS Overlay** | `/lobby/[id]/broadcast` | 1920×1080 | View only | No |
| **Cast** | `/lobby/[id]/cast` | 1920×1080 | View only | No |
| **Stage** | `/lobby/[id]/stage` | 1920×1080 | View only | No |
| **Admin** | `/lobby/[id]/admin` | Responsive | Full control | Yes (password) |

### Broadcast View (`/broadcast`)
OBS browser source overlay with transparent background:
- Top bar: logo, round timer, sponsor
- Left panel: live standings, sabotage feed
- Right panel: prediction market odds
- Bottom: scrolling trade ticker

### Cast View (`/cast`)
Commentary dashboard with three columns:
- Left: Full standings with sparklines
- Center: Narrative feed with AI-generated commentary prompts
- Right: Intel panel (prices, odds, credits, event schedule)

### Stage View (`/stage`)
Venue screen with three states:
- **PRE_SHOW**: Countdown + sponsor strips
- **BETWEEN_ROUNDS**: Standings table + next round countdown
- **CHAMPION**: Winner reveal with confetti + return %

### Spectator View (`/spectate`)
Mobile-first interactive view with three tabs:
- **WATCH**: Live leaderboard with PnL
- **ATTACK**: Weapon selector (spend credits to sabotage)
- **PREDICT**: Betting interface with live odds

### Data Flow

```
Game Loop (auto-admin.ts)
       │
       ├── Writes to DB (rounds, traders, positions)
       │
       ▼
Supabase Realtime
       │
       ├── postgres_changes → bc-{id}-* channels
       ├── broadcast events → lobby-{id}-* channels
       │
       ▼
useBroadcastData hook
       │
       ├── Aggregates into LobbyState
       │
       ▼
┌──────────┬──────────┬──────────┬──────────┐
│Broadcast │  Cast    │  Stage   │ Spectate │
│(OBS)     │(Comment) │(Venue)   │(Mobile)  │
└──────────┴──────────┴──────────┴──────────┘
```

---

## 13. Payments & Revenue

### Revenue Streams

| Stream | Source | Cut |
|--------|--------|-----|
| Entry fees | Players pay to join paid lobbies | 20% rake to platform |
| Prediction rake | Applied to winning bet payouts | Configurable 0-100% |
| Credit purchases | Stripe + Coinbase Commerce | Direct revenue |

### Credit Packages (Stripe)

| Package | Price | Credits | Bonus |
|---------|-------|---------|-------|
| Starter | $4.99 | 500 | — |
| Fighter | $9.99 | 1,000 | — |
| Warrior | $24.99 | 3,000 | +20% |
| Legend | $49.99 | 7,500 | +50% |

### Prize Pool Distribution

```
Entry fees collected
       │
       ├── 20% → Platform rake
       └── 80% → Prize pool
                    │
                    ├── 60% → 1st place
                    ├── 25% → 2nd place
                    └── 15% → 3rd place
```

### Payment Flow

```
Player clicks "Buy Credits"
       │
       ├── Stripe: createStripeCheckout() → Checkout URL
       │   └── Webhook: /api/webhooks/stripe → completePurchase()
       │
       └── Coinbase: createCoinbaseCharge() → Hosted URL
           └── Webhook: /api/webhooks/coinbase → completePurchase()
```

---

## 14. Reputation & Ranking

### TR Score (0-100)

Composite score from 5 components (`lib/reputation.ts`):

| Component | Weight | Measures |
|-----------|--------|----------|
| Performance | 30% | Win rate, avg return, consistency |
| Combat | 20% | Sabotage accuracy, defense success |
| Strategy | 20% | Lab posts, upvotes, community value |
| Community | 15% | Followers, mentoring, activity |
| Streak | 15% | Daily/weekly consistency |

### Rank Tiers

| Tier | TR Range | Color |
|------|----------|-------|
| Paper Hands | 0-14 | #555555 |
| Retail | 15-29 | #CD7F32 (bronze) |
| Swing Trader | 30-49 | #C0C0C0 (silver) |
| Market Maker | 50-69 | #F5A0D0 (pink) |
| Whale | 70-84 | #00DC82 (green) |
| Degen King | 85-94 | #F5A0D0 (hot pink) |
| Legendary | 95-100 | #FFFFFF (white) |

---

## 15. API Reference

### Lobby Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/lobby/create` | Profile | Create new lobby |
| GET | `/api/lobbies/active` | None | List active lobbies |
| GET | `/api/lobby/[id]/info` | None | Lobby details |
| POST | `/api/lobby/[id]/register` | Profile | Join as trader |
| POST | `/api/lobby/[id]/spectate-join` | None | Quick spectator join |

### Trading

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/lobby/[id]/positions` | Trader | List positions |
| POST | `/api/lobby/[id]/positions` | Trader | Open position |
| DELETE | `/api/lobby/[id]/positions` | Trader | Close position |
| POST | `/api/lobby/[id]/positions/fill` | System | Fill pending orders |

### Game Mechanics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/lobby/[id]/leaderboard` | None | Current standings |
| POST | `/api/lobby/[id]/sabotage` | Trader | Launch attack |
| POST | `/api/lobby/[id]/sabotage/defense` | Trader | Deploy defense |
| GET | `/api/lobby/[id]/sabotage/credits` | Trader | Check balance |
| GET | `/api/lobby/[id]/events` | None | List volatility events |
| POST | `/api/lobby/[id]/events` | Admin | Trigger event |

### Prediction Markets

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/lobby/[id]/markets` | None | List markets |
| POST | `/api/lobby/[id]/markets` | Admin | Create market |
| POST | `/api/lobby/[id]/markets/bet` | Trader | Place bet |
| POST | `/api/lobby/[id]/markets/resolve` | Admin | Resolve market |

### Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/lobby/[id]/admin/auto-admin` | Admin | Start game loop |
| POST | `/api/lobby/[id]/admin/round/start` | Admin | Manual round start |
| POST | `/api/lobby/[id]/admin/round/freeze` | Admin | Freeze round |
| POST | `/api/lobby/[id]/admin/round/eliminate` | Admin | Eliminate players |
| POST | `/api/lobby/[id]/admin/distribute` | Admin | Prize distribution |
| POST | `/api/lobby/[id]/admin/liquidate` | Admin | Force liquidation |
| POST | `/api/lobby/[id]/admin/broadcast` | Admin | Send broadcast |
| POST | `/api/lobby/[id]/admin/reset` | Admin | Reset lobby |
| GET | `/api/lobby/[id]/admin/status` | Admin | Lobby status |

### Profile & Social

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/profile/[id]` | None | Profile + history |
| POST | `/api/profile/[id]/follow` | Profile | Follow/unfollow |
| GET | `/api/leaderboard/global` | None | Global rankings |
| GET | `/api/strategies` | None | Lab posts |
| POST | `/api/strategies` | Profile | Create strategy |
| POST | `/api/strategies/[id]/vote` | Profile | Upvote strategy |

### Payments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/lobby/[id]/credits/purchase` | Trader | Buy credits |
| POST | `/api/webhooks/stripe` | Stripe sig | Stripe webhook |
| POST | `/api/webhooks/coinbase` | CB sig | Coinbase webhook |

---

## 16. Environment Variables

```bash
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Auth (required)
NEXT_PUBLIC_PRIVY_APP_ID=clxx...

# Admin (required)
ADMIN_PASSWORD=<generate-unique-per-environment>

# App URL
NEXT_PUBLIC_APP_URL=https://battletrade.gg

# Event branding (optional)
NEXT_PUBLIC_SPONSOR_NAME=
NEXT_PUBLIC_EVENT_NAME=

# Payments (optional — needed for paid lobbies)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
COINBASE_COMMERCE_API_KEY=
COINBASE_WEBHOOK_SECRET=

# Price feeds (optional — defaults built in)
BINANCE_WS_URL=wss://stream.binance.com:9443
```

---

## 17. Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set env vars
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add NEXT_PUBLIC_PRIVY_APP_ID
vercel env add ADMIN_PASSWORD
```

### Supabase Setup

```bash
# Link project
supabase link --project-ref <ref>

# Run all migrations
supabase db push

# Seed demo data (optional)
supabase db seed
```

### Post-Deploy Checklist

- [ ] All env vars set in Vercel dashboard
- [ ] Supabase migrations applied to production DB
- [ ] Privy dashboard: production domain added to allowed origins
- [ ] Stripe webhook endpoint registered (`/api/webhooks/stripe`)
- [ ] Coinbase webhook endpoint registered (`/api/webhooks/coinbase`)
- [ ] Admin password changed from default
- [ ] Test: Create lobby → Join → Start round → Place trade → Close trade
- [ ] Test: Spectator quick join → Watch → Sabotage → Bet

---

*Generated from codebase analysis. Last updated: March 2026.*
