# SeemsFit Coach

A personal health and fitness app with an AI coach, Vyom. It logs workouts, meals, sleep and blood reports, reads Apple Health, and has an iPhone app, Apple Watch app and widgets built with Capacitor and Swift.

You run your own copy: your own Firebase project, your own AI key. Nothing is shared with anyone else.

## Stack

- Web: Vite, React, TypeScript, Tailwind v4 (`apps/web`)
- iOS: Capacitor shell plus native Swift for the watch app, widgets and Live Activity (`apps/web/ios`)
- Data: Firebase Auth, Firestore, Storage
- AI: a Cloudflare Worker that verifies the Firebase sign-in token and streams Gemini 2.5 Flash, with optional Cerebras for text (`worker`)
- Cloud Functions: Apple Health ingest webhook and a daily insight (`functions`, optional, needs the Blaze plan)

## Setup

1. Create a Firebase project. Enable Google sign-in, Firestore and Storage.
2. Deploy the rules: `firebase use --add`, then `firebase deploy --only firestore:rules,storage`. Each signed-in user can only read and write their own `users/{uid}` data.
3. Copy `apps/web/.env.example` to `apps/web/.env` and fill in your Firebase web config.
4. AI worker: in `worker/wrangler.toml` set `FIREBASE_PROJECT_ID` and `ALLOWED_ORIGIN`, then
   `wrangler secret put GEMINI_API_KEY` and `wrangler deploy`. Put the worker URL in `VITE_JARVIS_URL`.
5. Run the web app: `cd apps/web && npm install && npm run dev`.
6. iOS (optional): add your own `GoogleService-Info.plist` to `apps/web/ios/App/App/`, set your signing team and bundle IDs in Xcode, then see `apps/web/ios/*SETUP.md`.

Cloud Functions read `ALLOWED_EMAILS`, `OWNER_UID`, `INGEST_SECRET` and `GEMINI_API_KEY` from Firebase secrets.

## License

GNU Affero General Public License v3.0. If you run a modified version as a service, you must publish your source. See [LICENSE](./LICENSE).
