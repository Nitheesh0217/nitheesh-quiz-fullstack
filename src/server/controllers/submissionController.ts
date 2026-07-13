import { db } from '../db';
import { ForbiddenError, NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import type { AuthUser } from '../types';
import type { RubricCriterion, RubricScoreEntry } from '../db/types';

export interface SubmitAssignmentInput {
  file_url?: string | null;
  text_content?: string | null;
}

export interface GradeSubmissionInput {
  rubric_scores: RubricScoreEntry[];
  feedback?: string | null;
}

async function verifyEnrollment(classId: string, studentId: string) {
  const enrollment = await db
    .selectFrom('student_enrollments')
    .select('id')
    .where('class_id', '=', classId)
    .where('student_id', '=', studentId)
    .where('status', '=', 'active')
    .executeTakeFirst();

  if (!enrollment) {
    throw new ForbiddenError('You are not enrolled in this class');
  }
}

async function verifyTeacherOwnership(classId: string, teacherId: string) {
  const classroom = await db
    .selectFrom('classes')
    .select('id')
    .where('id', '=', classId)
    .where('teacher_id', '=', teacherId)
    .executeTakeFirst();

  if (!classroom) {
    throw new ForbiddenError('You are not the teacher of this class');
  }
}

export async function submitAssignment(assignmentId: string, input: SubmitAssignmentInput, user: AuthUser) {
  const assignment = await db
    .selectFrom('assignments')
    .select(['id', 'class_id'])
    .where('id', '=', assignmentId)
    .executeTakeFirst();

  if (!assignment) {
    throw new NotFoundError('Assignment not found');
  }

  // Ensure enrolled
  await verifyEnrollment(assignment.class_id, user.id);

  if (!input.file_url && !input.text_content) {
    throw new ValidationError('Submission must contain either a file URL or text content');
  }

  // Check if student has already submitted (MVP: one submission per student per assignment)
  const existing = await db
    .selectFrom('submissions')
    .select(['id', 'status'])
    .where('assignment_id', '=', assignmentId)
    .where('student_id', '=', user.id)
    .executeTakeFirst();

  if (existing) {
    if (existing.status === 'graded') {
      throw new ConflictError('Cannot re-submit: assignment has already been graded');
    }

    return db
      .updateTable('submissions')
      .set({
        file_url: input.file_url ?? null,
        text_content: input.text_content ?? null,
        status: 'submitted',
        submitted_at: new Date(),
      })
      .where('id', '=', existing.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  return db
    .insertInto('submissions')
    .values({
      assignment_id: assignmentId,
      student_id: user.id,
      file_url: input.file_url ?? null,
      text_content: input.text_content ?? null,
      status: 'submitted',
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function getSubmissions(assignmentId: string, user: AuthUser) {
  const assignment = await db
    .selectFrom('assignments')
    .select(['id', 'class_id'])
    .where('id', '=', assignmentId)
    .executeTakeFirst();

  if (!assignment) {
    throw new NotFoundError('Assignment not found');
  }

  // Listing all submissions for an assignment is a grading/oversight action;
  // students track their own submission via getSubmissionById instead.
  if (user.role !== 'teacher' && user.role !== 'admin') {
    throw new ForbiddenError('Only teachers and admins can view the submissions list');
  }

  if (user.role === 'teacher') {
    await verifyTeacherOwnership(assignment.class_id, user.id);
  }

  return db
    .selectFrom('submissions')
    .innerJoin('users', 'users.id', 'submissions.student_id')
    .select([
      'submissions.id',
      'submissions.assignment_id',
      'submissions.student_id',
      'submissions.file_url',
      'submissions.text_content',
      'submissions.status',
      'submissions.submitted_at',
      'users.name as student_name',
      'users.email as student_email',
    ])
    .where('submissions.assignment_id', '=', assignmentId)
    .execute();
}

export async function getSubmissionById(submissionId: string, user: AuthUser) {
  const submission = await db
    .selectFrom('submissions')
    .selectAll()
    .where('id', '=', submissionId)
    .executeTakeFirst();

  if (!submission) {
    throw new NotFoundError('Submission not found');
  }

  const assignment = await db
    .selectFrom('assignments')
    .select(['class_id'])
    .where('id', '=', submission.assignment_id)
    .executeTakeFirstOrThrow();

  if (user.role === 'teacher') {
    await verifyTeacherOwnership(assignment.class_id, user.id);
  } else if (user.role === 'student') {
    if (submission.student_id !== user.id) {
      throw new ForbiddenError('You can only access your own submissions');
    }
  }

  return submission;
}

export async function gradeSubmission(submissionId: string, input: GradeSubmissionInput, user: AuthUser) {
  const submission = await db
    .selectFrom('submissions')
    .selectAll()
    .where('id', '=', submissionId)
    .executeTakeFirst();

  if (!submission) {
    throw new NotFoundError('Submission not found');
  }

  const assignment = await db
    .selectFrom('assignments')
    .select(['id', 'class_id', 'rubric'])
    .where('id', '=', submission.assignment_id)
    .executeTakeFirstOrThrow();

  await verifyTeacherOwnership(assignment.class_id, user.id);

  let rubric: RubricCriterion[];
  /* v8 ignore next 6 */
  if (typeof assignment.rubric === 'string') {
    rubric = JSON.parse(assignment.rubric);
  } else {
    rubric = assignment.rubric;
  }

  let totalScore = 0;

  for (const scoreEntry of input.rubric_scores) {
    const criterionMatch = rubric.find((c) => c.criterion === scoreEntry.criterion);
    
    if (!criterionMatch) {
      throw new ValidationError(`Criterion "${scoreEntry.criterion}" does not exist on assignment rubric`);
    }

    if (typeof scoreEntry.score !== 'number' || scoreEntry.score < 0 || scoreEntry.score > criterionMatch.max_points) {
      throw new ValidationError(
        `Score for "${scoreEntry.criterion}" must be between 0 and max points ${criterionMatch.max_points}`
      );
    }

    totalScore += scoreEntry.score;
  }

  await db
    .updateTable('submissions')
    .set({ status: 'graded' })
    .where('id', '=', submissionId)
    .execute();

  const existingGrade = await db
    .selectFrom('grades')
    .select('id')
    .where('submission_id', '=', submissionId)
    .executeTakeFirst();

  if (existingGrade) {
    return db
      .updateTable('grades')
      .set({
        rubric_scores: JSON.stringify(input.rubric_scores),
        total_score: totalScore,
        feedback: input.feedback ?? null,
        graded_by: user.id,
        graded_at: new Date(),
      })
      .where('id', '=', existingGrade.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  return db
    .insertInto('grades')
    .values({
      submission_id: submissionId,
      assignment_id: assignment.id,
      student_id: submission.student_id,
      class_id: assignment.class_id,
      graded_by: user.id,
      rubric_scores: JSON.stringify(input.rubric_scores),
      total_score: totalScore,
      feedback: input.feedback ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function getSubmissionGrade(submissionId: string, user: AuthUser) {
  const grade = await db
    .selectFrom('grades')
    .selectAll()
    .where('submission_id', '=', submissionId)
    .executeTakeFirst();

  if (!grade) {
    throw new NotFoundError('Grade not found');
  }

  if (user.role === 'student' && grade.student_id !== user.id) {
    throw new ForbiddenError('You can only view your own grades');
  }

  if (user.role === 'teacher') {
    await verifyTeacherOwnership(grade.class_id, user.id);
  }

  return grade;
}

export async function getClassGrades(classId: string, user: AuthUser) {
  if (user.role === 'student') {
    await verifyEnrollment(classId, user.id);

    return db
      .selectFrom('grades')
      .innerJoin('assignments', 'assignments.id', 'grades.assignment_id')
      .select([
        'grades.id as grade_id',
        'grades.submission_id',
        'grades.assignment_id',
        'grades.student_id',
        'grades.total_score',
        'grades.feedback',
        'grades.graded_at',
        'assignments.title as assignment_title',
        'assignments.rubric as assignment_rubric',
        'grades.rubric_scores',
      ])
      .where('grades.class_id', '=', classId)
      .where('grades.student_id', '=', user.id)
      .execute();
  }

  if (user.role === 'teacher') {
    await verifyTeacherOwnership(classId, user.id);

    return db
      .selectFrom('grades')
      .innerJoin('users', 'users.id', 'grades.student_id')
      .innerJoin('assignments', 'assignments.id', 'grades.assignment_id')
      .select([
        'grades.id as grade_id',
        'grades.submission_id',
        'grades.assignment_id',
        'grades.student_id',
        'grades.total_score',
        'grades.feedback',
        'grades.graded_at',
        'users.name as student_name',
        'users.email as student_email',
        'assignments.title as assignment_title',
      ])
      .where('grades.class_id', '=', classId)
      .execute();
  }

  // Admin
  return db
    .selectFrom('grades')
    .selectAll()
    .where('class_id', '=', classId)
    .execute();
}

export async function getStudentGrades(studentId: string, user: AuthUser) {
  if (user.role === 'student' && studentId !== user.id) {
    throw new ForbiddenError('You can only view your own grades');
  }

  if (user.role === 'teacher') {
    const ownsAny = await db
      .selectFrom('grades')
      .innerJoin('classes', 'classes.id', 'grades.class_id')
      .select('grades.id')
      .where('grades.student_id', '=', studentId)
      .where('classes.teacher_id', '=', user.id)
      .executeTakeFirst();

    if (!ownsAny) {
      throw new ForbiddenError('You can only view grades for students in your classes');
    }
  }

  return db
    .selectFrom('grades')
    .innerJoin('assignments', 'assignments.id', 'grades.assignment_id')
    .innerJoin('classes', 'classes.id', 'grades.class_id')
    .select([
      'grades.id as grade_id',
      'grades.submission_id',
      'grades.assignment_id',
      'grades.class_id',
      'grades.student_id',
      'grades.total_score',
      'grades.feedback',
      'grades.graded_at',
      'grades.rubric_scores',
      'assignments.title as assignment_title',
      'assignments.rubric as assignment_rubric',
      'classes.name as class_name',
    ])
    .where('grades.student_id', '=', studentId)
    .orderBy('grades.graded_at', 'desc')
    .execute();
}
