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

The live adviser needs a Node server (`/api/advice`), so the app deploys as a server app on Sites from `main`
— not as a static export. The `Verify Harmonise build` workflow runs lint, typecheck, unit tests, and a
production build on every push to `main`.

Model provider (runtime secrets on Sites, env vars locally):

- Default (OpenAI): `OPENAI_API_KEY` (protected secret), optional `OPENAI_MODEL` (default `gpt-4o-mini`).
- Meta Llama API: `LLM_PROVIDER=llama`, `LLAMA_API_KEY` (protected secret), optional `LLAMA_MODEL`
  (default `Llama-4-Scout-17B-16E-Instruct`). Calls go to Meta's OpenAI-compatible endpoint;
  unknown `LLM_PROVIDER` values fall back to OpenAI.

Run the server locally with `OPENAI_API_KEY=... npm run dev` (or `npm run build` + `npm start`) and open
`/connect` for the live-adviser journey. Without a key for the selected provider, the adviser shows an
honest retry state.

Entry: `/connect` offers alias/real-name member entry, a Support Coach preview, and explore-without-details
demo mode — all local-only and reset on refresh — plus database-backed accounts: create an account or
log in to keep your space across visits. A demo login whose credentials (`demo@harmonise.app` /
`harmonise-demo`) are shown on screen is seeded into the database on first run.

Accounts live in a file-based SQLite database (WASM engine, no native build) at `data/harmonise.db`
(override with `HARMONISE_DB_PATH`). Passwords are scrypt-hashed; sessions are opaque tokens in an
`HttpOnly` cookie, valid 7 days. Adviser conversations are still never stored — they are sent only to
the configured model provider.

## Historical material

Older product specs, captures, recorded films, scorecards, review reports, and legacy source live under [archive/](archive/). They are not loaded by the application.
