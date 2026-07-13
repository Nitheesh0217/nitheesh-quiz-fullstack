import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from './types';
import { env } from '../env';

const dialect = new PostgresDialect({
  pool: new Pool({ connectionString: env.DATABASE_URL }),
});

export const db = new Kysely<Database>({ dialect });
