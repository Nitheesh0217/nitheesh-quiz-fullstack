import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('classes').addColumn('syllabus_overview', 'text').execute();

  await db.schema
    .createTable('syllabus_weeks')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('class_id', 'uuid', (col) => col.notNull().references('classes.id').onDelete('cascade'))
    .addColumn('week_number', 'integer', (col) => col.notNull())
    .addColumn('title', 'varchar', (col) => col.notNull())
    .addColumn('topics', 'text')
    .addColumn('readings', 'text')
    .addColumn('video_links', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('linked_assignment_id', 'uuid', (col) => col.references('assignments.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('syllabus_weeks_class_id_week_number_key', ['class_id', 'week_number'])
    .execute();

  await db.schema.createIndex('syllabus_weeks_class_id_idx').on('syllabus_weeks').column('class_id').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('syllabus_weeks').execute();
  await db.schema.alterTable('classes').dropColumn('syllabus_overview').execute();
}
