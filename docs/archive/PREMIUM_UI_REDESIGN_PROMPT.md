# PROMPT: Premium UI/UX Redesign — Concentrate Canvas Portal

Copy everything below this line into your coding AI.

---

## ROLE

You are a senior product designer + frontend engineer redesigning an existing, working
Canvas-style school portal (Next.js 15 App Router, React 19, TailwindCSS, Radix/shadcn UI).
Your job is a **visual and UX overhaul only**. The backend (Fastify) and its API contracts
are frozen. The result should look like a well-funded EdTech SaaS — think Linear's polish,
Notion's calm, Stripe's typography discipline.

## HARD CONSTRAINTS — READ FIRST

1. **Do not change any API route, method, or payload.** The frontend must keep calling the
   exact same endpoints (`/api/auth/*`, `/api/classes/*`, `/api/assignments/*`,
   `/api/submissions/*`, `/api/admin/*`). You may ADD calls to existing endpoints, never
   invent new backend routes.
2. **Do not break auth**: JWT in secure HTTP-only cookies; login → `/dashboard`;
   role-based rendering (admin / teacher / student) must keep working.
3. **Keep all existing page routes**: `/login`, `/register`, `/dashboard`,
   `/dashboard/teacher/classes/[id]`, `/dashboard/teacher/assignments/[id]`,
   `/dashboard/student/classes/[id]`. You may add nested routes for UX (e.g. a grades page)
   but never remove or rename existing ones.
4. **Dependencies**: only what's already in `package.json` plus Radix/shadcn components.
   No new chart libs, animation libs, or icon packs unless already installed
   (lucide-react is available via shadcn). Use CSS/Tailwind transitions, not framer-motion,
   unless it's already a dependency.
5. All existing tests must still pass; update selectors/test-ids where markup changes.
6. Everything must work in both light and dark mode.

## KNOWN FUNCTIONAL BUGS — FIX THESE AS PART OF THE REDESIGN

These were found during a full seeding run; they are frontend-side fixable:

1. **Teacher "Pending Submissions" panel is always empty.** It calls
   `GET /api/submissions?status=submitted&teacher_id=...` and
   `GET /api/classes/:id/submissions?status=submitted` — **neither route exists (404)**.
   Fix on the frontend: aggregate pending items by iterating the teacher's classes →
   `GET /api/classes/:id/assignments` → `GET /api/assignments/:id/submissions`
   (this route exists and works for teachers) and filter `status === "submitted"` vs graded
   (a submission is graded if it appears in `GET /api/classes/:id/grades`).
2. **Students never see their grades.** Student pages call
   `GET /api/assignments/:id/submissions`, which is teacher-only → 403.
   Fix: students should use `GET /api/classes/:id/grades` (works for enrolled students —
   verify; if it 403s, use `GET /api/submissions/:id` for their own submission and render
   grade data from there). "Recent Grades" on the student dashboard and the per-assignment
   "Your Submission" panel must show: submitted state, rubric breakdown per criterion,
   total score, and teacher feedback.
3. **Student class cards are the teacher component**: they show "0 students", the enrollment
   code, and View/Edit buttons that do nothing. Build a proper student class card
   (name, instructor, next due date, grade-so-far if available, "Open class" → 
   `/dashboard/student/classes/[id]`).
4. **Register form race**: the first click of "Create Account" sometimes doesn't submit when
   fields were autofilled. Ensure validation state derives from values (not only blur events)
   and the submit handler is not gated on stale state.

## DESIGN SYSTEM — TOKENS

Define everything as CSS variables in `globals.css`, consumed via Tailwind config.

### Color (light)
- `--background: #FAFAF9` (warm off-white, not pure white)
- `--surface: #FFFFFF`; `--surface-raised: #FFFFFF` with shadow, never gray-on-gray
- `--border: #E7E5E4` (1px, subtle); `--border-strong: #D6D3D1`
- `--primary: #4F46E5` (indigo-600) with `--primary-hover: #4338CA`
- `--primary-soft: #EEF2FF` (chips, selected states)
- Text: `--text-primary: #1C1917`, `--text-secondary: #57534E`, `--text-tertiary: #A8A29E`
- Semantic: success `#059669` / soft `#ECFDF5`; warning `#D97706` / soft `#FFFBEB`;
  danger `#DC2626` / soft `#FEF2F2`; info `#0284C7` / soft `#F0F9FF`
- Grade tiers: A `#059669`, B `#0284C7`, C `#D97706`, D/F `#DC2626` — always pair the color
  with a soft background pill, never raw colored text on white.

### Color (dark)
- `--background: #0C0A09`; `--surface: #1C1917`; `--border: #292524`
- Primary shifts to `#6366F1`; text `#FAFAF9` / `#A8A29E` / `#78716C`
- No pure black, no pure white. Shadows replaced by 1px borders + subtle surface lightening.

### Typography
- Font: Inter or Geist (whichever is already available via `next/font`) — variable weight.
- Scale: 12 / 13 / 14 (body) / 16 / 18 / 22 / 28 / 36. Never larger than 36.
- Page titles: 28px semibold, tight tracking (-0.02em). Section headers: 13px UPPERCASE
  medium, `--text-tertiary`, letter-spacing 0.05em.
- Numbers (grades, stats): tabular-nums, semibold.

### Shape, depth, spacing
- Radius: 8px inputs/buttons, 12px cards, 16px modals; pills fully rounded.
- Shadows: two levels only. `shadow-sm` for cards, a soft 24px-blur ambient for modals.
  Nothing floats loudly.
- Spacing on an 8px grid; card padding 20–24px; page gutter `max-w-[1200px] mx-auto px-6`.
- Every interactive element: visible hover, focus-visible ring (2px primary, offset 2),
  and 150ms ease-out transitions on color/shadow/transform only.

## APP SHELL

Replace the current top-bar-only layout with a **fixed left sidebar (240px)** + content:

- Sidebar: logo top; nav items with lucide icons (Dashboard, Classes, Assignments,
  Grades, — plus Users & Schools for admin); active item = `--primary-soft` background +
  primary text + 2px left indicator; bottom = user card (avatar with initials, name, role
  badge) with a Radix DropdownMenu (theme toggle, logout).
- Topbar within content: page title + breadcrumbs left; contextual primary action right
  (e.g. "+ Create Class"). Sticky, backdrop-blur, hairline bottom border.
- Mobile (<1024px): sidebar collapses to a Radix Dialog drawer with a hamburger.
- Keep the dark-mode toggle; animate with a 200ms crossfade, persist preference.

## PAGE-BY-PAGE SPECS

### /login and /register
- Split screen: left 45% brand panel (deep indigo gradient `#312E81 → #4F46E5`, subtle
  grid/noise texture, product wordmark, one testimonial-style line, three small feature
  bullets). Right 55%: centered 400px form card on `--background`.
- Inputs: 44px height, icon-in-field, floating or top labels (pick one, be consistent),
  inline validation messages under fields (never alerts), password strength meter as a
  4-segment bar.
- Primary button full-width 44px with loading spinner state; disable while submitting
  (fixes bug #4).
- Role select on register: three selectable cards (Student / Teacher / Administrator) with
  icon + one-line description instead of a native dropdown; keep the same submitted value.

### /dashboard — Admin
- Header: "Good morning, {firstName}" + date, small.
- Stat cards (Teachers, Students, Classes, Avg Grade, Pending, Schools): icon in tinted
  squircle, 28px tabular number, label 13px tertiary, subtle delta text slot. 3-col grid.
- School Average card gets a thin radial/progress ring (SVG, no lib).
- Users table: real table with sticky header, 48px rows, avatar initials, role as soft pill
  (admin red-soft, teacher blue-soft, student green-soft), search input + role filter tabs,
  row hover, kebab menu (Radix) per row for existing suspend/CRUD actions.
- Registered Schools: card list with school avatar, name, ID as copyable mono chip.

### /dashboard — Teacher
- "My Classes" as rich cards: class name, student count with people icon, enrollment code
  as a **copy-to-clipboard mono chip with a toast** ("Code copied"), assignment count,
  class average as tier-colored pill, footer actions Open / Edit.
- Pending Submissions (after bug #1 fix): grouped by class → assignment; each row =
  student avatar+name, assignment title, submitted-at relative time ("2h ago"), and a
  primary "Grade" button that deep-links to the assignment page with that submission open.
  Empty state: friendly illustration-style checkmark, "All caught up", one line of copy.
- Create Class: Radix Dialog modal (not inline), 2 fields + character counter on
  description; success = toast + card appears with a subtle scale-in.

### /dashboard/teacher/classes/[id]
- Header card: class name, description (2-line clamp with "more"), code chip (copyable),
  enrolled count, class average pill, "+ Add Assignment" primary.
- Two-column: left = assignments list (title, due date with urgency color when <72h,
  submissions progress as "9/13 graded" mini progress bar, chevron); right = Class Ledger
  with Radix Tabs (Roster / Gradebook).
- Gradebook rows: avatar, name, assignment, score as `94/100` tabular + tier pill,
  feedback preview 1-line clamp, click opens grade detail sheet (Radix Dialog side sheet)
  with full rubric breakdown table and feedback.
- Roster rows: avatar, name, email, joined date if available; hover reveals "remove"
  (existing functionality only).

### /dashboard/teacher/assignments/[id]
- Header: title, description, due date pill, "Edit Assignment" secondary button
  (uses existing `PUT /api/assignments/:id`).
- Rubric Guide: table-style card, criterion + max pts right-aligned mono; total row.
- Submissions roster: status pill (Submitted = amber soft "Needs grading", Graded = green
  soft with score); clicking opens a **grading side sheet**: student header, submission
  text in a readable serif-ish block (or mono for code), rubric criteria as number inputs
  with steppers clamped to max, live computed total with letter grade, feedback textarea
  (autosize), "Submit Grade" primary. POST to existing
  `/api/submissions/:id/grades` with `{rubric_scores:[{criterion,score}], feedback}`.
- After grading: optimistic UI, toast, row flips to Graded.

### /dashboard — Student
- Proper student cards (bug #3 fix): class name, instructor, next due assignment
  ("OSI Model — due in 5 days" with urgency color), current grade pill if graded,
  "Open class".
- "Assignments Due" rail: vertical timeline sorted by due date across all classes,
  each item shows class chip + title + due; overdue in danger.
- "Recent Grades" rail (bug #2 fix): score pill, assignment, class, relative time;
  click → grade detail (rubric breakdown + feedback) in a side sheet.
- Available Classes: distinct visual treatment (dashed border or tinted background),
  instructor, description clamp, "Enroll" button that opens a confirm dialog showing the
  code input if required by existing flow.

### /dashboard/student/classes/[id]
- Keep master-detail: left assignment list (due date, status dot: gray upcoming / amber
  submitted / green graded), right detail panel.
- Detail panel states:
  a) Not submitted: rubric requirements table + textarea/file submission card + "Submit Work".
  b) Submitted, ungraded: read-only view of their submission + "Submitted {relative}" banner.
  c) Graded: score hero (big tabular `94/100` + tier pill), rubric breakdown table
     (criterion, earned/max, mini bar), teacher feedback in a quoted card with teacher name.
- This state machine is the core of bug #2 — it must reflect reality after the fix.

## SHARED COMPONENT REQUIREMENTS

- **Toasts**: single system (shadcn/sonner if present, else Radix Toast), bottom-right,
  used for every mutation success/failure. No `alert()`.
- **Skeletons**: every data region gets a skeleton (shimmer) matching its final layout;
  no spinners for page loads; no layout shift.
- **Empty states**: icon in soft circle, 16px title, 13px description, optional action.
  Write real copy per context — never "No data".
- **Error states**: inline card with retry button; API errors surface the message.
- **Avatars**: initials on deterministic soft background (hash name → hue).
- **Confirm dialogs** for destructive actions.
- **Command-K niceness (optional, last)**: Radix-based quick nav for classes/pages.

## ACCESSIBILITY & QUALITY BARS

- WCAG AA contrast everywhere (check tier pills in dark mode especially).
- Full keyboard nav: tabs, dialogs, menus (Radix gives most of it — don't fight it).
- `aria-label` on icon-only buttons; form fields with real `<label>`s.
- `prefers-reduced-motion`: disable transforms, keep opacity fades.
- No console errors/warnings; no hydration mismatches; Lighthouse a11y ≥ 95.

## ACCEPTANCE CHECKLIST (will be verified against the running app)

The app is seeded: 3 admins, 5 teachers, 20 students, 8 classes, 75 graded submissions.
Test creds: teacher `alice.thompson@university.edu` / `TeacherPass123!`,
student `alex.johnson@university.edu` / `StudentPass123!`,
admin `sarah.chen@university.edu` / `AdminPass123!`.

- [ ] Login/register redesigned; register submits reliably on first click
- [ ] Sidebar shell on all dashboard pages; works on mobile; dark mode consistent
- [ ] Admin: stat cards show real numbers (6/21/8/73.3%/0/1); user table searchable
- [ ] Teacher dashboard: pending submissions actually lists ungraded work (bug #1)
- [ ] Teacher can grade via side sheet; total auto-computes; toast on success
- [ ] Copy-code chip works with toast
- [ ] Student dashboard: real student cards; Recent Grades populated (bug #2)
- [ ] Student assignment panel shows submitted/graded states with rubric + feedback
- [ ] Alex Johnson sees 94/100 on CS101 OSI assignment with 4-row rubric breakdown
- [ ] All 6 existing routes still resolve; no API contract changes; tests pass
- [ ] Zero console errors; AA contrast; keyboard navigable

Work in this order: tokens/shell → login/register → teacher flows (incl. bug fixes) →
student flows (incl. bug fixes) → admin → polish (skeletons, toasts, empty states).
Commit per section with clear messages.
