# Engineering Principles

Conventions followed in this codebase.

## Testing

- Test suite must pass with zero failures; ESLint and `tsc --noEmit` must be clean.
- Coverage thresholds in `vitest.config.ts` are enforced in CI (100% lines/statements/branches/functions).
- Backend tests are integration tests against a real test database (`app.inject()`), not mocked models — this catches real join/cascade behavior that mocks would hide.
- Zod validation is asserted directly (e.g. an invalid role or an out-of-range rubric score should return a 400, and there's a test for it).
- Playwright specs cover real user flows: login, class creation, assignment submission, grading.

## API design

- Routes (`src/server/routes/`) parse and validate the request with Zod, then call a controller. They don't contain business logic.
- Controllers (`src/server/controllers/`) hold the actual logic and talk to the database. They don't touch the HTTP layer (no reading headers, no calling `reply` directly) — they return data or throw a typed `AppError` subclass, and the route/global error handler translates that into a response.
- Every request body, param, and query string is validated with Zod at the route boundary.

## Database

- Kysely generates types from `src/server/db/types.ts`; queries go through its query builder rather than raw SQL, so a column rename is a compile error everywhere it's used.
- Cascade deletes are defined at the migration level (e.g. dropping a class removes its assignments), not handled manually in application code.

## Frontend

- Styling goes through Tailwind's config tokens, not one-off arbitrary values.
- Destructive or state-changing actions (delete, suspend, submit) show a toast on success or failure — no silent failures.

## Security

- Secrets (OAuth credentials, DB connection string, JWT signing keys) come from environment variables, never committed.
- JWTs live in httpOnly, `SameSite=Lax` cookies — not accessible to client-side JS.
- Authorization is checked in two places independently: Next.js middleware redirects at the routing layer for UX, and every backend route re-checks the JWT and role itself, so a client bypassing the UI still can't reach data it shouldn't.
