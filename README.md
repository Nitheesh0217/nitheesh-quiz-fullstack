# Concentrate.ai Hiring Quiz Implementation

This repository is a full-stack implementation of the Concentrate.ai Hiring Quiz described in [SPECS.md](./SPECS.md). It builds a Canvas-style school portal with Admin, Teacher, and Student workflows, a Fastify API, PostgreSQL persistence, Redis support, JWT cookie authentication, Google OAuth, tests, CI, Docker Compose, and an nginx deployment path.

## Tech Stack

- Frontend: Next.js 15, React 19, Tailwind CSS, Radix primitives, lucide-react
- Backend: Node.js, Fastify, TypeScript, Zod
- Data: PostgreSQL 17, Kysely, Redis
- Testing: Vitest, Testing Library, Playwright
- Delivery: GitHub Actions, Dockerfile, Docker Compose, nginx

## Quickstart

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Start local infrastructure:

```bash
docker compose up -d postgres redis
```

Run migrations:

```bash
npm run db:migrate
```

Start the full development stack:

```bash
npm run dev
```

The Next.js app runs on `http://localhost:3000`; API requests are proxied to the Fastify server on `http://localhost:4000`.

## Role Flows

Admin users can manage teacher groups and users, suspend or unsuspend students and teachers, review platform-wide counts, and inspect school-level statistics.

Teacher users can create and manage classes, add or remove students, publish assignments, review submissions, grade work, and provide feedback.

Student users can view enrolled classes, inspect assignments and syllabus content, submit work, and review grades and teacher feedback.

## School Statistics API

The versioned stats API is mounted at `src/server/routes/stats.ts` under `/api/v0/stats`. Routes require an authenticated session.

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/v0/stats/average-grades` | `GET` | Average grade across all classes |
| `/api/v0/stats/average-grades/:id` | `GET` | Average grade for one class |
| `/api/v0/stats/teacher-names` | `GET` | Teacher names |
| `/api/v0/stats/student-names` | `GET` | Student names |
| `/api/v0/stats/classes` | `GET` | Classes with teacher names |
| `/api/v0/stats/classes/:id` | `GET` | Students in one class |

## Authentication

Email/password auth issues signed JWT access and refresh tokens in HTTP-only cookies. Google OAuth is wired through `/api/auth/google` and `/api/auth/google/callback`; when Google credentials are absent, those routes fail gracefully while the rest of the app continues to work.

## Testing

Run the main checks:

```bash
npm run lint
npm run test
npm run coverage
npm run test:e2e
npm run build
```

Vitest coverage thresholds are configured in [vitest.config.ts](./vitest.config.ts). Playwright specs live in [e2e](./e2e).

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Deployment](./docs/DEPLOYMENT.md)
- [Hiring quiz spec](./SPECS.md)

## Docker And Deployment

The root [Dockerfile](./Dockerfile) builds the server and client. [docker-compose.yml](./docker-compose.yml) defines the app, PostgreSQL, Redis, and nginx services. See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for local and production deployment notes.
