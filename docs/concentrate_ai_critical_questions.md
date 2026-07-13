# Critical Questions Before You Code

## PART 1: CLARIFICATIONS FOR ANDY'S CALL

Ask these during the call if you haven't already clarified:

### Scope & Prioritization
- **Multiple submissions per assignment?** Can a student re-submit before the deadline? (Answer: Probably no for MVP—one submission per student per assignment keeps it simple.)
- **File types allowed?** .pdf, .docx, .jpg only? Or anything? (Answer: Probably all files, let the teacher decide. No server-side validation for now.)
- **File size limits?** (Answer: 50MB? 10MB? Confirm with Andy.)
- **Draft submissions?** Can students save drafts without submitting? (Answer: Probably no for MVP—either saved draft state or instant submit. Choose one.)

### Data & Permissions
- **Multi-school?** Is this a single school or multi-tenant SaaS? (Answer: Spec says "schools" plural, so multi-tenant. Each user belongs to one school.)
- **Cross-school visibility?** Can an admin see other schools? (Answer: Probably no—each admin belongs to one school.)
- **Student enrollment:** Auto-enroll or self-enroll via code? (Answer: Both. Admin can manually add, or student can enroll with code.)
- **Grade visibility:** Can students see each other's grades? (Answer: No. Only their own.)
- **Teacher notes?** Can teachers add private notes to a submission (not visible to students)? (Answer: Probably no for MVP. Feedback is the only note field.)

### Grading & Rubrics
- **Rubric scores:** Must sum to 100? Or arbitrary totals? (Answer: No min/max—just sum the criteria.)
- **Partial credit?** Teacher enters 0-max_points for each criterion? (Answer: Yes. No preset tiers like "excellent/good/poor"—just numbers.)
- **Late submissions?** Any penalty mechanism? (Answer: No for MVP. Just track submission timestamp and let teacher decide.)
- **Re-grading:** Can a teacher edit a grade after it's submitted? (Answer: Yes. Allow edit anytime.)
- **Locked submissions?** Once graded, can student see the submission while grading is in progress? (Answer: Probably no—show "pending" status until grade is posted.)

### Chatbot (Bonus)
- **What format are class materials?** URLs, uploaded PDFs, text pasted in? (Answer: Probably URLs + PDF uploads. Assume OpenAI API available.)
- **Rate limiting?** Limit students to N questions/day? (Answer: Yes, 10/day to save costs.)

---

## PART 2: CRITICAL DESIGN DECISIONS YOU MAKE NOW

### Database Design

**Decision 1: Submission versioning**
- **Option A:** One submission per student per assignment. Can update before due date.
- **Option B:** Base users table + teacher_profiles, admin_profiles, student_profiles.
- **MVP:** Choose A. Simpler, less data storage.

**Decision 2: Rubric as JSON**
- Why JSON and not separate tables?
  - Rubric is tight coupling to assignment: teacher defines criteria per assignment, not reused.
  - Easier to iterate (teacher can change rubric before grading starts).
  - Grade-time snapshot: store the exact rubric criteria that were scored, not a foreign key that could change.
- Store as `JSONB` in assignments table + grades table (denormalize for audit trail).

**Decision 3: Grade calculation**
- Automatic: backend sums the rubric_scores on save.
- No formula column, no weighted averages—just sum.
- Per-class average (dashboard) is SELECT AVG(total_score) WHERE student_id = X AND class_id = Y.

**Decision 4: User roles enum vs separate tables**
- Option A: Single users table, role as ENUM.
- Option B: Base users table + teacher_profiles, admin_profiles, student_profiles.
- MVP: Choose A. Simpler, fewer joins.

---

### API Design

**Decision 1: Pagination**
- All list endpoints paginate. Default limit=20, max=100.
- Use cursor pagination? Or offset/limit?
  - Cursor is better for real-time data (submissions could be added mid-scroll).
  - Offset is simpler to implement.
  - MVP: offset/limit. Migrate to cursor later if needed.
- Example: GET /api/assignments/123/submissions?limit=20&offset=0

**Decision 2: Filtering**
- GET /api/classes/:class_id/assignments?status=pending (filter by submission status)
- GET /api/classes/:class_id/submissions?graded=false (show pending grades)
- Implement as query params, validate with Zod.

**Decision 3: Error responses**
- All errors return JSON: { error: string, code: string, details?: object }
- Example: { error: "Unauthorized", code: "FORBIDDEN", details: { required_role: "teacher" } }
- HTTP status codes: 200 success, 400 bad input, 401 auth fail, 403 permission fail, 404 not found, 500 server error.

**Decision 4: File upload handling**
- POST /api/assignments/:id/submit with multipart/form-data (file + optional text_content).
- Backend saves file locally to /uploads/submissions/{submission_id}/{filename}.
- Return file_url as relative path: "/uploads/submissions/{id}/{filename}".
- Frontend constructs full URL: `${API_URL}${file_url}` for downloads.

---

### Frontend Architecture

**Decision 1: Role-based routes**
- Use middleware to check user role on app load.
- If user is "student", redirect /admin -> /student/dashboard.
- If user is "teacher", redirect /student -> /teacher/dashboard.
- No front-end permissions logic—backend ALWAYS validates. Front-end only hides UI.

**Decision 2: Form handling**
- Use React Hook Form + Zod for validation (matches backend).
- Same schema on frontend and backend—import from shared types.
- Show validation errors inline, disable submit button until valid.

**Decision 3: File upload UI**
- Simple input type="file", no drag-drop for MVP.
- Show file name, size, progress bar while uploading.
- If upload fails, show error and let user retry.

**Decision 4: Dashboard role-specific cards**
- Admin: "Schools", "Teachers", "Students", "Submissions pending grading"
- Teacher: "My classes", "Pending submissions", "Recent grades", "Quick stats (avg grade)"
- Student: "Enrolled classes", "Upcoming assignments", "Recent grades", "My GPA"

---

### Authentication & Security

**Decision 1: JWT token lifetime**
- Access token: 1 hour.
- Refresh token: 7 days (in HTTP-only cookie, separate from access token).
- On access token expiry, frontend automatically refreshes using refresh token.
- Refresh endpoint: POST /api/auth/refresh (no body, sends refresh token cookie).

**Decision 2: Password hashing**
- Use bcrypt with salt rounds = 12 (industry standard).
- Never log or return password hash.
- Never transmit password over non-HTTPS (enforce in production).

**Decision 3: CORS**
- Allow frontend domain only: Access-Control-Allow-Origin: https://yourdomain.com
- Allow credentials: Access-Control-Allow-Credentials: true
- Preflight cache: 86400 seconds.

**Decision 4: Rate limiting**
- Auth endpoints: 5 requests / minute per IP.
- All endpoints: 100 requests / minute per user (use Redis).
- If exceeded, return 429 (Too Many Requests).

---

### Frontend-Backend Contract

**Decision 1: Shared types**
- Create `src/types/index.ts` that BOTH frontend and backend import.
- Define User, School, Class, Assignment, Submission, Grade as interfaces.
- Use this for TypeScript type checking + Zod schema derivation on backend.

**Decision 2: API base URL**
- Environment variable: NEXT_PUBLIC_API_URL (for frontend).
- Backend can infer: if frontend is at yourdomain.com/app, API is at yourdomain.com/api.
- In dev: frontend at localhost:3000, API at localhost:3001 (different ports, CORS needed).

**Decision 3: Error handling**
- Frontend catches all API errors, displays user-friendly message.
- If 401: redirect to login.
- If 403: show "You don't have permission" (don't let user try again).
- If 500: show "Server error, try again later" + log to monitoring.

---

## PART 3: WHAT TO BUILD INCREMENTALLY

### Sprint 1 Milestones (Auth + Schema + Admin)

Checkpoint 1: Database schema + migrations work
- [ ] Create users, schools tables
- [ ] Run migration, verify tables exist in PostgreSQL
- [ ] Write one test: insert a user, query it back

Checkpoint 2: Auth endpoints work
- [ ] POST /api/auth/register creates user + hashes password
- [ ] POST /api/auth/login validates password + returns JWT
- [ ] GET /api/auth/me returns current user (from JWT)
- [ ] Write 5 tests: register, login, me endpoint, invalid password, missing fields

Checkpoint 3: Basic frontend + JWT handling
- [ ] Login page (email, password form)
- [ ] Register page
- [ ] Frontend stores JWT in cookie (via Set-Cookie header)
- [ ] Frontend includes JWT in all requests (automatic with credentials)
- [ ] Logout clears cookie

Checkpoint 4: Role-based route protection
- [ ] Admin page (admin-only, returns 403 if not admin)
- [ ] Student page (student-only)
- [ ] Teacher page (teacher-only)
- [ ] Middleware on each route checks role

### Sprint 2 Milestones (Classes + Assignments)

Checkpoint 1: Teacher can create class
- [ ] POST /api/classes creates class (teacher_id auto-filled from JWT)
- [ ] Class has unique enrollment code
- [ ] GET /api/classes returns user's classes (filtered by role: admin sees all, teacher sees owned, student sees enrolled)

Checkpoint 2: Student can enroll via code
- [ ] POST /api/classes/:id/enroll with { code } adds student to class
- [ ] Student now sees class in GET /api/classes

Checkpoint 3: Teacher can create assignment with rubric
- [ ] POST /api/classes/:id/assignments with { title, description, due_date, rubric }
- [ ] Zod schema validates rubric: array of { criterion: string, max_points: number }
- [ ] GET /api/assignments/:id returns full assignment with rubric

Checkpoint 4: Student can view assignments
- [ ] GET /api/classes/:id/assignments (student sees only their enrolled classes' assignments)
- [ ] Show assignment details: title, description, rubric, due_date

### Sprint 3 Milestones (Submissions + Grading)

Checkpoint 1: Student can submit assignment
- [ ] POST /api/assignments/:id/submit with { file, text_content? }
- [ ] Backend saves file to /uploads, stores submission in DB
- [ ] Student can only submit to classes they're enrolled in

Checkpoint 2: Teacher can view pending submissions
- [ ] GET /api/assignments/:id/submissions lists all submissions for assignment
- [ ] Filter: graded=false shows pending only
- [ ] Each row shows student name, submission time, status

Checkpoint 3: Teacher can grade submission
- [ ] GET /api/submissions/:id shows full submission + rubric
- [ ] POST /api/submissions/:id/grades with { rubric_scores, feedback }
- [ ] Backend calculates total_score, stores grade
- [ ] Teacher can edit grade via PUT /api/submissions/:id/grades

Checkpoint 4: Student can view grades + feedback
- [ ] GET /api/students/:id/grades returns student's grades
- [ ] Dashboard shows: assignment name, score, feedback, date graded
- [ ] Can click grade to see rubric breakdown

---

## PART 4: COMMON PITFALLS & HOW TO AVOID

### Pitfall 1: Forgetting role checks on every endpoint
- **Symptom:** Student can view other students' submissions.
- **Fix:** Every endpoint that reads data must check: is this user allowed to see this data?
  - Example: GET /api/submissions/:id should check: is user the student who submitted, OR the teacher of the class, OR an admin?
  - Put this in a helper function: `canAccessSubmission(user, submission)`
  - Call it on EVERY endpoint. Don't assume the frontend prevented it.

### Pitfall 2: Storing user ID wrong in JWT
- **Symptom:** Different user can pretend to be another by changing their user_id in the cookie.
- **Fix:** User ID in JWT is cryptographically signed. Frontend can't forge it.
  - Verify signature on backend on every request.
  - If signature invalid, return 401 Unauthorized.

### Pitfall 3: Rubric changes after grading
- **Symptom:** Teacher adds a new criterion after grading submissions → grade table doesn't have that criterion.
- **Fix:** Store rubric in BOTH assignments and grades tables.
  - grades.rubric_scores = snapshot of the criteria that were graded.
  - Don't rely on joining to assignments.rubric (it changes).

### Pitfall 4: Forgetting to validate file uploads
- **Symptom:** Student uploads 5GB file → server runs out of disk.
- **Fix:** Validate file size before saving.
  - MAX_FILE_SIZE = 50MB (configurable).
  - Check Content-Length header before reading file.
  - Return 413 Payload Too Large if exceeded.

### Pitfall 5: JWT expires mid-workflow
- **Symptom:** Student fills out a long assignment form, submits, and gets 401 Unauthorized.
- **Fix:** Implement token refresh.
  - Frontend detects 401 → calls POST /api/auth/refresh.
  - Backend returns new access token.
  - Frontend retries original request.
  - Use a middleware to do this automatically.

### Pitfall 6: N+1 query in grade book
- **Symptom:** "Show grades for all 30 students" → 30 database queries (one per student).
- **Fix:** Use SQL joins.
  - SELECT grades.*, students.name FROM grades JOIN users AS students ON ...
  - Fetch all data in ONE query.

### Pitfall 7: Hardcoding role checks
- **Symptom:** if (user.role === 'teacher') all over the codebase → brittle.
- **Fix:** Use a helper:
  ```typescript
  const isTeacher = (user: User) => user.role === 'teacher';
  const canGrade = (user: User, submission: Submission) => 
    isTeacher(user) && isTeacherOfClass(user, submission.class_id);
  ```
  - Centralize permission logic.
  - Easier to test and change.

---

## PART 5: TESTING MINDSET

### What to test in Sprint 1
- [ ] User can register with valid email + password
- [ ] User CANNOT register with invalid email
- [ ] User CANNOT register if email already exists
- [ ] User can login with correct password
- [ ] User CANNOT login with wrong password
- [ ] JWT is valid after login + can be used in GET /api/auth/me
- [ ] Student accessing /api/admin/schools returns 403

### What to test in Sprint 2
- [ ] Teacher can create class (check DB)
- [ ] Non-teacher cannot create class (returns 403)
- [ ] Class has unique enrollment code
- [ ] Student can enroll with valid code
- [ ] Student CANNOT enroll twice
- [ ] Teacher can create assignment with valid rubric
- [ ] Invalid rubric (missing criterion or max_points) is rejected

### What to test in Sprint 3
- [ ] Student can upload file to assignment
- [ ] File is saved to disk + URL returned
- [ ] Student CANNOT upload to class they're not enrolled in
- [ ] Teacher sees pending submissions for their classes only
- [ ] Teacher can grade submission (grade stored in DB)
- [ ] Student sees their own grade after teacher grades
- [ ] Student CANNOT see another student's grade
- [ ] Grade total_score = sum of rubric_scores

---

## PART 6: DEPLOYMENT CHECKLIST (Do these BEFORE recording video)

- [ ] No console.log() or console.error() in production code
- [ ] All environment variables are in .env.example (not checked in)
- [ ] Database works with both dev (local) and demo (docker-compose)
- [ ] All routes have error handling (no unhandled promise rejections)
- [ ] README.md explains how to set up locally (clone, npm install, .env, npm run dev, npm run db:migrate)
- [ ] Video walkthrough: create school → teacher → class → assignment → student → submit → grade → view
- [ ] Video is clear + shows all three user workflows (don't just show teacher)
- [ ] Git log is clean (meaningful commit messages, no "fix" or "asdf")
- [ ] No sensitive data in git history (keys, passwords, real emails)

---

## NEXT STEPS

1. **After the call with Andy (today):** Update this doc with his answers.
2. **Before coding (tonight):** Skim the Fastify + Kysely docs (1 hour total).
3. **Day 1:** Set up project structure + database schema.
4. **Day 2:** Auth endpoints + JWT middleware.
5. **Days 3-4:** Classes + assignments.
6. **Days 5-6:** Submissions + grading.
7. **Day 7:** Polish, test, record video.

**Questions to return to before coding ANY feature:**
- Who can access this? (RBAC)
- What data do I need to fetch? (Query optimization)
- What could go wrong? (Error handling)
- How do I test this? (Write test first)

You're ready. Good luck.
