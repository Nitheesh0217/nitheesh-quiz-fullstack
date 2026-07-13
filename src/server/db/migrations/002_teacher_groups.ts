import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('teacher_groups')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('school_id', 'uuid', (col) => col.notNull().references('schools.id').onDelete('cascade'))
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('teacher_group_members')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('group_id', 'uuid', (col) => col.notNull().references('teacher_groups.id').onDelete('cascade'))
    .addColumn('teacher_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('joined_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('teacher_group_members_group_teacher_unique', ['group_id', 'teacher_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('teacher_group_members').execute();
  await db.schema.dropTable('teacher_groups').execute();
}
