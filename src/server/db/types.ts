import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

export type UserRole = 'admin' | 'teacher' | 'student';
export type EnrollmentStatus = 'active' | 'dropped';
export type SubmissionStatus = 'submitted' | 'graded' | 'returned';

export interface RubricCriterion {
  criterion: string;
  max_points: number;
}

export interface RubricScoreEntry {
  criterion: string;
  score: number;
}

type CreatedAt = ColumnType<Date, Date | string | undefined, never>;
type UpdatableTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
  school_id: string | null;
  is_suspended: Generated<boolean>;
  token_version: Generated<number>;
  onboarding_completed: Generated<boolean>;
  created_at: CreatedAt;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface PasswordResetTokensTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  expires_at: ColumnType<Date, Date | string, Date | string>;
  used_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  created_at: CreatedAt;
}

export interface SchoolsTable {
  id: Generated<string>;
  name: string;
  address: string | null;
  created_by: string | null;
  created_at: CreatedAt;
}

export interface ClassesTable {
  id: Generated<string>;
  school_id: string;
  teacher_id: string;
  name: string;
  description: string | null;
  code: string;
  syllabus_overview: string | null;
  created_at: CreatedAt;
}

export interface StudentEnrollmentsTable {
  id: Generated<string>;
  class_id: string;
  student_id: string;
  status: Generated<EnrollmentStatus>;
  enrolled_at: CreatedAt;
}

export interface AssignmentsTable {
  id: Generated<string>;
  class_id: string;
  title: string;
  description: string | null;
  due_date: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  rubric: ColumnType<RubricCriterion[], string, string>;
  created_at: CreatedAt;
}

export interface SubmissionsTable {
  id: Generated<string>;
  assignment_id: string;
  student_id: string;
  file_url: string | null;
  text_content: string | null;
  status: Generated<SubmissionStatus>;
  submitted_at: UpdatableTimestamp;
}

export interface GradesTable {
  id: Generated<string>;
  submission_id: string;
  assignment_id: string;
  student_id: string;
  class_id: string;
  graded_by: string;
  rubric_scores: ColumnType<RubricScoreEntry[], string, string>;
  total_score: ColumnType<string, string | number, string | number>;
  feedback: string | null;
  graded_at: UpdatableTimestamp;
}

export interface SyllabusWeeksTable {
  id: Generated<string>;
  class_id: string;
  week_number: number;
  title: string;
  topics: string | null;
  readings: string | null;
  video_links: ColumnType<string[], string, string>;
  linked_assignment_id: string | null;
  created_at: CreatedAt;
  updated_at: UpdatableTimestamp;
}

export interface ClassAnnouncementsTable {
  id: Generated<string>;
  class_id: string;
  author_id: string;
  title: string;
  content: string;
  created_at: CreatedAt;
  updated_at: UpdatableTimestamp;
}

export interface TeacherGroupsTable {
  id: Generated<string>;
  school_id: string;
  name: string;
  created_at: CreatedAt;
}

export interface TeacherGroupMembersTable {
  id: Generated<string>;
  group_id: string;
  teacher_id: string;
  joined_at: CreatedAt;
}

export interface Database {
  users: UsersTable;
  schools: SchoolsTable;
  classes: ClassesTable;
  student_enrollments: StudentEnrollmentsTable;
  assignments: AssignmentsTable;
  submissions: SubmissionsTable;
  grades: GradesTable;
  syllabus_weeks: SyllabusWeeksTable;
  class_announcements: ClassAnnouncementsTable;
  teacher_groups: TeacherGroupsTable;
  teacher_group_members: TeacherGroupMembersTable;
  password_reset_tokens: PasswordResetTokensTable;
}

export type UserRow = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
