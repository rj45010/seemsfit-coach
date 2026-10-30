# SeemsFit - Project Architecture & Engineering Standards

You are operating within the SeemsFit codebase. This is a React 19, Vite, TypeScript, Tailwind CSS v4, and Capacitor (iOS-focused) fitness and health-tracking app with an embedded AI coach (Vyom/jarvis). Backend is Firebase; AI streams via Cloudflare Workers.

We are incrementally migrating from a legacy file-type structure to a Feature-Based (Screaming) Architecture. Adhere to these rules strictly.

## 1. Architectural Philosophy & Incremental Migration
- **The Boy Scout Rule:** We are incrementally migrating to `src/features/`. When editing legacy components in `src/components/`, `src/hooks/`, or `src/lib/`, clean up the code and apply standard typing, but **do not** initiate a full architectural rewrite of the file unless explicitly instructed.
- **Net-New Features:** All new features must be built strictly in `src/features/{featureName}/` using the structure below.
- **Target Directory Structure:**
  `/src/components` - Global reusable UI (Tailwind v4 + globals.css tokens)
  `/src/config` - Environment variables and Firebase init (e.g., `import.meta.env`)
  `/src/constants` - Hardcoded text, magic numbers, localizations
  `/src/features/{feature}` - Domain modules containing `/api`, `/components`, `/hooks`, `/schemas`, `/types`, and an `index.ts` public API (Barrel file).
  `/src/layouts` - Page wrappers (AppShell, BottomNav)
  `/src/lib` - Core infra (Capacitor plugins, HealthKit bridge, `cn` utility)
  `/src/routes` - React Router definitions & lazy-loaded pages
  `/src/store` - Zustand (only for strictly app-wide state)

## 2. State Management, Data Fetching & Firebase
- **React Query + Firestore:** Server state uses `@tanstack/react-query`.
  - Query keys must be explicit arrays (e.g., `['metrics', uid, date]`).
  - For migrated/new features, colocate Firebase queries inside the custom React Query hook in `/api`.
  - Always derive the `uid` from the auth context before querying (Security Rules require `request.auth.uid == uid`).
- **Client State:** Default to `useState`/`useReducer`. Do not bleed domain state into global Zustand stores.

## 3. Validation & Forms (Apply to New/Migrated Code)
- **Zod at the Edge:** For new features, use `zod` to validate incoming Firestore payloads, HealthKit data, and AI (jarvis) action responses before they enter app state.
- **Forms:** Use `react-hook-form` paired with `@hookform/resolvers/zod` for data entry (logging workouts, meals). Do not write manual form validation.

## 4. UI, Styling & Native Feel
- **Tailwind v4 & Tokens:** Use Tailwind v4 exclusively. Rely on the CSS custom-property design tokens in `src/styles/globals.css`.
- **iOS Aesthetic:** Ensure components respect iOS-native aesthetics (safe areas, Apple system colors). Use `framer-motion` for fluid transitions and `lucide-react` for icons.
- **Class Merging:** Assume the presence of a `cn` utility (combining `clsx` and `tailwind-merge`). Use it to handle dynamic class overrides safely.

## 5. Resilience & Magic Strings
- **Zero Magic Strings:** No hardcoded user-facing text in JSX for new components. Extract labels and AI prompt fragments into `src/constants/`.
- **Graceful Failure:** Apply React Error Boundaries and `<Suspense>` incrementally to new or refactored async HealthKit/Firestore operations. Do not blanket-apply them to legacy code unprompted.

## 6. Testing Strategy
Code is not complete without tests.
- **Stack:** Vitest + React Testing Library (RTL).
- **Philosophy:** Test behavior, not implementation details. Query by roles (`getByRole`), not by CSS classes or test IDs.
- **Scope:**
  1. Unit test custom hooks (domain logic).
  2. Integration test feature components (mocking API calls via MSW).

## Output Execution Protocol
When generating code for this repo, output in this logical order:
1. **Brief:** 1-2 sentences on how the solution fits the target architecture vs legacy codebase.
2. **Types, Constants, & Schemas (Zod)**
3. **API & Hooks (Business Logic / React Query)**
4. **UI Components (Tailwind v4, `cn`, accessible)**
5. **Testing/Exports:** Relevant barrel exports or Vitest blocks if requested.
