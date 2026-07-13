# Architecture

This project implements the Concentrate.ai Hiring Quiz as a single repository with a Next.js frontend and a Fastify backend.

## High-Level System

- Frontend: `src/app` contains the Next.js 15 App Router UI. Shared UI components live in `src/components`, and browser API helpers live in `src/lib`.
- Backend: `src/server` contains the Fastify application, route registration, controllers, middleware, and utilities.
- Database: PostgreSQL 17 is accessed through Kysely. The connection and migration code live under `src/server/db`.
- Cache: Redis is configured through `src/server/utils/redis.ts` and provided by Docker Compose.
- Delivery: The root `Dockerfile` builds both the server and Next.js client. `docker-compose.yml` runs the app with PostgreSQL, Redis, and nginx.

## Roles

Role-specific UI routes are grouped under `src/app/dashboard`:

- Admin: `src/app/dashboard/admin` and `src/server/routes/admin.ts`
- Teacher: `src/app/dashboard/teacher`, class routes, assignment routes, syllabus routes, announcements, and submission grading paths
- Student: `src/app/dashboard/student`, class views, assignment submission views, and grade views

Server-side authorization is enforced with JWT authentication middleware in `src/server/middleware/auth.ts` and role helpers in `src/server/middleware/rbac.ts`.

## Authentication

The app uses signed JWT access and refresh tokens stored in HTTP-only cookies. Cookie helpers live in `src/server/utils/cookies.ts`, JWT helpers live in `src/server/utils/jwt.ts`, and auth routes live in `src/server/routes/auth.ts`.

Google OAuth is implemented in `src/server/controllers/oauthController.ts` and exposed through:

- `GET /api/auth/google`
- `GET /api/auth/google/callback`

The frontend uses credentialed fetch requests so browser cookies are sent with API calls.

## School Statistics API

The School Statistics API lives in `src/server/routes/stats.ts` and is registered from `src/server/routes/index.ts` with the `/api/v0/stats` prefix. Its controller logic is in `src/server/controllers/statsController.ts`.

Implemented endpoints:

- `GET /api/v0/stats/average-grades`
- `GET /api/v0/stats/average-grades/:id`
- `GET /api/v0/stats/teacher-names`
- `GET /api/v0/stats/student-names`
- `GET /api/v0/stats/classes`
- `GET /api/v0/stats/classes/:id`

The frontend calls these endpoints through the shared API helpers in `src/lib/api.ts`.
