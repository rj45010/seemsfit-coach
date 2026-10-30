# features/

Domain modules (Feature-Based / "Screaming" architecture). Each new feature lives here:

features/{feature}/
  api/         # React Query hooks wrapping Firestore/Worker calls
  components/  # UI internal to the feature
  hooks/       # domain business logic
  schemas/     # Zod validation schemas
  types/       # domain interfaces
  index.ts     # public API (barrel) — import features only via this

See /CLAUDE.md. Legacy code stays in src/{components,hooks,lib,routes} until migrated (Boy Scout Rule).
