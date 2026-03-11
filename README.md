# Battle Trade

Trading arena platform — "Clash Royale for trading." Gamified competition driving real DEX order flow.

## Stack

Next.js 16 (App Router) / TypeScript strict / Supabase / Privy Auth / Tailwind v4 / Framer Motion / Zustand / Jest

## Quick Start

```bash
npm install
cp .env.example .env.local    # fill in Supabase + Privy keys
npx supabase start && npx supabase db push
npm run dev                    # http://localhost:3000
npm test                       # 203 tests
```

## Architecture

Everything is **lobby-scoped**. A lobby is a battle instance (IRL event or digital arena).

```
app/api/lobby/[id]/    → positions, leaderboard, sabotage, chat, admin, bracket
app/api/lobbies/       → list, create, quickplay, practice
app/api/duels/         → 1v1 matchmaking
app/api/copy-trading/  → leaders, subscribe, portfolio
app/api/btr/           → Battle Trade Rating
app/api/guest/         → no-auth guest play
lib/                   → pnl, scoring, auto-admin, weapons, btr, duels, brackets,
                         compliance, copy-trading, integrity, exchanges, offline
```

## Game Modes

| Mode | Description |
|---|---|
| Practice | vs AI bots, auto-admin game loop |
| Quick Play | Instant matchmaking |
| 1v1 Duel | BTR-matched head-to-head |
| Tournament | Bracket elimination |
| Custom | Host with custom rules |

## Key APIs

| Endpoint | Method | Description |
|---|---|---|
| `/api/lobbies/active` | GET | List lobbies |
| `/api/lobbies/practice` | POST | Create practice lobby with bots |
| `/api/lobby/[id]/positions` | POST | Open position |
| `/api/lobby/[id]/leaderboard` | GET | Live standings |
| `/api/lobby/[id]/sabotage` | POST | Launch attack |
| `/api/duels/queue` | POST | Enter matchmaking |
| `/api/btr/[profileId]` | GET | BTR rating |
| `/api/copy-trading/leaders` | GET | Top 20 leaders |

## Environment

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_PRIVY_APP_ID=
STRIPE_SECRET_KEY=             # optional
COINBASE_COMMERCE_API_KEY=     # optional
```
