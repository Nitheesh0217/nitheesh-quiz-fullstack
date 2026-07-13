# Concentrate AI Canvas-Style School Portal — Complete System Design

## 1. SYSTEM OVERVIEW

**What we're building:** A multi-tenant SaaS platform for K-12 schools to manage classrooms, assignments, submissions, and grading. Three distinct user roles with different workflows and permissions. Optional LLM chatbot for student Q&A.

**Core Problem:** Teachers need a way to distribute assignments, students need to submit work, and teachers need to grade efficiently—all in one place.

---

## 2. USER ROLES & PERMISSIONS

### **Admin**
- Creates/manages schools
- Creates/manages teachers and students
- Can view school-wide statistics (dashboard)
- Cannot create assignments or grade
- Cannot submit assignments

### **Teacher**
- Belongs to a school
- Can create classes within their school
- Can create assignments within their classes
- Can view all student submissions for their classes
- Can grade submissions and provide feedback
- Can view individual student progress/grades
- Cannot access other teachers' classes or grades
- Cannot create students or other admins

### **Student**
- Belongs to a school
- Can enroll in classes (or auto-enrolled by admin/teacher)
- Can view assignments in their classes
- Can submit assignments (one submission per assignment, or multiple if allowed)
- Can view their own grades and feedback
- Can view their own dashboard (courses, upcoming assignments, recent grades)
- Cannot see other students' submissions or grades
- Cannot access teacher-level features

---

## 3. DATA MODEL (DATABASE SCHEMA)

### **Core Entities**

```
USERS (base user table for all roles)
├── id: UUID
├── email: VARCHAR (unique)
├── password_hash: VARCHAR
├── name: VARCHAR
├── role: ENUM (admin, teacher, student)
├── school_id: UUID (FK to schools)
├── created_at: TIMESTAMP
├── updated_at: TIMESTAMP

SCHOOLS
├── id: UUID
├── name: VARCHAR
├── address: VARCHAR
├── created_by: UUID (FK to users, the creating admin)
├── created_at: TIMESTAMP

CLASSES
├── id: UUID
├── school_id: UUID (FK to schools)
├── teacher_id: UUID (FK to users, must be role=teacher)
├── name: VARCHAR (e.g., "AP Biology Period 3")
├── description: TEXT
├── code: VARCHAR (unique per school, for student enrollment, e.g., "BIO-P3-2024")
├── created_at: TIMESTAMP

STUDENT_ENROLLMENTS (join table for students -> classes, many-to-many)
├── id: UUID
├── class_id: UUID (FK to classes)
├── student_id: UUID (FK to users, must be role=student)
├── enrolled_at: TIMESTAMP
├── status: ENUM (active, dropped)

ASSIGNMENTS
├── id: UUID
├── class_id: UUID (FK to classes)
├── title: VARCHAR
├── description: TEXT
├── due_date: TIMESTAMP
├── rubric: JSONB (structure: [{criterion: string, max_points: number}])
│   Example: [
│     {"criterion": "Clarity of writing", "max_points": 25},
│     {"criterion": "Accuracy of analysis", "max_points": 50},
│     {"criterion": "Creativity", "max_points": 25}
│   ]
├── created_at: TIMESTAMP

SUBMISSIONS
├── id: UUID
├── assignment_id: UUID (FK to assignments)
├── student_id: UUID (FK to users, must be role=student)
├── file_url: VARCHAR (S3 or local path to uploaded file)
├── text_content: TEXT (optional, in-line submission)
├── submitted_at: TIMESTAMP
├── status: ENUM (submitted, graded, returned)

GRADES
├── id: UUID
├── submission_id: UUID (FK to submissions, unique)
├── assignment_id: UUID (FK to assignments)
├── student_id: UUID (FK to users)
├── class_id: UUID (FK to classes)
├── graded_by: UUID (FK to users, must be role=teacher)
├── rubric_scores: JSONB (structure: [{criterion: string, score: number}])
│   Example: [
│     {"criterion": "Clarity of writing", "score": 22},
│     {"criterion": "Accuracy of analysis", "score": 45},
│     {"criterion": "Creativity", "score": 20}
│   ]
├── total_score: NUMERIC (auto-calculated sum of rubric_scores)
├── feedback: TEXT (teacher's written feedback)
├── graded_at: TIMESTAMP
```

### **Relationships Summary**

```
User (role=admin) -> creates -> School
User (role=teacher) -> teaches -> Class -> has -> Assignments
User (role=student) -> enrolled in -> Class
User (role=student) -> submits -> Submission (for Assignment in Class)
Submission -> graded as -> Grade
Grade -> has -> rubric_scores (array of criterion + points)
```

---

## 4. CORE FEATURE FLOWS

### **Feature 1: Class Management (Admin + Teacher)**

**Admin Flow:**
1. Admin logs in → sees school dashboard
2. Clicks "Create class" → form (class name, teacher selection)
3. System creates class and assigns teacher
4. Admin can generate enrollment code for students to self-enroll

**Teacher Flow:**
1. Teacher logs in → sees their classes
2. Clicks "Create class" → form (class name, description, optional code)
3. System creates class, teacher is auto-assigned
4. Teacher can add students manually or share enrollment code

**Student Flow:**
1. Student logs in → sees "Enroll in class" option
2. Enters class code → system validates and enrolls student
3. Student now sees class in their dashboard

---

### **Feature 2: Assignment Management (Teacher)**

**Create Assignment:**
1. Teacher clicks "Create assignment" in a class
2. Form fields:
   - Title (required)
   - Description (required)
   - Due date (required)
   - Rubric (list of criteria with point values) (required)
3. System validates rubric (each criterion has a name and max points)
4. Assignment stored in DB

**Edit Assignment (before due date, or at least before grading):**
1. Teacher clicks "Edit" on assignment
2. Can change title, description, due date, rubric
3. System updates assignment
4. Existing submissions still point to the assignment

---

### **Feature 3: Student Submission (Student)**

**Submit Assignment:**
1. Student logs in → sees classes → clicks class
2. Views assignment details (title, description, due date, rubric)
3. Clicks "Submit" → file upload + optional text input
4. System validates file (optional: file size limits, types allowed)
5. Records submission with timestamp
6. Student sees confirmation + can view submission status

**Multiple Submissions (optional):**
- If allowed, student can re-submit before due date
- System keeps all submissions, but grade is on the latest
- Or: only allow one submission per student (simpler, start here)

---

### **Feature 4: Grading (Teacher)**

**Grade Submission:**
1. Teacher clicks "Grade submissions" in assignment
2. System shows list of students + submission status (submitted, graded, pending)
3. Teacher clicks on a student → sees:
   - Student name
   - Submission file/text
   - Rubric side-by-side (criteria with max points)
   - Input fields for teacher to enter score per criterion
4. Teacher enters scores and writes feedback
5. System calculates total score (sum of criterion scores)
6. Teacher clicks "Save grade" → grade stored in DB

**View Grades:**
- Teacher sees a grade book: table with students as rows, assignments as columns, grade values
- Can click a grade to edit it

---

### **Feature 5: Student Dashboard (Student)**

**View Grades:**
1. Student logs in → sees dashboard
2. Shows:
   - Enrolled classes (cards)
   - Upcoming assignments (due date, class)
   - Recent grades (assignment name, score, feedback)
   - Overall grade per class (calculated as average of all grades)

---

### **Feature 6: School Statistics (Admin)**

**Analytics:**
1. Admin logs in → clicks "Statistics"
2. Shows:
   - Total schools
   - Total teachers
   - Total students
   - Average class size
   - Assignments created this month
   - Submissions pending grading
   (This is the "school statistics REST API" mentioned in spec)

---

## 5. API ENDPOINTS (REST)

### **Authentication**

```
POST /api/auth/register
  Body: { email, password, name, role }
  Response: { user_id, token, role }

POST /api/auth/login
  Body: { email, password }
  Response: { token, user_id, role, school_id }

POST /api/auth/logout
  Response: { success: true }

GET /api/auth/me
  Headers: { Authorization: Bearer <token> }
  Response: { user_id, email, name, role, school_id }
```

### **Schools**

```
POST /api/schools (admin only)
  Body: { name, address }
  Response: { school_id, name }

GET /api/schools/:school_id (admin only, or self if user belongs)
  Response: { id, name, address, created_at }

GET /api/schools/:school_id/statistics (admin only)
  Response: { total_teachers, total_students, total_classes, ... }
```

### **Classes**

```
GET /api/classes (returns user's classes based on role)
  Response: [ { class_id, name, teacher_id, student_count } ]

POST /api/classes (teacher or admin)
  Body: { school_id, name, description, code? }
  Response: { class_id, code }

GET /api/classes/:class_id
  Response: { id, name, teacher_id, student_count, enrollment_code }

POST /api/classes/:class_id/enroll (student only)
  Body: { enrollment_code }
  Response: { success: true, class_name }

GET /api/classes/:class_id/students (teacher only)
  Response: [ { student_id, name, email, enrolled_at } ]
```

### **Assignments**

```
GET /api/classes/:class_id/assignments (teacher + students in class)
  Response: [ { assignment_id, title, due_date, rubric, status } ]

POST /api/classes/:class_id/assignments (teacher only)
  Body: { title, description, due_date, rubric }
  Response: { assignment_id }

GET /api/assignments/:assignment_id (teacher + students in class)
  Response: { id, title, description, due_date, rubric, submission_count }

PUT /api/assignments/:assignment_id (teacher only)
  Body: { title?, description?, due_date?, rubric? }
  Response: { success: true }
```

### **Submissions**

```
GET /api/assignments/:assignment_id/submissions (teacher only)
  Response: [ { submission_id, student_id, student_name, submitted_at, status } ]

POST /api/assignments/:assignment_id/submit (student only)
  Body: { file, text_content? } (multipart form data)
  Response: { submission_id, submitted_at }

GET /api/submissions/:submission_id (student + teacher of class)
  Response: { id, assignment_id, student_id, file_url, text_content, submitted_at }
```

### **Grades**

```
POST /api/submissions/:submission_id/grades (teacher only)
  Body: { rubric_scores: [{criterion: string, score: number}], feedback: string }
  Response: { grade_id, total_score }

GET /api/assignments/:assignment_id/grades (teacher only)
  Response: [ { student_id, student_name, total_score, graded_at } ]

GET /api/classes/:class_id/grades (student returns own, teacher returns all)
  Response: [ { assignment_id, title, score, feedback, graded_at } ]

GET /api/students/:student_id/grades (student self only, or teacher if student in class)
  Response: [ { assignment_id, class_id, score, feedback } ]
```

---

## 6. TECHNOLOGY DECISIONS

### **Frontend (Next.js 15 + React 19)**

**Why Next.js 15:**
- Server components for fast rendering
- Built-in API routes (optional, can use Fastify separately)
- App router for clean URL structure
- Tailwind built-in

**Page Structure:**
```
/app
├── /auth
│   ├── /login
│   ├── /register
├── /dashboard
│   ├── page.tsx (role-based redirect)
│   ├── /admin (admin dashboard)
│   ├── /teacher (teacher dashboard)
│   ├── /student (student dashboard)
├── /classes
│   ├── [class_id]
│   │   ├── /assignments
│   │   │   ├── [assignment_id]
│   │   │   │   ├── /submit
│   │   │   │   ├── /grade
├── /api (minimal, mainly handled by Fastify backend)
```

**State Management:**
- useContext for auth (user, token, role)
- React Query/SWR for API data fetching
- Zustand optional for teacher/student-specific state (class filters, etc.)

---

### **Backend (Fastify + Node.js)**

**Why Fastify:**
- Fast, low-overhead HTTP server
- Plugin ecosystem (auth, CORS, validation)
- TypeScript support built-in
- Zod for runtime validation

**Folder Structure:**
```
src/
├── routes/
│   ├── auth.ts
│   ├── classes.ts
│   ├── assignments.ts
│   ├── submissions.ts
│   ├── grades.ts
│   ├── schools.ts
├── controllers/
│   ├── authController.ts
│   ├── classController.ts
│   ├── assignmentController.ts
│   ├── submissionController.ts
│   ├── gradeController.ts
├── middleware/
│   ├── auth.ts (JWT validation)
│   ├── rbac.ts (role-based access control)
├── db/
│   ├── schema.ts (Kysely schema definitions)
│   ├── migrations/
│       ├── 001_initial_schema.ts
├── types/
│   ├── index.ts (User, School, Class, etc.)
│   ├── app.ts (Fastify setup, plugin registration)
└── server.ts (entry point)
```

---

### **Database (PostgreSQL 17 + Kysely)**

**Why PostgreSQL:**
- ACID transactions (important for grades)
- JSONB support (for rubric_scores, rubric)
- Mature, widely supported
- Scales well

**Why Kysely:**
- Type-safe query builder (vs raw SQL)
- Composable queries (build complex logic step-by-step)
- Migration support
- No heavy ORM overhead (vs Prisma/TypeORM)

**Migrations:**
- Start with `001_initial_schema.ts` (all tables)
- Subsequent migrations for schema changes
- Run via CLI before server startup

---

### **Authentication (JWT + HTTP-only Cookies)**

**Flow:**
- User registers/logs in → backend generates JWT
- JWT stored in HTTP-only cookie (secure, SameSite=Strict)
- Frontend sends cookie automatically with requests
- Backend validates JWT in middleware
- Attach user data to request context

**Libraries:**
- `jsonwebtoken` for signing/verifying
- `@fastify/jwt` for Fastify integration
- `@fastify/cookie` for cookie handling

---

### **OAuth (GitHub)**

**Flow:**
1. Frontend redirects to GitHub OAuth consent screen
2. GitHub redirects back with auth code
3. Backend exchanges code for access token
4. Backend fetches user info (email, name) from GitHub
5. Backend checks if user exists:
   - If yes: log them in
   - If no: create account and log them in
6. Backend returns JWT

**Libraries:**
- `@octokit/rest` (GitHub API client)
- `passport-github2` (optional, but adds weight; manual flow is simpler)

---

### **File Uploads (Optional: Local or S3)**

**For MVP, use local filesystem:**
- Store files in `/uploads` directory
- Serve via static middleware
- Keep track of file_url in DB as relative path

**Later, upgrade to S3:**
- Use AWS SDK `@aws-sdk/client-s3`
- Backend generates signed URLs for secure downloads
- Keep file_url as S3 URI

---

## 7. TESTING STRATEGY

### **Unit Tests (Vitest)**

Test individual functions/helpers:
- Rubric score calculation
- Grade average calculation
- Permission checks (can teacher grade this submission?)
- Validation functions (is rubric valid? is file size ok?)

### **Integration Tests (Vitest + Supertest)**

Test API endpoints with database:
- POST /api/auth/login → validate JWT in response
- POST /api/classes/:id/assignments → assignment stored in DB
- POST /api/submissions/:id/grades → grade calculated and stored
- GET /api/classes/:id/students → only teacher can access

### **E2E Tests (Playwright)**

Test critical user flows:
1. Admin creates school, teacher
2. Teacher creates class, assignment
3. Student enrolls, submits assignment
4. Teacher grades submission
5. Student views grade

---

## 8. SECURITY CONSIDERATIONS

### **Authentication & Authorization**
- ✅ JWT in HTTP-only cookies (XSS safe)
- ✅ Role-based access control (RBAC) middleware on all routes
- ✅ Never expose passwords (always hash with bcrypt)
- ✅ Rate limit auth endpoints (prevent brute force)

### **Data Isolation**
- ✅ Students can only see their own submissions/grades
- ✅ Teachers can only see submissions in their classes
- ✅ Admins can only see their own schools
- Implement via WHERE clauses in queries + role checks

### **Input Validation**
- ✅ Zod schemas on all API inputs
- ✅ File upload validation (size, type)
- ✅ SQL injection prevention (use Kysely, never raw SQL)

### **CORS**
- ✅ Lock down to frontend domain only
- ✅ Allow credentials (for cookies)

---

## 9. OPTIONAL: LLM CHATBOT FEATURE

### **Architecture (RAG)**

```
Class Materials (PDFs, docs, etc.)
    ↓
Chunk & Embed (OpenAI embeddings)
    ↓
Store in Pinecone (vector DB)
    ↓
Student asks question → Semantic search in Pinecone
    ↓
Retrieve relevant chunks
    ↓
Pass to GPT-4 with context
    ↓
Return grounded answer to student
```

### **Implementation**
- Endpoint: POST /api/classes/:class_id/chatbot
- Body: { question: string }
- Response: { answer: string, sources: [file_names] }

### **Cost Optimization**
- Cache embeddings (don't re-embed same document)
- Limit context window (e.g., top-5 most relevant chunks only)
- Rate limit per student (e.g., 10 questions/day)

---

## 10. IMPLEMENTATION ORDER (SPRINTS)

### **Sprint 1: Foundation (Days 1-2)**
Goal: Auth + Admin dashboard + basic DB schema

Tasks:
- [ ] Set up Fastify + Kysely + PostgreSQL
- [ ] Write DB schema migrations
- [ ] Implement auth routes (register, login, logout)
- [ ] JWT middleware + cookie handling
- [ ] Admin dashboard page (hardcoded data for now)
- [ ] Role-based middleware (RBAC)
- [ ] Write 10-15 unit tests for auth/RBAC

Deliverable: Working login, JWT in cookies, admin can see dashboard

---

### **Sprint 2: Teacher Workflow (Days 2-4)**
Goal: Teachers can create classes, assignments, view submissions

Tasks:
- [ ] Class CRUD routes (GET, POST, PUT)
- [ ] Student enrollment (via code or manual)
- [ ] Assignment CRUD routes
- [ ] Submission routes (GET, POST)
- [ ] Teacher dashboard page (classes, assignments, pending submissions)
- [ ] Rubric data structure (validate in Zod)
- [ ] Write 20+ integration tests (classes, assignments, submissions)

Deliverable: Teacher creates class + assignment, student can submit

---

### **Sprint 3: Student & Grading (Days 4-6)**
Goal: Students submit, teachers grade, students see grades

Tasks:
- [ ] Grading routes (POST grades, fetch grades)
- [ ] Grade calculation (sum rubric scores)
- [ ] Student dashboard (classes, grades, upcoming assignments)
- [ ] Grade book page (teacher view)
- [ ] Student submission feedback view
- [ ] Write 20+ tests (grades, permissions, calculations)
- [ ] E2E test: submit → grade → view grade

Deliverable: Full flow: submit → grade → student sees result

---

### **Sprint 4: Polish & Chatbot (Days 6-7, as time allows)**
Goal: Error handling, UI polish, optional chatbot

Tasks:
- [ ] Global error handling (API + frontend)
- [ ] Loading states, empty states in UI
- [ ] Responsive design (mobile-friendly)
- [ ] File upload UI (drag & drop if time)
- [ ] If time: RAG chatbot routes
- [ ] Final E2E run-through
- [ ] Clean up code, remove debugging

Deliverable: Polished app, video walkthrough ready

---

## 11. POTENTIAL CHALLENGES & SOLUTIONS

### **Challenge 1: Multiple Submissions Per Assignment**
- **Issue:** Do we allow students to re-submit and update their submission?
- **Solution (MVP):** One submission per student per assignment. Keep it simple.
- **Later:** Add versioning (keep old submissions, grade latest).

### **Challenge 2: Rubric Flexibility**
- **Issue:** Different rubrics for different assignments (no two are the same).
- **Solution:** Store rubric as JSONB. Teacher defines criteria + max points per assignment.
- **Validation:** Zod schema validates rubric structure.

### **Challenge 3: Concurrent Grading**
- **Issue:** Two teachers grade the same submission simultaneously.
- **Solution:** Add a `locked_by` and `locked_until` field. Teacher "locks" submission while grading (30 min timeout).
- **MVP:** Ignore this (small risk in practice).

### **Challenge 4: Latency (Many Students Submitting)**
- **Issue:** Many students submit near deadline → database load spikes.
- **Solution:** Use Redis to queue submission processing. Write to DB asynchronously.
- **MVP:** Accept the spike; PostgreSQL handles 10K inserts/sec easily.

### **Challenge 5: File Storage**
- **Issue:** Where do uploaded files live?
- **Solution (MVP):** Local filesystem + relative path in DB.
- **Production:** S3 + signed URLs.

---

## 12. DATABASE EXAMPLES

### **Registering a Student**

```sql
INSERT INTO users (id, email, password_hash, name, role, school_id)
VALUES (uuid(), 'student@school.edu', bcrypt('password'), 'Jane Doe', 'student', school_uuid);
```

### **Creating an Assignment with Rubric**

```sql
INSERT INTO assignments (id, class_id, title, description, due_date, rubric)
VALUES (
  uuid(),
  class_uuid,
  'Essay: The American Revolution',
  'Write a 5-page essay...',
  NOW() + INTERVAL '7 days',
  '[
    {"criterion": "Thesis Clarity", "max_points": 25},
    {"criterion": "Evidence Quality", "max_points": 35},
    {"criterion": "Writing Mechanics", "max_points": 40}
  ]'::jsonb
);
```

### **Grading a Submission**

```sql
INSERT INTO grades (id, submission_id, assignment_id, student_id, class_id, graded_by, rubric_scores, total_score, feedback, graded_at)
VALUES (
  uuid(),
  submission_uuid,
  assignment_uuid,
  student_uuid,
  class_uuid,
  teacher_uuid,
  '[
    {"criterion": "Thesis Clarity", "score": 23},
    {"criterion": "Evidence Quality", "score": 32},
    {"criterion": "Writing Mechanics", "score": 38}
  ]'::jsonb,
  93,
  'Excellent essay! Your thesis was clear and well-supported.',
  NOW()
);
```

---

## 13. TECH STACK SUMMARY

| Layer | Tech | Why |
|-------|------|-----|
| Frontend | Next.js 15 + React 19 + Tailwind | Type safety, fast, built-in styling |
| Backend | Fastify + TypeScript | Fast, lightweight, great DX |
| Database | PostgreSQL 17 + Kysely | ACID, JSONB, type-safe queries |
| Auth | JWT + HTTP-only cookies | Secure, standard, no session overhead |
| Testing | Vitest + Supertest + Playwright | Fast, modern, good coverage |
| File Storage | Local (MVP) / S3 (future) | Simple now, scalable later |
| LLM (bonus) | OpenAI + Pinecone + LangChain | Production RAG pattern |

---

## 14. SUCCESS CRITERIA

**MVP is done when:**
- ✅ Auth works (register, login, logout, JWT)
- ✅ Admin can see school statistics
- ✅ Teacher can create class + assignment with rubric
- ✅ Student can enroll in class + submit assignment
- ✅ Teacher can grade submission + provide feedback
- ✅ Student can view their grade + feedback
- ✅ At least 1 E2E test (full flow) passes
- ✅ Code is clean, no obvious bugs
- ✅ 5-min video walkthrough works

**Nice to have:**
- File upload drag & drop
- Class-specific grade statistics
- Chatbot (if time allows)
- Dark mode
- Mobile-responsive design
