# FULL SYSTEM AUDIT REPORT
Date: 2026-07-07
Status: **PARTIAL** — core CRUD/grading/stats flows work and are honestly documented in README.md, but two undefined-variable bugs crash primary user journeys, there's no CI/CD or OAuth, coverage is 64% (not 100%), and `next build` currently fails.

All findings below were verified live against the running app (backend :4000, frontend :3000, Postgres via psql) in this session, not inferred from code alone, unless marked "(static only)".

---

## SECTION 1: BACKEND ENDPOINTS

Ground truth from reading every route file (`src/server/routes/*.ts`), then hit with curl using real cookie auth (`access_token` cookie — **not** `token` as assumed in the draft script; correct admin password is `AdminPass123!`, not `ResetPass123!`, per SEED_REPORT.md's own typo note).

### Auth API
- [x] `GET  /api/auth/schools` → 200
- [x] `POST /api/auth/register` → 201 (per existing test suite)
- [x] `POST /api/auth/login` → 200, sets `access_token`+`refresh_token` HttpOnly cookies, body includes `token`
- [x] `POST /api/auth/logout` → 200
- [x] `GET  /api/auth/me` → 200 (authed)
- [x] `POST /api/auth/refresh` → implemented (uses refresh cookie)

### Stats API (`/api/v0/stats/*`) — SPECS.md centerpiece
- [x] `GET /api/v0/stats/average-grades` → 200, real data (`{"average":73.45}`)
- [x] `GET /api/v0/stats/average-grades/:class_id` → 200, real data
- [x] `GET /api/v0/stats/teacher-names` → 200, real data (6 teachers)
- [x] `GET /api/v0/stats/student-names` → 200, real data (21 students)
- [x] `GET /api/v0/stats/classes` → 200, real data (8 classes)
- [x] `GET /api/v0/stats/classes/:class_id` → 200, real data
- [x] Unauthenticated / invalid cookie → 401 on all six

### Classes API
- [x] `GET /api/classes` → 200
- [x] `POST /api/classes` → 201, **requires** `{school_id (uuid), name}` — `{name, description}` alone → 400 (not a bug, just a stricter schema than assumed)
- [x] `GET /api/classes/available` (student) → 200
- [x] `GET /api/classes/:class_id` → 200
- [x] `POST /api/classes/:class_id/enroll` (student, by code) → implemented
- [x] `GET /api/classes/:class_id/students` (teacher/admin) → 200
- [x] `GET /api/classes/:class_id/assignments` → 200
- [x] `POST /api/classes/:class_id/assignments` (teacher/admin) → 201
- [ ] `PUT /api/classes/:class_id` → **404, does not exist**
- [ ] `DELETE /api/classes/:class_id` → **404, does not exist**
- [!] `GET /api/classes/1/assignments` (non-UUID id) → **500 Internal Server Error** (unhandled Postgres error, no input validation on path params)

### Assignments API
- [x] `GET /api/assignments/:assignment_id` → 200
- [x] `PUT /api/assignments/:assignment_id` (teacher/admin) → 200
- [x] `POST /api/assignments/:assignment_id/submit` (student) → 201
- [x] `GET /api/assignments/:assignment_id/submissions` → 200
- [ ] `DELETE /api/assignments/:assignment_id` → **404, does not exist** (confirmed also in SEED_REPORT.md #4)

### Submissions / Grades API
- [ ] `GET /api/submissions` (bare) → **404, not a route.** Draft script's assumption was wrong; real endpoints are `/api/submissions/:id`, `/api/submissions/:id/grades`, `/api/classes/:id/grades`, `/api/grades?student_id=`.
- [x] `GET /api/submissions/:submission_id` → 200
- [x] `POST /api/submissions/:submission_id/grades` (teacher/admin, rubric_scores+feedback) → 201
- [x] `GET /api/submissions/:submission_id/grades` → 200
- [x] `GET /api/classes/:class_id/grades` → 200
- [x] `GET /api/grades?student_id=<uuid>` → 200, real data
- [x] `GET /api/grades` without `student_id` → 400 (correct validation)

### Admin API
- [x] `GET /api/admin/users` (filter by role) → 200
- [x] `GET /api/admin/schools`, `POST /api/admin/schools` → 200/201
- [x] `GET /api/admin/stats/average-grades` → 200 (legacy stat, separate from v0 API)
- [ ] `POST/PUT/DELETE /api/admin/users` → **do not exist** — no way to create/edit/delete a user account from the admin side (only via public `/api/auth/register`)
- [ ] Suspend/unsuspend endpoint → **does not exist at all** (see Section 4, Finding #1 — this is worse than "missing," the frontend fakes it)
- [ ] `/api/admin/teacher-groups` (any verb) → **404, entire feature does not exist**

### Security checks
- [x] No cookie → 401 on all protected routes
- [x] Garbage/invalid cookie value → 401
- [x] Valid cookie → 200
- [x] Cross-role calls correctly 403 (e.g., teacher hitting `/api/admin/*`)

---

## SECTION 2: DATABASE SCHEMA
Tables present (`psql -c "\dt"`): `assignments`, `classes`, `grades`, `schools`, `student_enrollments`, `submissions`, `users`, plus Kysely migration bookkeeping tables.
- No `rubric_criteria` table — rubric is stored as `jsonb` inline on `assignments.rubric` and `grades.rubric_scores`. This is a reasonable design choice, not a gap.
- No `teacher_groups` table — confirms Section 1's finding that "CRUD for teacher groups" was never built at any layer.
- `users.is_suspended boolean` **exists** in the schema but is dead — nothing in the API ever writes to it.

---

## SECTION 3: FRONTEND ROUTES

Actual Next.js routes (from `src/app/**/page.tsx`): `/`, `/login`, `/register`, `/dashboard`, `/dashboard/admin`, `/dashboard/teacher`, `/dashboard/teacher/classes/[id]`, `/dashboard/teacher/assignments/[id]`, `/dashboard/teacher/assignments/[id]/grade`, `/dashboard/student`, `/dashboard/student/classes/[id]`, `/dashboard/student/classes/[id]/assignments/[assignmentId]`, `/dashboard/student/grades`, `/dashboard/student/grades/[id]`.

Every route in the draft checklist that isn't in that list returns a real Next.js 404 (verified via fetch status codes): `/dashboard/admin/classes`, `/dashboard/admin/users`, `/dashboard/admin/stats`, `/dashboard/teacher/grading`, `/dashboard/student/classes` (index), `/classes`, `/assignments`, `/grades`, `/forgot-password`. These aren't bugs — the equivalent functionality lives inline on the parent dashboard page or under a different nested path (e.g., grading is at `/dashboard/teacher/assignments/[id]/grade`, not `/dashboard/teacher/grading`).

**Protected-route redirect**: confirmed working — logged-out access to `/dashboard` and to a deep nested route (`/dashboard/teacher/classes/:id`) both client-redirect to `/login`.

**Role-based UI content**: verified real data renders correctly and matches backend for all three roles (admin: 6 teachers/21 students/8 classes/73.5%/0 pending; teacher: 2 classes/23 roster/0 pending; student: 4 courses/93% cum. grade, Recent Grades populated). No console errors on any of these happy-path screens.

---

## SECTION 4: BROKEN FEATURES (confirmed live, in order of severity)

### 1. 🔴 CRITICAL — Student "submit assignment" page crashes for any unsubmitted assignment
`src/app/dashboard/student/classes/[id]/assignments/[assignmentId]/page.tsx:330` references `<FileText />` in the "not yet submitted" branch, but `FileText` is never imported (line 8 only imports `ArrowLeft, ClipboardList, Award, CheckCircle2, Star, Calendar, ExternalLink`). Reproduced live: `ReferenceError: FileText is not defined`, full-page 500 error boundary. Per SEED_REPORT.md, only Assignment 1 of each class has a submission — meaning **every other assignment in every class currently crashes this page for students**. This breaks the SPECS.md "Student: Submit assignments" requirement for the majority of real data.

### 2. 🔴 CRITICAL — Teacher class page crashes when a class has zero assignments
`src/app/dashboard/teacher/classes/[id]/page.tsx:393` references `<ClipboardList />` in the empty-assignments branch (`assignments.length === 0`), but `ClipboardList` is never imported (line 9 imports `ArrowLeft, Plus, Calendar, FileText, Users, Award, BookOpen, ChevronRight, Star, Copy, Trash2, X` — no `ClipboardList`). Reproduced live by creating a fresh class via API and opening it: `ReferenceError: ClipboardList is not defined`, full-page 500. **Any teacher who creates a new class and clicks into it before adding an assignment hits this immediately** — a first-run crash on the most basic teacher workflow.

### 3. 🟠 HIGH — "Suspend/unsuspend user" is a non-functional client-side mock
`src/app/dashboard/admin/page.tsx:175-182` — `toggleUserSuspension` only does `setUsers(prev => ...)` (local React state) and shows a fake success toast ("User account suspended successfully."). It never calls any API — and there is no backend endpoint to call anyway (confirmed in Section 1). The `users.is_suspended` DB column is never written. Refreshing the page silently reverts the "suspension." This actively misleads an admin into believing a real, spec-required action succeeded.

### 4. 🟠 HIGH — Malformed path-param IDs cause unhandled 500s
`GET /api/classes/1/assignments` (or any route with a non-UUID `:id`) returns `{"error":"Internal server error"}` with a 500 status instead of a clean 400. No zod/format validation on UUID path params anywhere in the route layer.

### 5. 🟡 MEDIUM — Frontend RBAC is authentication-only, not authorization-aware
`src/components/ProtectedRoute.tsx` and the per-role dashboard pages only check "is a user logged in," never "does this user's role match this route." A logged-in **teacher** who navigates directly to `/dashboard/admin` gets the full Admin Dashboard UI shell (header "Administration Desk," "Register School" button, user-management panel) rendered — reproduced live. The panels show zeroed/empty data because the backend correctly 403s the underlying API calls, so there's no real data leak, but the UI chrome itself isn't gated by role — only by the top-level `/dashboard` router picking a component, which is bypassable by direct navigation.

---

## SECTION 5: TEST COVERAGE
`npm run coverage`: 53/53 tests pass. **Overall: 64.07% statements / 62.56% branches / 77.96% funcs** (SPECS.md requires 100%, CI-enforced — no CI exists to enforce anything).

Coverage is also structurally incomplete: `vitest.config.ts` coverage `include` is `src/server/**` only — **the entire React frontend (where both crash bugs above live) is excluded from coverage measurement**, not just under-tested. Even a hypothetical 100% pass on this config would never have caught Findings #1–2.

Files under 80% (backend only, since frontend isn't measured):
| File | % Stmts | Notes |
|---|---|---|
| `server/controllers/statsController.ts` | **1.21%** | Core Stats API — essentially untested |
| `server/routes/admin.ts` | 42.5% | |
| `server/routes/stats.ts` | 44.44% | |
| `server/controllers/classController.ts` | 58.18% | |
| `server/controllers/submissionController.ts` | 59.28% | |
| `server/controllers/assignmentController.ts` | 69.53% | |
| `server/routes/auth.ts` | 71% | |
| `server/controllers/authController.ts` | 78.48% | |
| `server/routes/grades.ts` | 75.92% | |
| `server/db/migrate.ts` | 0% | CLI migration runner, not exercised by tests (low-risk) |

No Playwright `.spec.ts` files exist anywhere in the repo (`@playwright/test` is an installed devDependency, unused) — the "E2E tests with Playwright" deliverable is **entirely unimplemented**.

---

## SECTION 6: OAUTH INTEGRATION
- `grep -ri "oauth|google|github|microsoft"` across `src/`: zero real hits — the only matches are `next/font/google` (font loader) and the Google Fonts CDN URL in `globals.css`, both unrelated to auth.
- No `CLIENT_ID`/`CLIENT_SECRET` env vars anywhere in `.env.example` or `env.ts`.
- No callback route, no token-exchange logic, no "Sign in with ___" UI.
- **Conclusion: no OAuth provider is implemented.** SPECS.md explicitly requires "at least 1 OAuth provider (Google, Microsoft, GitHub, etc.)." README.md already self-discloses this gap.

---

## SECTION 7: PACKAGE.JSON & SCRIPTS
Existing top-level scripts: `test`, `test:watch`, `coverage`, `lint`, `db:migrate(:down|:test)`, `build:server`, `watch:server`, `start:server`, `dev:server`.
Missing as literal names: **`dev`, `build`, `start`**.
- `npm run dev` (as literally documented in SPECS.md's Local Development section) **fails**: "missing script: dev." You must run `dev:server` and `npx next dev` in two terminals — which is what `.claude/launch.json` and README.md actually do.
- **`npx next build` (the closest thing to a production build) currently fails** — Next.js runs ESLint as part of `next build` by default, and the repo has 83 lint errors (see Section 8), so a production build is not currently possible without either fixing the lint errors or disabling the build-time lint gate.

---

## SECTION 8: ENVIRONMENT VARIABLES
`.env.example` vars vs `src/server/env.ts` zod schema: **exact 1:1 match** — `NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `COOKIE_SECRET`. No undocumented or unused vars. No OAuth client vars anywhere (consistent with Section 6).

---

## SECTION 9: README & DOCUMENTATION
- Setup steps reference only scripts that actually exist (correctly avoids the broken `npm run dev`).
- Test credentials (`alex.johnson@university.edu` / `StudentPass123!`, `alice.thompson@university.edu` / `TeacherPass123!`, `sarah.chen@university.edu` / `AdminPass123!`) match SEED_REPORT.md exactly and were verified live in this audit.
- API endpoints are documented and match the real `/api/v0/stats/*` routes.
- **README.md already has a "Known Limitations" section self-disclosing**: no OAuth, no Dockerfile/CI, uneven test coverage, no root dev/build/start scripts. This is good-faith transparency and should be weighed positively — most of Sections 6–8's findings are not surprises the author was hiding, just gaps they'd already flagged. It does **not**, however, mention the two crash bugs (Section 4, #1–2) or the fake-suspend feature (#3) — those were previously unknown.

---

## SECTION 10: GIT & CODE QUALITY
- `git log --oneline`: 2 commits (`Initial commit`, `Update README.md`) — too little history to judge commit hygiene either way.
- `console.log`: 2 hits, both benign CLI output in `src/server/db/migrate.ts`.
- `TODO`/`FIXME`: 0 hits.
- `npm run lint`: **FAILS — 83 errors, 3 warnings** (confirmed by direct run). Breakdown: mostly `@typescript-eslint/no-explicit-any` and `no-unused-vars` across dashboard pages, one `no-empty` block (`src/app/dashboard/student/page.tsx:187`), and — most importantly — the two `react/jsx-no-undef` errors that are Section 4's crash bugs. Lint would have caught both crashes before they shipped.
- `npx tsc --noEmit -p tsconfig.server.json` (backend): **passes cleanly**.
- Frontend type-check / `next build`: **fails** (see Section 7).

---

## SECTION 11: DOCKER & DEPLOYMENT
- No root-level `Dockerfile`, no `.dockerignore`.
- `docker-compose.yml` exists but only defines `postgres` + `redis` — no app services. This narrowly satisfies the spec's separate "Docker Setup" section (which literally only asks for a Postgres compose file) but **not** the "Containerization" section's explicit requirement: *"Containerize all the services so they can be spun up via a singular, root-level Dockerfile."*
- No `.github/workflows` directory — the CI/CD requirement ("run all tests and build all services," "push to Docker Hub") is entirely unimplemented.
- No Nginx config, no Certbot/SSL setup, no evidence of any deployment — the "Deployment Guide" section is unaddressed (reasonable to deprioritize for a take-home, but formally unmet).

---

## SECTION 12: SPECS.MD REQUIREMENTS — LINE BY LINE

| Requirement | Status |
|---|---|
| Admin: CRUD teacher groups | ❌ Missing entirely (no table, no routes, no UI) |
| Admin: CRUD users | 🟡 Partial — read-only (`GET /api/admin/users`); no create/update/delete |
| Admin: Suspend/unsuspend students | ❌ Missing — frontend fakes it (Section 4 #3), DB column unused |
| Admin: Suspend/unsuspend teachers | ❌ Same as above |
| Teacher: CRUD classes | 🟡 Partial — Create+Read only, no Update/Delete |
| Teacher: Add/remove students | 🟡 Partial — only student self-enroll-by-code exists; no teacher-initiated add, no remove/unenroll anywhere |
| Teacher: Publish assignments | ✅ Met |
| Teacher: Grade submissions + feedback | ✅ Met, verified live with rubric scoring |
| Student: View classes/assignments | ✅ Met |
| Student: Submit assignments | 🔴 Broken — crashes for unsubmitted assignments (Section 4 #1) |
| Student: View grades/feedback | ✅ Met (previously-broken per SEED_REPORT, now fixed) |
| Extra credit: Chatbot | ❌ Not implemented |
| School Statistics API (6 endpoints) | ✅ Met, all verified live with real data |
| Auth: JWT + secure HTTP-only cookies | ✅ Met |
| Auth: ≥1 OAuth provider | ❌ Not implemented |
| Testing: 100% coverage, CI-enforced | ❌ 64.07% actual, no CI exists, frontend excluded from measurement |
| Testing: E2E with Playwright | ❌ Installed but unused, zero spec files |
| CI/CD: test+build+push to Docker Hub | ❌ No `.github/workflows` at all |
| Docker Compose (Postgres) | ✅ Met (as literally scoped in that section) |
| Containerization: single root Dockerfile, all services | ❌ No Dockerfile exists |
| Deployment: Docker Compose + Nginx + Certbot | ❌ Not attempted |
| `npm install && npm run dev` | ❌ `dev` script doesn't exist; README documents the real (2-terminal) alternative |

---

## SECTION 13: SUMMARY

| Severity | Count | Items |
|---|---|---|
| 🔴 Critical | 2 | Student submit-assignment page crash; Teacher class-detail crash on 0 assignments |
| 🟠 High | 3 | Fake suspend feature; unhandled 500 on malformed IDs; no E2E tests despite being required |
| 🟡 Medium | 5 | Frontend role-bypass (auth≠authz); no Dockerfile/CI; no root dev/build/start scripts; admin user CRUD read-only; frontend excluded from coverage |
| 🟢 Low | 4 | No OAuth (self-disclosed); Deployment guide unaddressed; extra-credit chatbot skipped; minimal git history |

**Net picture**: the "adjacent-to-spec" plumbing (auth, RBAC at the API layer, the 6 stats endpoints, grading, DB schema) is solid and was independently verified end-to-end. The two critical bugs are narrow (two missing icon imports) but land squarely on the most common code paths for two of the three roles, and both are exactly the kind of thing `npm run lint` (or a CI gate) would have caught — which is itself the through-line explaining most of the other gaps: there's no CI to catch lint failures, no E2E tests to catch page crashes, and no 100%-coverage gate to catch the untested stats controller.
