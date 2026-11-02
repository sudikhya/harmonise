# Harmonize

Harmonize is a private space to think things through, explore lived experiences, and choose what to share. The homepage establishes the visual language for the product; the interactive experience lives at `/app/`.

## Run locally

```bash
npm ci
npm run dev
```

Open <http://localhost:3000/> for the Motion Revival homepage or <http://localhost:3000/app/> for the product experience. The app is frontend-only while service integrations are being prepared.

## Product experience

The current screens support private conversations, a user-correctable understanding, community and story discovery, optional group participation, connection choices, personal reflections, and safety and support information. The interface adapts to desktop and mobile and respects reduced-motion preferences.

Fictional people and prepared content are identified in the interface. AI inference, transcription, accounts, persistence, messaging, community moderation, and professional services are not connected yet. User choices are local to the browser session and are not sent to other people.

## Visual direction

Follow the Motion Revival homepage for the logo, typography, warm coral and lilac palette, illustrated scenes, rounded controls, soft shadows, hover states, and restrained scroll motion. Repository-level guidance is in [AGENTS.md](AGENTS.md); historical homepage comparisons and QA evidence are archived in [archive/product-history/docs/harmonize-homepage/](archive/product-history/docs/harmonize-homepage/).

## Checks

```bash
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Do not add unit tests. Use high-level browser E2E tests for meaningful product journeys. Existing unit tests remain for the current state model until that code is replaced.

## Deployment

Every push to `main` runs two workflows: `Verify Harmonise build` (lint, typecheck, unit tests, server
production build) and `Deploy Harmonise to GitHub Pages` (static export of the same tree, API routes
excluded, served under `/harmonise`).

Two targets, one tree:

- **Server (full features):** the live adviser and account login need Node (`/api/*` + SQLite), so run
  `npm run dev` locally or deploy as a server app on Sites from `main`.
- **GitHub Pages (static):** <https://sudikhya.github.io/harmonise/> serves the landing, product, and
  connect journeys. The demo login works there offline; account creation, the live adviser, and the
  agents need the server and degrade honestly (the adviser shows its retry state).

Model provider (runtime secrets on Sites, env vars locally):

- Default (OpenAI): `OPENAI_API_KEY` (protected secret), optional `OPENAI_MODEL` (default `gpt-4o-mini`).
- Meta Llama API: `LLM_PROVIDER=llama`, `LLAMA_API_KEY` (protected secret), optional `LLAMA_MODEL`
  (default `Llama-4-Scout-17B-16E-Instruct`). Calls go to Meta's OpenAI-compatible endpoint;
  unknown `LLM_PROVIDER` values fall back to OpenAI.

Run the server locally with `OPENAI_API_KEY=... npm run dev` (or `npm run build` + `npm start`) and open
`/connect` for the live-adviser journey. Without a key for the selected provider, the adviser shows an
honest retry state.

Entry: `/connect` is login-first — log in or create an account (18+) and all features show up.
A Support Coach preview stays available without logging in. A demo login whose credentials
(`demo@harmonise.app` / `harmonise-demo`) are shown on screen is seeded into the database on first
run, and also works offline on static hosting where the API is absent.

Accounts live in a file-based SQLite database (WASM engine, no native build) at `data/harmonise.db`
(override with `HARMONISE_DB_PATH`). Passwords are scrypt-hashed; sessions are opaque tokens in an
`HttpOnly` cookie, valid 7 days. Adviser conversations are still never stored — they are sent only to
the configured model provider.

Guests can talk with the adviser and discover communities; joining any community needs an account —
guests are asked to log in at the join step. Members post in joined circles (`POST /api/circles/:id/posts`);
posts are shared with that circle only.

Two background agents run inside the server on a 20s tick (plus a kick after each post), on the
configured model provider:

- **Discovery** mines verified-clean circle posts for recurring themes and drafts new-community
  proposals, refining the wording with the model when a key is configured.
- **Verification** scans new posts for spam/safety (flagged posts leave the feeds for human review)
  and reviews pending proposals before they surface in `GET /api/discovery` and the “Coming up” shelf.

On the static GitHub Pages build the agents cannot run: the shelf stays hidden, feeds show sample
content, and posting stays local-only. The demo login still works there, offline.

## Historical material

Older product specs, captures, recorded films, scorecards, review reports, and legacy source live under [archive/](archive/). They are not loaded by the application.
