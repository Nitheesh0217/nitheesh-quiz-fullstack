import { Pool, types } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from './types';
import { env } from '../env';

// Configure node-postgres to automatically parse PostgreSQL numeric and int8 (bigint) columns
// into native JavaScript numbers at the driver boundary to prevent string conversions.
types.setTypeParser(1700, (val) => parseFloat(val));
types.setTypeParser(20, (val) => parseInt(val, 10));

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: env.DATABASE_URL,
    // Without these, a stalled connection attempt or a query that never
    // returns (a dropped connection, a lock wait, a CI-runner networking
    // hiccup) hangs the process indefinitely instead of failing with a
    // diagnosable error.
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    query_timeout: 30_000,
    idleTimeoutMillis: 30_000,
  }),
});

export const db = new Kysely<Database>({ dialect });
