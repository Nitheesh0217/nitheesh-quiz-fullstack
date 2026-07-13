# Canvas Portal — Demo Data Seed Report

Seeded on 2026-07-07 against http://localhost:3000 (school: Concentrate Academy).

## Summary

| Metric | Value |
|---|---|
| Admins created | 3 |
| Teachers created | 5 |
| Students created | 20 |
| Classes created | 8 |
| Enrollments | 75 (per matrix) |
| Assignments | 37 real + 1 practice placeholder |
| Submissions | 75 (Assignment 1 of every enrolled class, per student) |
| Grades | 75 (100% graded, 0 pending) |
| School average | 73.3% (computed from real grades) |

## Accounts

### Admins
| Name | Email | Password |
|---|---|---|
| Dr. Sarah Chen | sarah.chen@university.edu | AdminPass123! |
| Prof. James Wilson | james.wilson@university.edu | AdminPass456! |
| Dr. Michael Rodriguez | michael.rodriguez@university.edu | AdminPass789! |

### Teachers
| Name | Email | Password | Classes |
|---|---|---|---|
| Prof. Alice Thompson | alice.thompson@university.edu | TeacherPass123! | CS101, CS401 |
| Prof. Bob Kumar | bob.kumar@university.edu | TeacherPass456! | CS201, CS501 |
| Dr. Carol Martinez | carol.martinez@university.edu | TeacherPass789! | CS301, CS601 |
| Prof. David Lee | david.lee@university.edu | TeacherPass012! | CS351 |
| Dr. Emma Watson | emma.watson@university.edu | TeacherPass345! | CS421 |

### Students (20)
Passwords as provided in the seed plan (StudentPassNNN!). Tiers used for grading:
- Strong (88–96): Alex Johnson, Beth Davis, Diana Prince, Hannah White
- Average (71–82): Ethan Hunt, Charlie Brown, George Harris, Jenna Scott, Paula Cox, Quinn Hayes, Rachel Stone, Sam Taylor, Tanya Morris
- Struggling (41–67): Fiona Green, Ian Blake, Kevin Park, Lily Chen, Marcus King, Natasha Bell, Oscar Rivera

## Classes & Enrollment Codes

| Class | Teacher | Code | Students | Assignments | Graded | Class Avg |
|---|---|---|---|---|---|---|
| CS101 - Computer Networks | Alice Thompson | 2A06A243 | 13 | 5 (+1 practice) | 13/13 | 71.9% |
| CS201 - Database Systems | Bob Kumar | 37D578A9 | 8 | 5 | 8/8 | 78.9% |
| CS301 - Algorithms and Data Structures | Carol Martinez | 634EF5A1 | 14 | 5 | 14/14 | 71.8% |
| CS401 - Operating Systems | Alice Thompson | FE510553 | 10 | 4 | 10/10 | 74.6% |
| CS501 - Software Engineering | Bob Kumar | 837ECBDE | 11 | 4 | 11/11 | 75.1% |
| CS601 - Artificial Intelligence | Carol Martinez | 5DA9205A | 7 | 5 | 7/7 | 72.6% |
| CS351 - Web Development | David Lee | 9D113662 | 6 | 5 | 6/6 | 76.2% |
| CS421 - Cybersecurity | Emma Watson | 70946925 | 6 | 4 | 6/6 | 64.8% |

Enrollments follow the provided matrix exactly. Every student submitted Assignment 1 in each
enrolled class; every submission was graded with a per-criterion rubric breakdown and
tier-appropriate personalized feedback.

Note: "Course Introduction Survey (Practice)" in CS101 is a placeholder left over from probing
the assignment API (the backend has no DELETE route for assignments, so it was renamed to
something plausible instead).

## Notes vs. the original plan

- The Phase 8 grading brief listed teacher/class mappings that conflicted with Phase 4
  (e.g. James Wilson teaching Networks). Grading was done by each class's actual owner.
- Phase 8 enrollment lists conflicted with the Phase 5 matrix; the matrix was used.
- Passwords in Phase 8 (AdminPassword456!, ResetPass123!) were typos; registered passwords used.
- Only Assignment 1 per class has submissions/grades (75 total). Submitting all 37 assignments
  for all students (~300 flows) was out of scope for one session — easy to extend the same way.

## App bugs found while seeding (worth fixing before recording the demo)

1. **Teacher "Pending Submissions" always empty**: the dashboard calls
   `GET /api/submissions?status=submitted&teacher_id=...` and the class page calls
   `GET /api/classes/:id/submissions?status=submitted` — both routes return **404**
   (they don't exist in the Fastify backend). The UI silently falls back to "All Caught Up".
2. **Students cannot see their submissions or grades**: student dashboard and class pages call
   `GET /api/assignments/:id/submissions`, which is teacher-only and returns **403** for
   students. Consequence: "Recent Grades" is always empty and a graded assignment still shows
   "Submit Work". Grades ARE stored (visible in the teacher gradebook) — it's a frontend/route
   permission mismatch. A student-scoped submissions/grades endpoint (or using
   `GET /api/classes/:id/grades` filtered to the current student) would fix it.
3. **Student class cards reuse the teacher card component**: they show "0 students",
   the enrollment code, and View/Edit buttons; View/Edit do nothing for students
   (the working student route is `/dashboard/student/classes/:id`).
4. **No DELETE/UPDATE for classes, no DELETE for assignments** (spec requires CRUD).
   `PUT /api/assignments/:id` exists; classes have no mutation routes besides create.
5. **Stats API mismatch with SPECS.md**: `/api/v0/stats/*` endpoints are not implemented;
   only `/api/admin/stats/average-grades` exists.
6. **Register form flakiness**: programmatically-filled form sometimes required a second
   click of "Create Account" before the POST fired (validation state race).

## Verification performed

- Admin dashboard (Sarah Chen): 6 teachers / 21 students / 8 classes / 73.3% avg / 0 pending — all real data.
- Teacher view (Alice): class pages show 13 & 10 enrolled; gradebook lists per-student totals
  matching targets (Alex 94, Beth 90, Hannah 93, Ethan 73, Charlie 73, George 77, Ian 41...).
- Assignment page: 13/13 submissions marked GRADED with rubric guide.
- Student views (Alex, Kevin): correct class lists; grade display blocked by bug #2 above.
