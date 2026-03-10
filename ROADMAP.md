# Battle Trade — Unified Roadmap

## Mission
Make everyone a better trader through competition. Trading has always been a game —
we're just making it honest, accessible, and fun. Financial education shouldn't be
gated behind $25/month newsletters and dry simulators. It should happen naturally,
in the moment, by doing.

## Vision
"Clash Royale for trading" meets "HuggingFace for traders."
- **Compete** — Real-time trading battles with sabotage, events, and stakes
- **Learn** — Every game makes you smarter whether you win or lose
- **Share** — Open platform for strategies, replays, and reputation
- **Earn** — Real money on the line, real order flow to DEXes, real payouts

Target: Gen Z. Both crypto-native and fiat-native. Mobile-first.

---

## The Five Audiences

Every feature should serve at least one of these:

### 1. PLAYER (Trader)
The competitor. Enters matches, opens positions, uses leverage, fires sabotage,
manages risk under pressure. Pays buy-ins, wins prizes. This is the core user.

### 2. SPECTATOR (Fan)
The interactive viewer. Watches live matches on their phone. Bets on outcomes
(prediction markets), launches sabotage attacks on traders using credits, reacts
to events. Monetized through credit purchases. Think: the crowd at a boxing match
who can throw tomatoes.

**What exists:** Mobile-optimized spectator page (`/lobby/[id]/spectate`) with 3 tabs:
- WATCH — Real-time feed of trades, sabotages, events, liquidations
- ATTACK — Buy credits, pick a target, launch sabotage weapons (180s cooldown)
- PREDICT — Bet on round winner with odds, payouts, streak tracking

**What's missing:** Social reactions, chat, clip sharing, educational context on
what's happening, friend spectating ("watch your friend's match").

### 3. BROADCASTER (Streamer / Event Host)
The content creator. Streams matches to Twitch/YouTube or displays on event screens.
Uses the broadcast overlay as an OBS source. Professional, read-only, cinematic.

**What exists:** 1920x1080 OBS overlay (`/lobby/[id]/broadcast`) with:
- Standings panel (top 8 ranked by return %)
- Prediction market odds panel
- Scrolling ticker (trades, sabotages, events)
- Full-screen overlays (volatility events, eliminations, winner confetti)
- Scanlines CRT aesthetic, sponsor logo zone

**What's missing:** Real trade data in ticker (currently hardcoded), commentary tools,
streamer controls (camera angles, spotlight a trader), clip auto-generation,
embed widget for websites, co-stream support.

### 4. CREATOR (Strategy Author / Educator)
The teacher. Publishes strategies, reviews replays, mentors newer players.
Builds reputation through the platform. Think: HuggingFace model authors but for
trading strategies.

**What exists:** Nothing yet. This is Phase 5.

### 5. OPERATOR (Admin / Event Host)
The game master. Creates lobbies, controls rounds, fires events, triggers
eliminations, distributes prizes. For IRL events and managed tournaments.

**What exists:** Full admin panel (`/lobby/[id]/admin`) with round controls,
volatility event presets, leaderboard, revenue dashboard, liquidation trigger.

---

## Completed Work

### Phase 1: Core Game Loop ✅
- [x] Lobby-scoped architecture (create, join, play, invite codes)
- [x] Paper trading engine (PaperOnlyExecutor) with 4 order types
- [x] Sabotage weapons system (7 weapons, cooldowns, shields)
- [x] Volatility events (9 types, manual + algorithmic trigger)
- [x] Prediction markets (mock provider, volume-weighted odds, rake)
- [x] Leaderboard + scoring (returnPct, cumulative, best_round modes)
- [x] Liquidation engine (90% maintenance margin, auto-sweep every 2s)
- [x] Broadcast overlay (1920x1080, OBS-ready, real-time subscriptions)
- [x] Spectator mode (mobile, 3 tabs: watch/attack/predict)
- [x] Admin panel (round controls, events, presets, revenue dashboard)
- [x] 4 lobby presets (IRL Event, Quick Battle, Tournament, Custom)
- [x] 60+ tradeable assets via Pyth Network (crypto, stocks, commodities)
- [x] Credit system (purchases via Stripe + Coinbase Commerce)
- [x] Entry fees with prize pool (60/25/15 split, configurable rake)

### Phase 2: Production Hardening ✅
- [x] Row-level security on all 18 tables
- [x] Zod validation on all API inputs
- [x] Payment webhooks with idempotency (Stripe + Coinbase Commerce)
- [x] Rate limiting + middleware
- [x] Cache-Control headers on read routes
- [x] Binance REST fallback for price feed resilience
- [x] Admin audit logging (all admin actions)
- [x] 195 tests across 8 suites
- [x] OpenAPI 3.0 spec at /api/docs
- [x] Error boundaries + toast system
- [x] WCAG AA contrast, focus-visible, prefers-reduced-motion

---

## Phase 3: Activation & First Game
> **Goal:** A new player is trading within 10 seconds. No signup. No wallet. No friction.

### 3.1 — Zero-friction first game
- [ ] **Guest play** — Anonymous player dropped into a free match instantly
  - No registration, no email, no wallet required
  - Auto-generated handle ("Trader_7x92")
  - Session stored in cookie/localStorage
  - After game ends: "Want to keep your stats? Create a profile."
- [ ] **"PLAY NOW" CTA** — Single dominant button on landing page
  - Replaces current lobby-code-first flow for new users
  - Drops into next available free match (or creates one with bots)
  - Lobby code entry stays for invited/returning players
- [ ] **Bot backfill** — AI traders to fill empty matches
  - Clearly labeled as bots (different avatar style)
  - Realistic but beatable trading behavior
  - Ensures nobody waits in an empty lobby

### 3.2 — Dual identity (crypto + fiat)
- [ ] **Path A: Wallet sign-in** — For crypto-native users
  - Connect Phantom (Solana) or MetaMask/Coinbase Wallet (EVM)
  - Profile auto-populates: ENS/.sol name, on-chain history badge
  - Wallet = identity, used for buy-ins and payouts
- [ ] **Path B: Social sign-in** — For fiat-native users
  - Google / Apple / email magic link
  - No wallet needed to play
  - Can connect wallet later for on-chain features
- [ ] **Both paths converge** — Same match, same experience
  - Internal `profiles` table links both auth methods
  - Neither path feels second-class

### 3.3 — Matchmaking queue
- [ ] **`matchmaking_queue` table** — Player enters queue with preferences
  - Format: blitz (3min) / elimination / marathon
  - Buy-in tier: free / $1 / $5 / $25 / $100
  - Skill band: optional ELO bracket (or open)
- [ ] **Matching service** — Groups players, auto-creates lobby
  - Match when N players ready (4-8 depending on format)
  - 10-second countdown → game starts
  - Backfill with bots if queue is thin (< 30s wait target)
- [ ] **Lobby browser** — Browse open public lobbies
  - Filter by format, buy-in, players needed, time remaining
  - "Join next" quick button for fastest match
  - Show estimated wait time per tier

---

## Phase 4: Money In, Money Out
> **Goal:** Buy-in feels like a bet, not a shopping cart. Payouts are instant.

### 4.1 — Direct buy-in
- [ ] **One-tap match entry** — Player sees "$5 match — winner takes $32"
  - Dollar amounts shown, not credit amounts (credits are internal)
  - Payment at point of entry, not separate "buy credits" step
  - Apple Pay / Google Pay for fiat (Stripe)
  - USDC on Solana or Base for crypto (direct wallet transfer)
  - Wallet balance for returning players with winnings
- [ ] **Buy-in tiers** — Tiered matches with clear stakes
  - Free (practice, still ranked)
  - Micro: $1 entry → ~$6-8 pot
  - Mid: $5 entry → ~$32-40 pot
  - High: $25 entry → ~$160-200 pot
  - Whale: $100 entry → ~$640-800 pot
- [ ] **Credits remain** — But as earned/bonus currency, not primary payment
  - Won from matches, earned from missions, bought as gifts
  - Used for sabotage attacks, prediction bets, cosmetics
  - Not the buy-in mechanism for real-money matches

### 4.2 — Auto prize distribution
- [ ] **Trigger on round/lobby end** — No admin button needed
  - Configurable split per format (default 60/25/15 for top 3)
  - Platform rake per tier (10-20%, lower rake at higher tiers)
  - Transaction fee transparency shown pre-match
- [ ] **Instant payout options**
  - To wallet balance (instant, use for next match)
  - To connected wallet as USDC (on-chain, ~30s)
  - To bank via Stripe Connect (fiat, 1-3 days)
- [ ] **Payout celebration** — Winner animation with dollar amount
  - Shareable win card: "I just won $32 on Battle Trade"
  - Streak tracking: "3rd win today — $89 total"

### 4.3 — USDC payment rail
- [ ] **Direct USDC transfers** — Not Coinbase Commerce multi-coin
  - Solana USDC (low fees, fast confirmation)
  - Base USDC (EVM-compatible, Coinbase ecosystem)
  - Wallet approves exact amount → escrow holds until match ends
  - Replaces Coinbase Commerce for crypto-native users
- [ ] **Escrow contract** — Trustless prize pool
  - Entry fees held in smart contract, not our database
  - Auto-distributes on round end per ranking
  - Verifiable on-chain: players can audit prize pool

---

## Phase 5: Inline Education (The "Why")
> **Goal:** Every game makes you smarter. Education IS the game, not a separate tab.

### 5.1 — In-the-moment learning
- [ ] **Trade context cards** — Show after every position open/close
  - "You opened a 10x long on BTC. At this leverage, a 10% drop liquidates you."
  - "BTC has moved an average of 2.3% in the last hour. Your liquidation price is 4.8% away."
  - Short, non-blocking, dismissible. Not a popup — inline in the position card.
- [ ] **Event explainers** — When volatility events fire
  - Flash Crash: "Markets drop suddenly. Pro move: close longs or hedge with shorts."
  - Bull Run: "Momentum is up. But FOMO buying at the top is the #1 mistake."
  - Whale Dump: "A large sell order is hitting the market. Spreads widen, slippage increases."
  - Shown to players AND spectators during the event
- [ ] **Liquidation post-mortem** — When a player gets liquidated
  - "You were liquidated. Your 20x leverage meant a 5% drop wiped your margin."
  - "Tip: Most winning players in this format use 3-5x leverage."
  - "Want to practice leverage management? Try the 'Low & Steady' mission."
- [ ] **Asset context** — On hover/tap in the asset selector
  - Brief description: "SOL — Layer 1 blockchain. High volatility."
  - Correlation warnings: "You're already long ETH. SOL is 0.85 correlated — this doubles your risk."
  - Difficulty tags: Beginner / Intermediate / Expert
  - Recent behavior: "Up 12% this week, volatile after protocol upgrade"

### 5.2 — Post-round coaching (Recap page)
- [ ] **Trade-by-trade breakdown** — Every decision analyzed
  - Timeline: entry price → events that happened → exit/liquidation
  - Risk score per trade (based on leverage, timing, correlation)
  - "This trade was high-risk because..." one-liner per position
- [ ] **Winner comparison** — "Here's what 1st place did differently"
  - Side-by-side: your leverage vs theirs, your timing vs theirs
  - "They closed before the Flash Crash. You held through it."
  - Anonymized if privacy settings enabled
- [ ] **Improvement suggestions** — Personalized, actionable
  - "Your average leverage was 15x. Try keeping it under 5x next game."
  - "You traded 1 asset. Diversifying across 2-3 reduces event risk."
  - Link to a mission that practices the skill

### 5.3 — Missions & challenges
- [ ] **Skill-based missions** — Gamified education quests
  - "Survive a Black Swan" — Play a round where a crash happens, don't get liquidated
  - "Low & Steady" — Win a match using only ≤3x leverage
  - "Diversifier" — Hold positions in 3+ asset classes simultaneously
  - "Event Surfer" — Profit during 2 consecutive volatility events
  - "Hedge Master" — Hold both a long and short position profitably
- [ ] **XP and progression** — Reward learning, not just winning
  - XP for completing missions, playing matches, learning milestones
  - Levels unlock: higher buy-in tiers, new sabotage weapons, cosmetics
  - Visible on profile: "Level 23 Trader"
- [ ] **Achievement badges** — Permanent profile decorations
  - "Iron Hands" — Never panic-sold during a crash
  - "Sniper" — 5 trades in a row with positive PnL
  - "Educator" — Shared 10 strategies that got forked
  - Displayed on public profile and in-match nameplates

---

## Phase 6: Social & Spectator Evolution
> **Goal:** Trading is a team sport. Watching is as fun as playing.

### 6.1 — Social graph
- [ ] **Friends system** — Add players you've competed against
  - Post-match: "Add [player] as friend?"
  - See when friends are online/in-match
  - "Your friend just started a $5 blitz — join?"
- [ ] **Crews / clans** — Team-based competition
  - Create or join a crew (4-8 members)
  - Crew vs crew matches (aggregate score)
  - Crew leaderboard, crew chat, shared strategy library
  - Crew XP and level progression
- [ ] **Rivals** — Automatic rival detection
  - "You've played against [player] 5 times. They're 3-2 against you."
  - Rival matches shown in feed, notifications on rival activity
- [ ] **In-match reactions** — Lightweight social during games
  - Emoji reactions visible to all players (😤🔥💀🚀)
  - Triggered by events: auto-suggest 🔥 when someone 5x's
  - Spectators can react too (shown in broadcast ticker)
- [ ] **Notifications** — Push/email for re-engagement
  - "Your friend is playing — watch or join"
  - "New $5 blitz starting in 2 minutes"
  - "You're 1 win away from Level 15"
  - "Your strategy got forked 3 times today"

### 6.2 — Spectator upgrades
- [ ] **Live spectator chat** — Real-time during matches
  - Text chat + emoji reactions in WATCH tab
  - Moderated (auto-filter + report)
  - Visible in broadcast ticker overlay
- [ ] **Spectator education** — Learn by watching
  - Same event explainers shown to spectators
  - "Player X just opened a 20x short — here's why that's risky"
  - Post-match: "The winner's strategy was..." breakdown
- [ ] **Friend spectating** — Watch friends play
  - Notification: "Your friend [name] is in a match — watch?"
  - One-tap spectate from friends list
- [ ] **Spectator-to-player pipeline** — Convert watchers to players
  - "Think you could do better? Join the next match" CTA after every round
  - Spectator stats: "You predicted 4/5 winners — you clearly know trading"

### 6.3 — Broadcast upgrades
- [ ] **Real ticker data** — Wire actual trades/sabotages into scrolling ticker
  - Currently hardcoded; needs real-time feed from position + sabotage events
- [ ] **Streamer tools**
  - Spotlight mode: zoom into one trader's positions
  - Custom overlays: streamer can add their branding
  - Commentary audio channel support
  - Co-stream: multiple commentators on same match
- [ ] **Clip auto-generation** — Shareable 15-second moments
  - Auto-detect highlight moments: liquidations, 5x+, sabotage hits, event reactions
  - Generate shareable clip with Battle Trade branding
  - One-tap share to Twitter/TikTok/Discord
  - Embed widget for websites/blogs
- [ ] **Event screen mode** — For IRL conferences/events
  - Large-format optimized (projector/TV)
  - QR code overlay to join as spectator
  - Sponsor integration: logo placement, sponsored events
- [ ] **OBS plugin** — Native integration for streamers
  - Drag-and-drop overlay components
  - Auto-connect to lobby by ID
  - Alert customization (sounds, animations)

---

## Phase 7: On-chain Integration & Order Flow
> **Goal:** Every paper trade can route real volume to a DEX. Attribution earns revenue.

### 7.1 — DEX adapters
- [ ] **Hyperliquid adapter** — First real DEX (perps)
  - Native builder code support → revenue share on all order flow
  - Wire into `PaperPlusOnchainExecutor` and `LiveExecutor`
  - Testnet first (`LIVE_DEX_API_URL` + `LIVE_DEX_API_KEY`)
  - Position mirroring: paper trade recorded + real order placed
- [ ] **Jupiter adapter** — Solana spot + perps
  - Referral fee program for revenue attribution
  - Swap API integration for spot trades
  - Solana wallet required for live mode
- [ ] **Chain-agnostic executor interface** — Swap adapters without changing game logic
  - `DexAdapter` interface: `openPosition()`, `closePosition()`, `getStatus()`
  - Config per lobby: which DEX, which chain, testnet/mainnet
  - Builder code passed in every request

### 7.2 — Builder code infrastructure
- [ ] **`builder_code` on positions table** — Track attribution per trade
- [ ] **Builder code in all DEX requests** — Hyperliquid, Jupiter, future integrations
- [ ] **Revenue dashboard** — Track order flow earnings
  - Volume routed per day/week/month
  - Revenue earned from builder codes
  - Breakdown by chain/DEX
- [ ] **Referral tracking** — `referred_by` on traders table
  - Referral links with attribution
  - Referrer earns % of referee's platform fees

### 7.3 — On-chain settlement
- [ ] **USDC escrow contract** — Trustless buy-ins and payouts
  - Deploy on Solana (low fees) and/or Base (EVM)
  - Entry fees held in contract until round ends
  - Auto-distribute per on-chain ranking oracle
- [ ] **On-chain prediction markets** — Deploy contract on Monad
  - Wire `OnChainProvider` (already stubbed, chainId 10143)
  - createMarket / placeBet / resolveMarket / claimWinnings
  - Verifiable odds and payouts
- [ ] **On-chain profiles / reputation** — Optional
  - Trade history as attestations (EAS or similar)
  - Win rate, level, badges as on-chain credentials
  - Portable across platforms

---

## Phase 8: Strategy Platform ("HuggingFace for Traders")
> **Goal:** Open platform where traders share, fork, and improve strategies.

### 8.1 — Strategy profiles
- [ ] **Public trader cards** — Your trading resume
  - Stats: win rate, avg return, Sharpe ratio, max drawdown
  - Favorite assets, average leverage, preferred format
  - Achievement badges, level, crew
  - Match history with mini-charts
- [ ] **Published strategies** — Like model cards
  - Title, description, asset universe, leverage philosophy
  - Event response rules ("I always close longs before a scheduled event")
  - Performance data: how this strategy has performed historically
  - Forkable: other players can copy and modify

### 8.2 — Replay system
- [ ] **Full match replays** — Watch any completed round
  - Scrubable timeline: every trade, event, sabotage, price move
  - Filter by trader: watch only one player's decisions
  - Side-by-side: compare two traders' timelines
- [ ] **"What would you have done?"** — Interactive replay mode
  - Watch a past match unfold in real-time
  - Make your own trades alongside the recording
  - Compare your decisions to what actually happened
  - Score: "You would have placed 2nd" — powerful learning tool
- [ ] **Clip library** — Curated highlight moments
  - Auto-generated from extreme events (big wins, liquidations, clutch sabotage)
  - Community-curated: upvote best clips
  - Embeddable, shareable, tagged by lesson type

### 8.3 — Community
- [ ] **Strategy marketplace** — Browse, rate, fork playbooks
  - Categories: conservative, aggressive, event-focused, diversified
  - Sort by: performance, popularity, recency
  - Comments and discussion per strategy
- [ ] **Mentorship** — Top traders can coach
  - Opt-in: "Available for mentoring"
  - Spectate a mentee's match with private commentary channel
  - Mentor badges and reputation
- [ ] **Clans → trading firms** — Crews that share strategies
  - Shared strategy library within crew
  - Crew tournaments with combined scores
  - Crew analytics: what's working across all members

---

## Phase 9: Dopamine & Retention
> **Goal:** The game is as addictive as TikTok and as rewarding as leveling up.

### 9.1 — Speed
- [ ] **Blitz as default format** — 3-5 minute matches
  - Gen Z attention span demands fast rounds
  - Quick dopamine loops: play → result → play again
  - Longer formats (elimination, marathon) for engaged players
- [ ] **Instant rematch** — "Play again" button on results screen
  - Same format, same buy-in, new opponents
  - One tap back into the queue

### 9.2 — Feel
- [ ] **Sound design** — Audio feedback for every action
  - Trade open: ka-ching
  - Liquidation: crash sound + screen shake
  - Sabotage hit: impact sound + flash
  - Win: triumphant fanfare
  - Event fire: alarm/siren
- [ ] **Haptic feedback** — Mobile vibrations
  - Light: trade confirmation
  - Medium: sabotage received
  - Heavy: liquidation
- [ ] **Screen effects** — Visual dopamine
  - Screen shake on liquidation
  - Confetti on round win (already exists in broadcast)
  - Glow intensifies as PnL grows
  - Red pulse when margin is low

### 9.3 — Loops
- [ ] **Daily challenges** — 3 per day, rotating
  - "Win a blitz match" / "Place a winning prediction bet" / "Trade 3 different assets"
  - Reward: XP + credits
  - Streak bonus: complete all 3 for 5 days straight → bonus reward
- [ ] **Seasonal rankings** — Monthly leaderboard resets
  - End-of-season rewards for top players per tier
  - New season = fresh start, everyone re-engaged
  - Season themes: "Volatility Season", "Low Leverage Challenge"
- [ ] **Win streaks** — Visible, rewarded
  - "🔥 3 WIN STREAK" shown in match + on profile
  - Streak bonus: multiplier on XP earned
  - Losing a streak triggers "revenge match" prompt

---

## Phase 10: Growth & Monetization
> **Goal:** Sustainable business that scales. Education stays free.

### Revenue model (what we charge for)
1. **Entry fee rake** — 10-20% of every buy-in (lower rake at higher tiers)
2. **Prediction market rake** — 10% of winning payouts
3. **DEX order flow** — Builder code revenue share from Hyperliquid, Jupiter, etc.
4. **Cosmetics** — Skins, custom sabotage animations, profile themes (paid credits)
5. **Sponsored lobbies** — B2B: brands fund prize pools, get visibility
6. **Creator program** — Revenue share for streamers/educators who bring players

### What stays free (always)
- All education: coaching, replays, asset context, strategy sharing
- All analytics: your stats, your history, your improvement tracking
- Free-tier matches: unlimited practice games with no buy-in
- Spectating and social features

### Growth engines
- [ ] **Clip virality** — Auto-generated sharable moments → Twitter/TikTok/Discord
- [ ] **Streamer program** — Revenue share for streamers who broadcast matches
- [ ] **Referral system** — Invite friends → both get credits when friend plays first match
- [ ] **API access** — Third parties build on Battle Trade data (leaderboards, widgets)
- [ ] **PWA / mobile app** — Installable, push notifications, native feel
- [ ] **Event partnerships** — Consensus, ETHDenver, TOKEN2049 activations

---

## Build Priority (What to do next)

### Now (unlocks everything)
1. Guest play + "PLAY NOW" button (3.1)
2. Bot backfill for empty matches (3.1)
3. Blitz as default format (9.1)

### Next (unlocks money)
4. Direct buy-in at match entry (4.1)
5. Matchmaking queue (3.3)
6. Auto prize distribution (4.2)
7. USDC payment rail (4.3)

### Then (unlocks retention)
8. Inline trade context cards (5.1)
9. Post-round coaching on recap page (5.2)
10. XP / levels / achievements (5.3)
11. Daily challenges (9.3)
12. Sound + haptics + screen effects (9.2)

### Then (unlocks growth)
13. Clip auto-generation + sharing (6.3)
14. Friends + rivals + notifications (6.1)
15. Real broadcast ticker + streamer tools (6.3)
16. Dual identity — wallet + social sign-in (3.2)

### Then (unlocks revenue at scale)
17. Hyperliquid adapter + builder codes (7.1, 7.2)
18. On-chain escrow (7.3)
19. Strategy profiles + marketplace (8.1, 8.3)
20. Replay system (8.2)

---

## Architecture Notes

### Existing infra that supports this
- **3-tier executor** — `PaperOnly` → `PaperPlusOnchain` → `Live` (lib/trade-executor.ts)
- **Wallet stub** — EVM + Solana connect in lib/wallet.ts
- **OnChainProvider** — Monad testnet stub, chainId 10143 (lib/prediction-markets.ts)
- **Broadcast hook** — 10 real-time Supabase channels (hooks/use-broadcast-data.ts)
- **Credit system** — Allocations, purchases, Stripe + Coinbase Commerce webhooks
- **Entry fees** — chargeEntryFee, distributePrizePool, 60/25/15 split (lib/entry-fees.ts)
- **Pyth price feeds** — 60+ assets, multi-chain oracle (lib/pyth-feeds.ts)
- **Lobby config** — trade_execution_mode, sponsor_api, entry_fee, all per-lobby

### New tables needed
- `matchmaking_queue` — player_id, format, buy_in_tier, skill_band, queued_at
- `friends` — user_a, user_b, status (pending/accepted), created_at
- `crews` — id, name, created_by, xp, level
- `crew_members` — crew_id, trader_id, role (leader/member)
- `missions` — id, type, title, description, criteria_json, xp_reward
- `mission_progress` — trader_id, mission_id, status, progress_json
- `achievements` — id, name, description, icon, criteria_json
- `trader_achievements` — trader_id, achievement_id, earned_at
- `trader_xp` — trader_id, total_xp, level, current_streak
- `clips` — id, lobby_id, round_id, type, start_ts, end_ts, metadata
- `strategies` — id, author_id, title, description, config_json, forked_from
- `strategy_forks` — strategy_id, forker_id, created_at
- `reactions` — lobby_id, trader_id, emoji, created_at
- `chat_messages` — lobby_id, sender_id, message, created_at
