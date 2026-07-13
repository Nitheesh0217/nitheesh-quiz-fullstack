# Architecture

## Directory layout

```
src/
├── app/                    # Next.js App Router (frontend)
│   ├── dashboard/
│   │   ├── admin/          # admin console: users, schools, teacher groups
│   │   ├── teacher/        # classes, assignments, grading, syllabus/announcements
│   │   ├── student/        # enrolled classes, submissions, grades
│   │   └── layout.tsx      # role-aware sidebar + topbar shell
│   ├── layout.tsx
│   └── page.tsx
├── components/              # shared React components (Button, Input, Modal, AuthProvider, ChatWidget, ...)
├── lib/                     # browser-side helpers (apiCall fetch wrapper with 401 refresh-retry, auth types)
└── server/                  # Fastify backend
    ├── controllers/         # business logic, one file per resource
    ├── db/                  # Kysely connection, generated types, migrations
    ├── middleware/          # auth, RBAC, rate limiting
    ├── routes/               # route definitions - parse with Zod, call a controller
    ├── utils/                # jwt, password hashing, email, LLM router, chat tools
    ├── app.ts                # Fastify instance + plugin registration + error handler
    └── server.ts             # production entrypoint
```

## Request flow

A request like `GET /api/classes/:id` goes:

1. **Route** (`src/server/routes/classes.ts`) — parses `class_id` with Zod, no logic of its own.
2. **Middleware** — `authenticate` verifies the JWT from the cookie and attaches `request.user`; `requireRole(...)` rejects the wrong role with a 403 before the handler runs.
3. **Controller** (`src/server/controllers/classController.ts`) — `getClassById(classId, user)` does the actual ownership/enrollment check and query.
4. **Kysely** — type-safe query against Postgres; the return type is checked at compile time against the generated schema types in `src/server/db/types.ts`.

Errors are thrown as typed subclasses (`NotFoundError`, `ForbiddenError`, `ConflictError`, `ValidationError`) and translated into the right HTTP status by a single error handler in `app.ts`, so individual routes don't each hand-roll status codes.

## Cascade deletes

Defined at the migration level, not in application code:
- Deleting a class cascades to its enrollments, assignments, submissions, and grades.
- Deleting an assignment cascades to its submissions and grades.
- Deleting a user cascades to their enrollments/submissions. Suspending a user just sets `is_suspended = true` and leaves their history intact — suspension and deletion are deliberately different operations.

## Auth (two independent checks)

- **Next.js middleware** (`src/middleware.ts`) decodes the JWT at the edge and redirects `/dashboard/*` requests before the page renders — this is for UX (no flash of the wrong dashboard), not the security boundary.
- **Fastify RBAC** (`src/server/middleware/rbac.ts`) re-checks the same JWT and role on every backend route independently:
  ```typescript
  export function requireRole(...allowedRoles: UserRole[]) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user || !allowedRoles.includes(request.user.role)) {
        throw new ForbiddenError('You do not have permission to access this resource');
      }
    };
  }
  ```
  A student calling a teacher-only endpoint directly (bypassing the UI entirely) still gets a 403 here — the middleware redirect is not what's actually protecting the data.

## AI chat assistant

`src/components/ChatWidget.tsx` (frontend) and `src/server/routes/chat.ts` + `src/server/utils/chatTools.ts` (backend). The model doesn't get a data dump up front — it calls tool functions (`get_my_grades`, `get_my_assignments`, `get_class_roster`, etc.) that are scoped to the authenticated user server-side, so it physically cannot read another student's grades or a teacher's roster it doesn't own. If `AI_API_KEY` isn't set, or the provider call fails, `src/server/utils/llmRouter.ts` falls back to a deterministic mock stream built from the same real tool data, so the feature still works end to end without a live API key.
