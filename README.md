# Cards Against Humanity Online

![Node](https://img.shields.io/badge/node-20%2B-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/license-CC%20BY--NC--SA-informational)

**▶ Play it now:** https://cards-against-humanity-returns-back.vercel.app/

A full-stack, real-time multiplayer implementation of Cards Against Humanity built with React, Node.js, PostgreSQL, and Socket.IO. Players can create lobbies, share room codes, and play complete games together entirely in the browser.

This project is a **free, fan-made, non-commercial clone built for fun**. It is not affiliated with or endorsed by Cards Against Humanity LLC. See [License & Attribution](#license--attribution) for details.

---

## Preview

![Home](docs/images/home.png)
![Lobby](docs/images/lobby.png)
![Game](docs/images/game.png)

## Highlights

- Real-time multiplayer with Socket.IO
- Hybrid in-memory + PostgreSQL architecture
- Strategy Pattern for interchangeable game modes
- Per-game async locking to prevent race conditions
- Shared package for frontend/backend types
- 205 card packs (~28k cards)
- 130 backend tests

---

## Table of Contents

1. [What is Cards Against Humanity](#what-is-cards-against-humanity)
2. [Features](#features)
3. [Tech Stack](#tech-stack)
4. [Architecture](#architecture)
5. [Project Structure](#project-structure)
6. [Getting Started](#getting-started)
7. [Deployment](#deployment)
8. [Environment Variables](#environment-variables)
9. [Testing](#testing)
10. [License & Attribution](#license--attribution)
11. [Acknowledgments](#acknowledgments)

---

## What is Cards Against Humanity

Cards Against Humanity bills itself as "a party game for horrible people." More precisely, it's an adult card-based party game in which players complete fill-in-the-blank statements using words or phrases typically deemed offensive, risqué, or politically incorrect, printed on playing cards.

Each round, a rotating **Card Czar** reveals a black card containing a prompt with one or more blanks. Every other player chooses white answer cards from their hand to fill in those blanks and submits it face-down. The Czar then reveals all the submissions and picks the combination they find funniest. That player earns a point, the Czar rotates to the next player, and the game continues until someone reaches the winning score.

---

## Features

### Core gameplay

- Play instantly as a guest — no sign-up, or set a username if you want.
- Lobbies hold 3–10 players behind a shareable room code; the host tunes the settings.
- Winning score and max rounds are configurable per lobby.
- Real-time play — submissions, reveals, and scores update live for everyone the instant they happen.

### Game modes

The lobby host picks a mode; the server applies it through a strategy pattern, so modes share a common base and only override what's unique.

| Mode | How it plays |
|------|--------------|
| **Normal** | The classic rules. A rotating Czar judges; the funniest submission wins a point. |
| **Rando Cardrissian** | A random card is auto-submitted from the deck each round. If the Czar picks Rando, nobody wins the round. |
| **Czar Is Dead** | No Czar at all. Every player votes for their favorite submission. Most votes wins a point. |
| **Blank Only** | No real cards — every player writes their own answer on blank cards each round. Same scoring as Normal. Bots are disabled in this mode |

### House rules

House rules are independent toggles on the lobby. They can combine with most game modes.

| Rule | Effect |
|------|--------|
| **Blank Cards** | Each round, players have a chance to draw a blank card they fill in with their own custom text. (Automatically disabled in Blank Only mode, where everything is blank.) |
| **Timed Rounds** | Each round has a configurable countdown. Players who don't submit in time get random cards played for them automatically. |
| **Winner Becomes Czar** | The winner of each round becomes the Czar for the next round. Disabled in modes without a Czar. |

### Social & resilience

- AI-controlled bot players can fill empty seats, automatically submitting cards and judging rounds when applicable.
- Disconnects are handled gracefully: there's a short window to rejoin, and if the host leaves the game hands off or ends cleanly.

### Content

- **205 card packs** (71 official + 134 community/unofficial) seeded into the database.
- Pack selection per lobby (official-only by default, or pick your own mix).
- Blank cards: write your own answers when the house rule is on.

---

## Tech Stack

| Tier | Technology |
|------|------------|
| **Backend** | Node.js · Express 5 · TypeScript 6 · PostgreSQL 16 · Drizzle ORM · Socket.IO 4 · Zod 4 · Winston · bcryptjs |
| **Frontend** | Vite · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui (base-nova theme) · Zustand 5 · socket.io-client · axios · React Router v7 · Sonner |
| **Shared** | `@cah/shared` — a tsup-built (CJS + ESM + types) package of DTOs, types, constants, and error definitions shared by both tiers |
| **Infra** | Turborepo (monorepo orchestration) · Render (backend) · Neon (PostgreSQL) · Vercel (frontend SPA) · Upstash Redis (cache + rate limiting) |

---

## Architecture

The project uses a **hybrid state model** that splits responsibility between memory and the database:

- **Active game state lives in memory** (`Map<gameId, GameState>` inside the backend). Decks, hands, and submissions mutate many times per second, so they stay in RAM for performance. There is no crash recovery—if the server restarts, active games are lost. This avoids hundreds of database writes during active rounds while still persisting long-term game results.
- **Durable data lives in PostgreSQL** — users, lobbies, game records, scores, winners.

A few decisions worth knowing:

- **Per-game lock (`withGameLock`)** serializes async mutations on in-memory state, preventing race conditions (e.g., two submissions resolving concurrently).
- **Socket rooms** are `lobby:<lobbyId>` and `game:<gameId>` — never the room code or user id.
- **Client identity is never trusted from payloads** — Client identity is derived exclusively from the JWT attached during the Socket.IO handshake rather than client-provided payloads.
- **Game modes use the Strategy Pattern** — each mode is a `GameModeStrategy` subclass with a shared base, so new modes are isolated and composable.
- **Modes and house rules are orthogonal** — a mode like *Blank Only* can combine with the *Winner Becomes Czar* rule where it makes sense.

---

## Project Structure

```
.
├── apps/
│   ├── backend/     # Express + Socket.IO API server
│   └── frontend/    # Vite + React SPA
├── packages/
│   └── shared/      # Shared DTOs, types, and constants
├── vercel.json     # SPA rewrites for the Vercel frontend
├── turbo.json      # Turborepo pipeline (build/check-types/test)
└── package.json    # npm workspaces root
```

---

## Getting Started

### Prerequisites

- **Node.js** 20+ (the project pins `npm@11.12.1` via `packageManager`).
- **PostgreSQL** — locally, or a hosted instance (the project uses Neon). A database must exist.
- **Upstash Redis** (optional) — for pack caching, auth caching, and rate limiting. The app runs fine without it.

### 1. Install dependencies

From the repo root (npm workspaces handle all three packages):

```bash
npm install
```

### 2. Configure environment

Create `apps/backend/.env` (gitignored) with at least:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/cah
JWT_SECRET=some-long-random-string
JWT_EXPIRES_IN=1d
CORS_ORIGIN=http://localhost:5173
# UPSTASH_REDIS_REST_URL=...
# UPSTASH_REDIS_REST_TOKEN=...
```

Create `apps/frontend/.env`:

```env
VITE_SERVER_URL=http://localhost:3000
```

### 3. Set up the database

Push the schema and seed the card data:

```bash
cd apps/backend
npx drizzle-kit push
npm run db:seed
```

The seed loads all 205 packs (~28,000 white/black cards and ~31,000 pack relationships).

### 4. Run in development

From the repo root:

```bash
npm run dev
```

This starts the backend (port 3000) and the frontend (Vite, port 5173) together through Turborepo. Open http://localhost:5173.

### 5. Build for production

```bash
npm run build      # turbo build across all workspaces
npm run check-types
npm run test
```

The backend compiles to `apps/backend/dist/index.js`; the frontend builds to `apps/frontend/dist`.

---

## Deployment

The project is designed for a decoupled deployment:

- **Backend** → Render (Node/Express web service)
- **Database** → Neon (PostgreSQL)
- **Frontend** → Vercel (static Vite SPA)
- **Cache / Rate limiting** → Upstash Redis (optional; degrades gracefully)

**Render (backend):**
- Build command: `npm install && npm run build`
- Start command: `npm run start:prod` (runs `node dist/index.js` with `NODE_ENV=production`)
- Health check: `GET /ping`

**Vercel (frontend):**
- Framework: Vite
- Root directory: `apps/frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_SERVER_URL` = your backend URL

---

## Environment Variables

### Backend (`apps/backend/.env`, set in Render)

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Secret for signing auth tokens |
| `JWT_EXPIRES_IN` | No | `1d` | Token lifetime |
| `PORT` | No | `3000` | Set automatically by Render |
| `NODE_ENV` | No | `development` | Set to `production` on Render |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Comma-separated allowed frontend origins |
| `LOGS_PATH` | No | `logs` | Winston log directory |
| `UPSTASH_REDIS_REST_URL` | No | — | Upstash Redis REST URL (enables cache/rate-limit) |
| `UPSTASH_REDIS_REST_TOKEN` | No | — | Upstash Redis REST token |

> Without the Upstash variables, the app still runs — it simply skips caching and rate limiting.

### Frontend (`apps/frontend/.env`, set in Vercel)

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `VITE_SERVER_URL` | No | `http://localhost:3000` | URL of the backend API/socket server |

---

## Testing

The backend includes **130 automated tests** covering:

- authentication
- lobby lifecycle
- game flow
- socket events
- race conditions
- game mode strategies

```bash
npm run test          # turbo test (builds shared first, then runs vitest)
```

Individual suites can be run from `apps/backend`:

```bash
npx vitest run tests/features/game/game-modes/czar-is-dead.test.ts
```


Type checking and linting:

```bash
npm run check-types
npm run lint
```

---

## License & Attribution

This project is a **free, fan-made, non-commercial** clone. It is **not affiliated with, endorsed by, or sponsored by Cards Against Humanity LLC**.

- Some card text is © Cards Against Humanity and is used under the **Creative Commons Attribution-NonCommercial-ShareAlike (CC BY-NC-SA)** license.
- The card dataset shipped in this project was gathered and compiled into plain-text/JSON by **Chris Hallberg** as *"JSON Against Humanity"* and published at [crhallberg.com/cah/](https://crhallberg.com/cah/) (also on GitHub as [json-against-humanity](https://github.com/crhallberg/json-against-humanity)).
- Card content is explicit and intended for **mature audiences (17+)**.

---

## Acknowledgments

- **Chris Hallberg** — for gathering and publishing the Cards Against Humanity card dataset as machine-readable JSON (*"JSON Against Humanity"*) at [crhallberg.com/cah/](https://crhallberg.com/cah/).
