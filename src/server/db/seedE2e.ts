import { db } from './index';
import { hashPassword } from '../utils/password';

const ids = {
  school: '11111111-1111-4111-8111-111111111111',
  admin: '22222222-2222-4222-8222-222222222222',
  teacher: '33333333-3333-4333-8333-333333333333',
  student: '44444444-4444-4444-8444-444444444444',
  class: '55555555-5555-4555-8555-555555555555',
  enrollment: '66666666-6666-4666-8666-666666666666',
  gradedAssignment: '77777777-7777-4777-8777-777777777777',
  pendingAssignment: '88888888-8888-4888-8888-888888888888',
  gradedSubmission: '99999999-9999-4999-8999-999999999999',
  pendingSubmission: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  grade: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};

async function main(): Promise<void> {
  const [adminHash, teacherHash, studentHash] = await Promise.all([
    hashPassword('AdminPass123!'),
    hashPassword('TeacherPass123!'),
    hashPassword('StudentPass123!'),
  ]);

  const now = new Date();
  const futureDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pastDueDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rubric = [
    { criterion: 'Clarity', max_points: 50 },
    { criterion: 'Accuracy', max_points: 50 },
  ];

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom('grades').where('id', '=', ids.grade).execute();
    await trx
      .deleteFrom('submissions')
      .where('id', 'in', [ids.gradedSubmission, ids.pendingSubmission])
      .execute();
    await trx
      .deleteFrom('assignments')
      .where('id', 'in', [ids.gradedAssignment, ids.pendingAssignment])
      .execute();
    await trx.deleteFrom('student_enrollments').where('id', '=', ids.enrollment).execute();
    await trx.deleteFrom('classes').where('id', '=', ids.class).execute();
    await trx
      .deleteFrom('users')
      .where('id', 'in', [ids.admin, ids.teacher, ids.student])
      .execute();
    await trx.deleteFrom('schools').where('id', '=', ids.school).execute();

    await trx
      .insertInto('schools')
      .values({
        id: ids.school,
        name: 'Concentrate Academy',
        address: '100 Learning Lane',
        created_at: now,
      })
      .execute();

    await trx
      .insertInto('users')
      .values([
        {
          id: ids.admin,
          email: 'sarah.chen@university.edu',
          password_hash: adminHash,
          name: 'Sarah Chen',
          role: 'admin',
          school_id: ids.school,
          onboarding_completed: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: ids.teacher,
          email: 'alice.thompson@university.edu',
          password_hash: teacherHash,
          name: 'Alice Thompson',
          role: 'teacher',
          school_id: ids.school,
          onboarding_completed: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: ids.student,
          email: 'alex.johnson@university.edu',
          password_hash: studentHash,
          name: 'Alex Johnson',
          role: 'student',
          school_id: ids.school,
          onboarding_completed: true,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();

    await trx.updateTable('schools').set({ created_by: ids.admin }).where('id', '=', ids.school).execute();

    await trx
      .insertInto('classes')
      .values({
        id: ids.class,
        school_id: ids.school,
        teacher_id: ids.teacher,
        name: 'Biology 101',
        description: 'Introductory biology for the e2e demo classroom.',
        code: 'BIO-101',
        syllabus_overview: 'Cells, genetics, ecosystems, and scientific writing.',
        created_at: now,
      })
      .execute();

    await trx
      .insertInto('student_enrollments')
      .values({
        id: ids.enrollment,
        class_id: ids.class,
        student_id: ids.student,
        status: 'active',
        enrolled_at: now,
      })
      .execute();

    await trx
      .insertInto('assignments')
      .values([
        {
          id: ids.gradedAssignment,
          class_id: ids.class,
          title: 'Cell Structure Essay',
          description: 'Explain the relationship between major cell organelles.',
          due_date: pastDueDate,
          rubric: JSON.stringify(rubric),
          created_at: now,
        },
        {
          id: ids.pendingAssignment,
          class_id: ids.class,
          title: 'Ecosystem Lab Reflection',
          description: 'Reflect on the field observations and cite two pieces of evidence.',
          due_date: futureDueDate,
          rubric: JSON.stringify(rubric),
          created_at: now,
        },
      ])
      .execute();

    await trx
      .insertInto('submissions')
      .values([
        {
          id: ids.gradedSubmission,
          assignment_id: ids.gradedAssignment,
          student_id: ids.student,
          text_content: 'Cells coordinate specialized organelles to maintain life processes.',
          status: 'graded',
          submitted_at: now,
        },
        {
          id: ids.pendingSubmission,
          assignment_id: ids.pendingAssignment,
          student_id: ids.student,
          text_content: 'The ecosystem sample showed producer and consumer interactions.',
          status: 'submitted',
          submitted_at: now,
        },
      ])
      .execute();

    await trx
      .insertInto('grades')
      .values({
        id: ids.grade,
        submission_id: ids.gradedSubmission,
        assignment_id: ids.gradedAssignment,
        student_id: ids.student,
        class_id: ids.class,
        graded_by: ids.teacher,
        rubric_scores: JSON.stringify([
          { criterion: 'Clarity', score: 45 },
          { criterion: 'Accuracy', score: 42 },
        ]),
        total_score: 87,
        feedback: 'Strong explanation with clear supporting details.',
        graded_at: now,
      })
      .execute();
  });

  console.log('Seeded e2e demo database.');
}

void main()
  .catch((error) => {
    console.error('Failed to seed e2e demo database', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
