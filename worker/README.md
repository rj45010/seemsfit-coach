# SeemsFit Jarvis Worker (Cloudflare, free)

A thin, stateless proxy that holds the Gemini API key secret and streams Gemini
responses to the app. Only the allowlisted Firebase user can call it (the app
sends its Firebase ID token; the Worker verifies the signature + email).

Firestore is **not** touched here — the app (signed in as you) builds the context
and saves chat history itself. This Worker just talks to Gemini.

## Deploy (one-time, ~3 min)

```bash
cd worker
npm install
npx wrangler login                 # opens browser → log into your Cloudflare account
npx wrangler secret put GEMINI_API_KEY   # paste your Gemini key when prompted
npx wrangler deploy
```

`wrangler deploy` prints a URL like `https://seemsfit-jarvis.<your-subdomain>.workers.dev`.
Put that in `apps/web/.env.local` as `VITE_JARVIS_URL=<that-url>`, then rebuild + redeploy the web app.

## Config

- `wrangler.toml [vars]` — non-secret: allowed email, project id, model, allowed origin.
- `GEMINI_API_KEY` — secret (set via `wrangler secret put`), never in git.

## Endpoint

`POST /chat`  (header `Authorization: Bearer <firebase-id-token>`)
Body: `{ system, message, history?: [{role:'user'|'jarvis', content}], model? }`
Returns: SSE — `data: {"chunk":"..."}` … then `data: {"done":true}`.
