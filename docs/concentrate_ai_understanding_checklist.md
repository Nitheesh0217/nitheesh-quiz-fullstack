# System Understanding Checklist

Before you code a single line, you should be able to answer these questions WITHOUT looking at the docs. If you can't, re-read that section.

---

## DATA MODEL

### Users & Roles
- [ ] What are the three user roles and what can each do?
- [ ] Can a student see another student's grades?
- [ ] If a teacher leaves the school, what happens to their classes and assignments?
- [ ] Can an admin grade assignments?

### Schools & Classes
- [ ] Is this multi-tenant (multiple schools) or single-tenant?
- [ ] Can a teacher teach classes in multiple schools?
- [ ] What is an "enrollment code" and when is it used?
- [ ] Can a student enroll in a class multiple times?

### Assignments & Submissions
- [ ] What is a rubric and how is it stored?
- [ ] Can a teacher change a rubric after students have submitted?
- [ ] If a student submits twice, what happens?
  - (MVP answer: only one submission per student per assignment)
- [ ] Does the backend need to validate file types?

### Grades
- [ ] How is the total grade calculated?
- [ ] Are there any weighted averages or bonus points?
- [ ] When a student views a grade, what information do they see?
- [ ] Can a teacher edit a grade after it's submitted?

---

## USER WORKFLOWS

### Admin Workflow
- [ ] List the 3-4 main actions an admin can take in order
- [ ] What page does admin see after login?
- [ ] What data appears on the "school statistics" dashboard?
- [ ] Does admin need to create teachers + students manually, or do they self-register?

### Teacher Workflow
- [ ] What are the 5 main actions a teacher takes (in order) to set up a class and assign work?
- [ ] How does a teacher create an assignment with a rubric?
- [ ] How does a teacher view pending submissions?
- [ ] How does a teacher grade one submission (step-by-step)?
- [ ] Can a teacher see another teacher's classes or grades?

### Student Workflow
- [ ] How does a student enroll in a class (two methods)?
- [ ] How does a student view assignments in their class?
- [ ] How does a student submit an assignment?
- [ ] After the teacher grades their submission, how does the student see the feedback?
- [ ] Can a student see what other students submitted or their grades?

---

## API & ENDPOINTS

### Authentication
- [ ] What are the three main auth endpoints and what does each do?
- [ ] How is the JWT token stored on the frontend? (Answer: HTTP-only cookie)
- [ ] How does the backend know which user is making a request?
- [ ] What happens if the JWT expires?

### Classes
- [ ] How many endpoints are needed for classes? (GET all, GET one, POST create, PUT edit, DELETE?)
- [ ] Who can create a class?
- [ ] Who can see a list of all classes? (Answer: depends on role)
- [ ] Is there a separate endpoint for student enrollment?

### Assignments
- [ ] How many endpoints for assignments? (CRUD)
- [ ] Who can create an assignment?
- [ ] What data is required when creating an assignment?
- [ ] Can students and teachers both access the GET assignment endpoint?

### Submissions
- [ ] What endpoint does a student use to submit a file?
- [ ] What data format is sent (multipart form data)?
- [ ] Can students see other students' submissions?
- [ ] What endpoint does a teacher use to list pending submissions?

### Grades
- [ ] What endpoint does a teacher use to submit a grade?
- [ ] What data goes in the request? (rubric_scores array + feedback text)
- [ ] What endpoint does a student use to see their grades?
- [ ] What information is returned? (assignment name, score, rubric breakdown, feedback)

---

## DATABASE

### Schema
- [ ] How many tables do you need to build an MVP? (Answer: 7-8: users, schools, classes, student_enrollments, assignments, submissions, grades, + maybe schools or teacher_enrollments)
- [ ] Which tables have foreign keys to users?
- [ ] Which tables reference assignments?
- [ ] Why is rubric stored as JSON and not a separate table?

### Relationships
- [ ] Draw the entity relationship: User → School → Class → Assignment → Submission → Grade
- [ ] How does the system know which students are in which classes? (Answer: student_enrollments join table)
- [ ] How does the system ensure a teacher can only grade their own students' submissions? (Answer: INNER JOIN classes WHERE teacher_id = :teacher_id)

### Queries
- [ ] Write a query (in English, not SQL) to "show all students in a class"
- [ ] Write a query to "show pending submissions for a teacher"
- [ ] Write a query to "calculate average grade for a student in a class"
- [ ] Write a query to "prevent a student from seeing another student's submission"

---

## SECURITY

### Authentication
- [ ] How is the password stored? (Answer: bcrypt hash, never plaintext)
- [ ] How is the JWT signed? (Answer: with a secret key)
- [ ] Can the frontend forge a JWT? (Answer: No, signature would be invalid)

### Authorization (RBAC)
- [ ] What are the 3-4 main permission checks in the system?
  - (Answer: student can only see own submissions/grades, teacher can only see own class submissions, admin can see school data)
- [ ] Where in the code are these checks enforced? (Answer: RBAC middleware on backend, not frontend)
- [ ] What happens if a student tries to access /api/grades/another-student-123?
  - (Answer: 403 Forbidden)

### Data Isolation
- [ ] If two schools use the same system, can a student from school A see data from school B?
  - (Answer: No, every query includes WHERE school_id = :school_id)
- [ ] What if there's a bug in the role check middleware?
  - (Answer: Still safe if every endpoint re-validates permission)

### File Uploads
- [ ] Are there file type restrictions?
- [ ] Are there file size limits?
- [ ] Where are files saved? (Answer: /uploads directory, with path stored in DB)
- [ ] Can students download each other's submissions?
  - (Answer: No, only via authenticated API + permission check)

---

## TESTING

### Unit Tests
- [ ] Name 3-4 things to unit test in the auth system
  - (password validation, JWT signing, role check logic, bcrypt hashing)
- [ ] Name 2-3 things to unit test in grading
  - (rubric score validation, total score calculation, permission checks)

### Integration Tests
- [ ] What's a good integration test for the student submission flow?
  - (Create student → enroll in class → create assignment → POST submission → verify file saved + DB record)
- [ ] What's a good integration test for grading?
  - (POST grade → verify grade stored + total_score calculated + student can retrieve it)

### E2E Tests
- [ ] What's the main E2E flow to test?
  - (Admin creates school → teacher creates class → student enrolls → teacher creates assignment → student submits → teacher grades → student sees grade)

---

## DEPLOYMENT & OPERATIONS

### Development Setup
- [ ] How does a developer set up the project locally?
  - (Clone repo, npm install, create .env, npm run db:migrate, npm run dev)
- [ ] How does the database get created?
  - (Kysely migrations)
- [ ] How do you reset the database?
  - (npm run db:reset or delete postgres container)

### Production Considerations
- [ ] Should you store uploaded files on disk or in S3?
  - (MVP: disk, later: S3)
- [ ] Do you need a CDN for file downloads?
  - (For MVP: no, direct download is fine)
- [ ] How do you handle backups?
  - (PostgreSQL automated backups, file backups in S3 when you move files there)
- [ ] How do you monitor errors?
  - (Log to console in dev, log to Sentry / Datadog in production)

---

## TECH STACK

### Frontend
- [ ] Why Next.js 15 and not plain React?
  - (Server components, built-in routing, better DX)
- [ ] Why Tailwind and not another CSS framework?
  - (Utility-first, fast, built-in with Next.js)
- [ ] What's the state management solution for auth?
  - (useContext + localStorage for token, React Query/SWR for API data)

### Backend
- [ ] Why Fastify and not Express?
  - (Faster, better DX with TypeScript, lower overhead)
- [ ] Why Kysely and not Prisma?
  - (Type-safe queries, no heavy ORM overhead, manual control over SQL)
- [ ] Why PostgreSQL and not MongoDB?
  - (ACID transactions, JSONB support, relational data structure fits this use case)

### Auth
- [ ] Why JWT and not sessions?
  - (Stateless, scales better, works with distributed backends)
- [ ] Why HTTP-only cookies and not localStorage for the token?
  - (Prevents XSS theft of the token)
- [ ] Why bcrypt for passwords and not a faster algorithm?
  - (bcrypt is designed to be slow, resists brute force)

---

## OPTIONAL: CHATBOT (BONUS FEATURE)

- [ ] What's the architecture of the RAG chatbot?
  - (Ingest class docs → embed with OpenAI → store in Pinecone → semantic search → pass context to GPT-4)
- [ ] How do you limit cost?
  - (Rate limit: 10 questions/day per student, cache embeddings, limit context window)
- [ ] What's the endpoint?
  - (POST /api/classes/:id/chatbot with { question })

---

## SELF-TEST: CAN YOU EXPLAIN THIS IN 2 MINUTES?

**"Walk me through what happens when a student submits an assignment."**

You should be able to say something like:

*"Student loads assignment page, sees the rubric criteria and due date. They click submit, upload a file or paste text. Frontend validates file size, then POSTs to /api/assignments/:id/submit with multipart form data. Backend checks the JWT to get the student ID, verifies they're enrolled in the class, saves the file to disk, creates a Submission record in the database with the file_url and submitted_at timestamp. The response includes the submission_id. Frontend shows a confirmation. The teacher then sees the submission in their 'pending submissions' list. They click on it, see the student's submission side-by-side with the rubric, enter scores for each criterion. Backend calculates total_score as the sum, stores it in the Grade record, and sets submission.status to 'graded'. The student then sees their grade on their dashboard with the feedback the teacher wrote."*

If you can't explain this end-to-end, re-read the system design doc.

---

## RED FLAGS: IF YOU CAN'T ANSWER THESE, ASK ANDY

1. **"Can a student re-submit an assignment multiple times?"** 
   - If you're unsure: Ask Andy during the call.

2. **"What happens to a class if the teacher leaves?"** 
   - If you're unsure: Ask Andy during the call.

3. **"Can students see the rubric before submitting?"**
   - If you're unsure: Ask Andy during the call.

4. **"Are there any business rules around late submissions or grade locks?"**
   - If you're unsure: Ask Andy during the call.

5. **"Should the chatbot be integrated with the grade system (e.g., suggest score ranges)?"**
   - If you're unsure: Ask Andy during the call (bonus feature, probably no).

---

## FINAL CHECKLIST BEFORE CODING

- [ ] I can draw the database schema from memory
- [ ] I can explain the 3 user roles and their permissions
- [ ] I can list all the main endpoints (~15-20 total)
- [ ] I can walk through a complete submission + grading flow
- [ ] I can explain why JWT + HTTP-only cookies is the right auth choice
- [ ] I can explain what RBAC middleware does and where it runs
- [ ] I can list 3-5 security risks and how you prevent them
- [ ] I can explain why Fastify + PostgreSQL + Kysely is a good choice
- [ ] I can write a basic SQL query to fetch grades for a student in a class
- [ ] I can explain the 3-sprint implementation order

**If all checkboxes are true: you're ready to code.**

**If any are false: re-read the relevant section in the system design doc.**
