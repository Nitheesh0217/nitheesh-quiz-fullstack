import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('class_announcements')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('class_id', 'uuid', (col) => col.notNull().references('classes.id').onDelete('cascade'))
    .addColumn('author_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('title', 'varchar', (col) => col.notNull())
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('class_announcements_class_id_idx')
    .on('class_announcements')
    .column('class_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('class_announcements').execute();
}
