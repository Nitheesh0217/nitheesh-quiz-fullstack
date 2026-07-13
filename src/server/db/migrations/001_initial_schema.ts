import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create extension if not exists "pgcrypto"`.execute(db);

  await db.schema.createType('user_role').asEnum(['admin', 'teacher', 'student']).execute();
  await db.schema
    .createType('enrollment_status')
    .asEnum(['active', 'dropped'])
    .execute();
  await db.schema
    .createType('submission_status')
    .asEnum(['submitted', 'graded', 'returned'])
    .execute();

  // users and schools reference each other, so users is created first without
  // the school_id foreign key, which is added after schools exists.
  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('email', 'varchar', (col) => col.notNull().unique())
    .addColumn('password_hash', 'varchar', (col) => col.notNull())
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('role', sql`user_role`, (col) => col.notNull())
    .addColumn('school_id', 'uuid')
    .addColumn('is_suspended', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('schools')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('address', 'varchar')
    .addColumn('created_by', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .alterTable('users')
    .addForeignKeyConstraint('users_school_id_fkey', ['school_id'], 'schools', ['id'])
    .onDelete('set null')
    .execute();

  await db.schema.createIndex('users_school_id_idx').on('users').column('school_id').execute();

  await db.schema
    .createTable('classes')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('school_id', 'uuid', (col) => col.notNull().references('schools.id').onDelete('cascade'))
    .addColumn('teacher_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('restrict'))
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('code', 'varchar', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('classes_school_id_code_key', ['school_id', 'code'])
    .execute();

  await db.schema.createIndex('classes_teacher_id_idx').on('classes').column('teacher_id').execute();

  await db.schema
    .createTable('student_enrollments')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('class_id', 'uuid', (col) => col.notNull().references('classes.id').onDelete('cascade'))
    .addColumn('student_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('status', sql`enrollment_status`, (col) => col.notNull().defaultTo('active'))
    .addColumn('enrolled_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('student_enrollments_class_id_student_id_key', ['class_id', 'student_id'])
    .execute();

  await db.schema
    .createIndex('student_enrollments_student_id_idx')
    .on('student_enrollments')
    .column('student_id')
    .execute();

  await db.schema
    .createTable('assignments')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('class_id', 'uuid', (col) => col.notNull().references('classes.id').onDelete('cascade'))
    .addColumn('title', 'varchar', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('due_date', 'timestamptz')
    .addColumn('rubric', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex('assignments_class_id_idx').on('assignments').column('class_id').execute();

  await db.schema
    .createTable('submissions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('assignment_id', 'uuid', (col) => col.notNull().references('assignments.id').onDelete('cascade'))
    .addColumn('student_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('file_url', 'varchar')
    .addColumn('text_content', 'text')
    .addColumn('status', sql`submission_status`, (col) => col.notNull().defaultTo('submitted'))
    .addColumn('submitted_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('submissions_assignment_id_student_id_key', ['assignment_id', 'student_id'])
    .execute();

  await db.schema
    .createIndex('submissions_student_id_idx')
    .on('submissions')
    .column('student_id')
    .execute();

  await db.schema
    .createTable('grades')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('submission_id', 'uuid', (col) =>
      col.notNull().unique().references('submissions.id').onDelete('cascade')
    )
    .addColumn('assignment_id', 'uuid', (col) => col.notNull().references('assignments.id').onDelete('cascade'))
    .addColumn('student_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('class_id', 'uuid', (col) => col.notNull().references('classes.id').onDelete('cascade'))
    .addColumn('graded_by', 'uuid', (col) => col.notNull().references('users.id').onDelete('restrict'))
    .addColumn('rubric_scores', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('total_score', 'numeric', (col) => col.notNull().defaultTo(0))
    .addColumn('feedback', 'text')
    .addColumn('graded_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex('grades_student_id_idx').on('grades').column('student_id').execute();
  await db.schema.createIndex('grades_class_id_idx').on('grades').column('class_id').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('grades').execute();
  await db.schema.dropTable('submissions').execute();
  await db.schema.dropTable('assignments').execute();
  await db.schema.dropTable('student_enrollments').execute();
  await db.schema.dropTable('classes').execute();
  await db.schema.alterTable('users').dropConstraint('users_school_id_fkey').execute();
  await db.schema.dropTable('schools').execute();
  await db.schema.dropTable('users').execute();

  await db.schema.dropType('submission_status').execute();
  await db.schema.dropType('enrollment_status').execute();
  await db.schema.dropType('user_role').execute();
}
