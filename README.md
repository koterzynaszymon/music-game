# Music Game

A multiplayer music-guessing party game, inspired by *whatsamusic* by whatsamook. It's meant to be played casually, for example in a Discord call.

Everyone submits a few songs (a YouTube video plus the "good moment" to start from). The songs are shuffled into one pool and played one by one. Guess the title as fast as you can. **Golf-style scoring: the lowest total wins.**

## How it works

1. A player creates a **room** and becomes the **host**. Others join with the room code. There is **no login**, you just pick a nickname. The browser stores a random client ID in `localStorage`, so you keep your place and score after a refresh.
2. The host sets how many **songs per player** and how many **seconds per song** (10-15s).
3. Each player submits their songs (YouTube link + start timestamp) and marks themselves **ready**.
4. When everyone is ready, the host starts the game. All songs go into one pool and are played in random order.
5. When a song starts, a server-side timer runs. If you guess the title correctly after *N* seconds, you get *N* points. You can guess as many times as you want. If nobody guesses, nobody scores.
6. You can't score on a song you submitted yourself.
7. When the pool is empty, a final leaderboard is shown. The host can reset the room and play again.

Title matching ignores case, punctuation and spaces. It also allows a few typos, more for longer titles (see `backend/src/rooms/title-matching.ts`).

## Tech stack

| Part | Tech |
| --- | --- |
| Backend | [NestJS](https://nestjs.com/), TypeScript (ESM), Socket.IO gateways, `class-validator` DTOs |
| State | Redis (via `ioredis`), behind a `RoomsRepository` abstraction. An in-memory implementation is used in unit tests. |
| Frontend | React 19, Vite, TypeScript, React Router, Tailwind CSS 4, `socket.io-client` |
| Audio | [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference) (frontend only, no login or API key needed) |
| Tests | Vitest |
| Linting | Oxlint (backend), ESLint (frontend) |

Timing is **server-authoritative**: elapsed time for scoring is measured on the server when the guess arrives. The client is never trusted to report it.

## Project structure

```
music-game/
├── backend/             NestJS API + Socket.IO gateway
│   └── src/
│       ├── rooms/       Rooms domain: service, gateway, controller, repositories,
│       │                song timers, title matching, DTOs
│       ├── redis/       Redis provider module
│       └── common/      Shared filters (WebSocket error filter)
├── frontend/            React + Vite client
│   └── src/
│       ├── pages/       Homepage, RoomPage
│       ├── components/  Room UI (player list, song picker, guess form, leaderboard, ...)
│       └── lib/         API helpers, YouTube player types, client ID, volume
├── docker-compose.yml   Redis for local development
└── CLAUDE.md            Project notes and working agreements
```

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) (a recent LTS; the project uses ESM and `process.loadEnvFile`, so Node 20.12+)
- [Docker](https://www.docker.com/) (to run Redis), or a Redis instance of your own

### 1. Start Redis

```bash
docker compose up -d
```

This starts Redis 8 on `localhost:6379`. Stop it with `docker compose down`.

### 2. Run the backend

```bash
cd backend
cp .env.example .env     # on Windows PowerShell: Copy-Item .env.example .env
npm install
npm run start:dev
```

The API runs on `http://localhost:3000`, with all HTTP routes under `/api/v1`.

### 3. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`.

The frontend reads the backend address from `VITE_API_URL`. Create `frontend/.env.local` with:

```
VITE_API_URL=http://localhost:3000
```

Then open the app, create a room, and share the room code with a friend (or open a second browser window to try it yourself).

## Configuration

### Backend (`backend/.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `PORT` | `3000` | Port the API listens on |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin |

### Frontend (`frontend/.env.local`)

| Variable | Description |
| --- | --- |
| `VITE_API_URL` | Base URL of the backend, for example `http://localhost:3000` |

## API overview

**HTTP** (prefix `/api/v1`):

- `POST /rooms` - create a room
- `GET /rooms/:code` - get a room's public state

**Socket.IO events** (handled in `rooms.gateway.ts`):

`joinRoom`, `leaveRoom`, `kickPlayer`, `closeRoom`, `changePlayerReadyStatus`, `setSongsPerPlayer`, `submitSong`, `startGame`, `songLoaded`, `submitGuess`, `nextSong`, `resetRoom`

## Scripts

### Backend (`backend/`)

| Command | What it does |
| --- | --- |
| `npm run start:dev` | Dev server with watch mode |
| `npm run build` | Build with `nest build` |
| `npm run start:prod` | Run the built app (`node dist/main`) |
| `npm run test` | Unit tests (Vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:cov` | Tests with coverage |
| `npm run test:integration` | Integration tests against a real Redis (needs Redis running; uses DB `1` by default, override with `TEST_REDIS_URL`) |
| `npm run test:e2e` | End-to-end tests |
| `npm run lint` | Lint with Oxlint |
| `npm run format` | Format with Prettier |

### Frontend (`frontend/`)

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build |
| `npm run lint` | Lint with ESLint |

## Known limitations / roadmap

- Players guess **only the song title**. Artist guessing may be added later as a smaller bonus.
- Title matching is normalization plus typo tolerance. It doesn't strip things like `feat.` or `Remastered` from titles yet.
- Region-locked, deleted or embedding-disabled YouTube videos aren't handled at runtime yet.
- YouTube Data API search (for finding songs inside the app) is not implemented. Players paste links for now.
