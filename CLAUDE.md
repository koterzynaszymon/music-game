# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working style (read first)

The owner is using this project to learn software engineering. Act as a teacher, not an implementer.

- **Do not write code, scaffold files, refactor, or change anything unless the user explicitly asks for that specific action in their current message.** When they ask a question, answer the question only.
- This is the user's **first time with NestJS**. Explain Nest concepts (modules, providers, dependency injection, controllers, gateways, DTOs, pipes) at an introductory level as they come up.
- The user wants to **learn TDD**. Support a test-first workflow, and explain the practice (red/green/refactor, what to test, test doubles) rather than just making tests pass.
- Point out design gaps and tradeoffs, but let the user make the decisions.

## Project vision

A multiplayer music-guessing party game inspired by "whatsamusic" (by whatsamook), meant to be played casually (e.g. a Discord call).

Core loop:
- A player creates a **room**; others join with a room code. **No login** — each player just picks a nickname. Browser generates a random client ID stored in `localStorage` and sends it on every socket connection so a player can be re-attached to their score after a refresh/disconnect. The room creator is the **host** and holds admin controls.
- The host sets **N songs per player**. Each player submits N songs (a YouTube video plus a chosen start timestamp — the "good moment" of the song).
- When everyone is **ready**, the round starts. All submitted songs are combined into one pool and played in **random order**.
- **Scoring is golf-style: lowest total wins.** When a song starts, a server-measured timer runs. A player's score for that song is the elapsed seconds at the moment they guess correctly (guess at 3s -> 3 points, at 6s -> 6 points). Players may guess **unlimited times**. If **nobody guesses**, nobody scores that song.
- After the pool is exhausted, show a leaderboard.
- For now, players guess **only the song title**. Artist guessing may be added later as a smaller bonus. A player should not be able to score on a song they submitted themselves.

Known problems deferred for later:
- **Title matching.** YouTube video titles are noisy (`Artist - Title (Official Video) [feat. X]`). The submitter will type a canonical title; both sides still need normalization (lowercase, strip punctuation, drop `feat`/`Remastered`, etc.) and probably fuzzy matching. Not yet designed.
- Handling region-locked / deleted / embedding-disabled YouTube videos at runtime.

## Stack decisions (and why)

- **Backend: NestJS.** Realtime via **Socket.IO**, exposed through Nest **gateways** (`@WebSocketGateway()` classes that handle socket events like controllers handle HTTP).
- **Frontend: React.** Redux is a possible choice for client state (unrelated to Redis below).
- **Audio: YouTube IFrame Player API** (frontend only, free, no login, supports starting playback at an arbitrary timestamp via `playerVars.start` / `player.seekTo`). YouTube Data API v3 (backend, quota-limited) is optional and only needed for in-app song search.
  - Spotify was rejected: preview clips are label-chosen 30s snippets (and `preview_url` is unavailable to new apps since Nov 2024); full playback via the Web Playback SDK requires every player to have Spotify Premium and log in via OAuth, which breaks the no-login goal.
  - SoundCloud was rejected: new API application registrations have been closed for years.
- **State storage: in-memory for now.** Use a `Map` keyed by room code; each room holds a `Map` of players keyed by player ID (O(1) lookup/delete, clearer intent than arrays). **Hide it behind a repository/service class** (`findRoom(code)`, `saveRoom(room)`, ...) so it can later be swapped for **Redis** (for restart-persistence and multi-instance deploys) with a localized change. This boundary also lets TDD run against a fast in-memory fake.
- **Timing must be server-authoritative.** Elapsed time for scoring is measured on the server when the guess message arrives. The client is untrusted input — never accept a client-reported elapsed time.

## Repository status

Backend and frontend are scaffolded, no game logic yet.

### Backend (`backend/`)

NestJS, TypeScript, ESM (`"type": "module"`). Vitest for tests, Oxlint for linting.

```bash
cd backend
npm install
npm run start:dev   # dev server with watch
npm run build        # nest build
npm run test          # vitest run
npm run test:watch  # vitest
npm run test:e2e     # vitest run --config ./vitest.config.e2e.ts
npm run lint            # oxlint src/ test/
```

### Frontend (`frontend/`)

React + Vite, TypeScript. ESLint for linting.

```bash
cd frontend
npm install
npm run dev       # vite dev server
npm run build     # tsc -b && vite build
npm run lint       # eslint .
npm run preview  # preview production build
```
