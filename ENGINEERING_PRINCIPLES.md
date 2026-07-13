# Engineering Principles & Guidelines: Concentrate AI

This document establishes the architecture, design patterns, testing standards, and development workflows for the **Concentrate** Canvas-style school portal.

---

## 1. Ownership & Scope

- **Full-Slice Integration**: Developers own the entire lifecycle of a feature slice, spanning database migrations (`users`, `roles`, `classes`, `assignments`, `submissions`, `grades`), service layers, Fastify backend routes, Next.js page layouts, auth guards, Docker assets, and CI/CD pipelines.
- **No Cut Corners**: Core flows for all three roles (Admin, Teacher, Student) must be fully implemented, well-typed, and functional.
- **Architectural Documentation**: Document all major system changes, database model modifications, and design trade-offs in this file and corresponding service documentation.

---

## 2. Tech Stack Discipline

- **Frontend**: Next.js 15, React 19, Tailwind CSS (Vanilla styling preferred), Radix UI primitives.
- **Backend**: Fastify, TypeScript, Zod.
- **Persistence**: PostgreSQL 17, Kysely query builder.
- **Caching & Sessions**: Redis.
- **TS End-to-End**: Maintain strict, compiler-checked TypeScript type definitions from DB schemas to backend route parameters to React components. Always validate API payloads and query inputs with Zod schemas.

---

## 3. Architecture & Domain Model

- **Database Layer**: Migrations must map direct linking tables for relations (e.g., `student_enrollments`) and set cascade deletion hooks.
- **Controller Pattern**: Business logic is separated into dedicated controller modules (`src/server/controllers/{auth,oauth,class,assignment,submission,stats}Controller.ts`). Fastify route handlers in `src/server/routes/*.ts` delegate directly to these controllers.
- **Centralized Authorization**: Role-Based Access Control (RBAC) checks are handled via the `authenticate` and `requireRole`/`requireSelfOrRole` middleware (`src/server/middleware/{auth,rbac}.ts`), rather than inline conditional branches.

---

## 4. Product Experience (Canvas-Style Portal)

- **Admin Console**: CRUD options for student/teacher accounts, account status toggles (Active/Suspended), and telemetry indicators.
- **Teacher Workspace**: Assignment management tools, submission evaluation matrices, rubrics, and feedback inputs.
- **Student Workstation**: Dynamic landing dashboards listing enrolled courses, upcoming tasks (To-Do), grading statuses, and feedback comments.
- **File Submissions**: Base64 data encoding for persistent PostgreSQL storage or structured object storage references.
- **Syllabus & Modules**: A 9-week accordion curriculum layout containing detailed topics, required readings, video tutorials, and deliverable links.

---

## 5. School Statistics API Contract

Ensure all statistics endpoints return clean, documented JSON outputs with Zod validations:
- `GET /api/v0/stats/average-grades`
- `GET /api/v0/stats/average-grades/:id`
- `GET /api/v0/stats/teacher-names`
- `GET /api/v0/stats/student-names`
- `GET /api/v0/stats/classes`
- `GET /api/v0/stats/classes/:id`

---

## 6. Auth & Security

- **Secure Session Management**: JWT auth tokens stored in secure, HTTP-only, SameSite cookies.
- **Third-Party Integrations**: Google OAuth mapped to local database accounts (GitHub/Microsoft are not yet wired up).
- **Secret Isolation**: All credentials, database URIs, and API keys must be loaded from system environment variables; never hardcode configuration values.

---

## 7. Testing & Quality Assurance

- **Multi-Layer Testing**: Test suites should cover:
  - Unit tests for services.
  - Integration tests for Fastify endpoints.
  - Component tests for Next.js controls.
  - Playwright E2E tests for core user journeys.
- **Zero Regression Policy**: Keep tests passing at all times during new feature additions.

---

## 8. CI/CD & Deployment

- **Automated Workflows**: GitHub Actions run lint checkers, execute test suites, and build Docker containers.
- **Docker Compose Orchestration**: Manage multi-container microservices (web, api, database, redis cache) from a single entry command.
