import * as path from 'path';
import { promises as fs } from 'fs';
import { Migrator, FileMigrationProvider } from 'kysely';
import { db } from './index';

const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({
    fs,
    path,
    migrationFolder: path.join(__dirname, 'migrations'),
  }),
});

async function migrateToLatest(): Promise<void> {
  const { error, results } = await migrator.migrateToLatest();

  for (const result of results ?? []) {
    if (result.status === 'Success') {
      console.log(`migration "${result.migrationName}" executed successfully`);
    } else if (result.status === 'Error') {
      console.error(`migration "${result.migrationName}" failed`);
    }
  }

  if (error) {
    console.error('migration failed', error);
    process.exit(1);
  }
}

async function migrateDown(): Promise<void> {
  const { error, results } = await migrator.migrateDown();

  for (const result of results ?? []) {
    if (result.status === 'Success') {
      console.log(`migration "${result.migrationName}" reverted successfully`);
    } else if (result.status === 'Error') {
      console.error(`migration "${result.migrationName}" failed to revert`);
    }
  }

  if (error) {
    console.error('migration rollback failed', error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (command === 'up') {
    await migrateToLatest();
  } else if (command === 'down') {
    await migrateDown();
  } else {
    console.error('Usage: migrate.js <up|down>');
    process.exit(1);
  }

  await db.destroy();
}

void main();
