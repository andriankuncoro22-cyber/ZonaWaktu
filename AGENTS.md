# Agent Hints for contributors and AI coding agents

Purpose: concise, actionable guidance so an AI agent or new contributor can quickly build, run, and modify this repo.

Quick commands
- Install dependencies: `npm install`
- Run development Next.js site: `npm run dev`
- Build production site: `npm run build` then `npm run start`
- Lint: `npm run lint`
- Prisma generate (runs on `postinstall`): `npx prisma generate` (or `npm run postinstall`)

Project layout (high level)
- Web app (Next.js App Router): `src/app/` — pages and layouts live here.
- UI components: `src/components/` — shared UI primitives used across the app.
- Firebase integration: `src/firebase/` — initialization, auth, and Firestore helpers.
- Native Android (Capacitor): `android/` and `app/` for native build files.
- Prisma schema & DB: `prisma/` and `schema.prisma` (also `schema.prisma` at repo root)

Environment & secrets
- Firebase keys: set `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, and `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` (see `src/firebase/config.ts`).
- Next.js exports static site by default (`next.config.ts` sets `output: 'export'`). Keep `images.unoptimized = true` for static export.

Conventions and notes for agents
- Prefer modifying React server/client components under `src/app/` and `src/components/`.
- UI primitives follow a component + `ui/` pattern (e.g., `src/components/ui/*`).
- Changes that affect the schema should also update Prisma files in `prisma/` and run `npx prisma generate`.
- Tests are not present; run lint and build locally to validate changes.

Where to look for more details
- Firebase usage and auth flows: `src/firebase/`
- Android native integration: `android/` and Capacitor config files (`capacitor.config.ts`)
- Build scripts and deps: `package.json` (root)
- Firestore rules & indexes: `firestore.rules`, `firestore.indexes.json`

If you'd like, I can also create a `.github/copilot-instructions.md` with tailored guidance for PRs and review workflows.
