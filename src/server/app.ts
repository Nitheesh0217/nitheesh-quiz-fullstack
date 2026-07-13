import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { ZodError } from 'zod';
import { env } from './env';
import { AppError } from './utils/errors';
import { registerRoutes } from './routes';
import './types';

// Base64-encoded file submissions inflate ~33% over the raw file size (up to
// 4MB per the upload UI), plus JSON wrapper overhead — 7MB comfortably covers
// that without raising Fastify's default 1MB limit so high that it stops
// protecting the server from truly oversized payloads.
const MAX_BODY_SIZE_BYTES = 7 * 1024 * 1024;

// Framework-level errors (e.g. Fastify's oversized-body or malformed
// content-type rejections) carry their own accurate 4xx statusCode and a
// safe, non-sensitive message — distinct from our AppError/ZodError paths.
function isFastifyClientError(error: unknown): error is FastifyError {
  return (
    error instanceof Error &&
    typeof (error as FastifyError).statusCode === 'number' &&
    (error as FastifyError).statusCode! >= 400 &&
    (error as FastifyError).statusCode! < 500
  );
}

// Raw Postgres constraint violations (e.g. a check-then-insert race where
// two requests both pass an application-level "does this already exist"
// check before either commits) would otherwise fall through to a generic,
// unclassified 500 — this maps the two SQLSTATE codes that matter for
// user-facing requests to the same clean {error, code} shape AppError uses.
interface PostgresError extends Error {
  code: string;
}

function isPostgresError(error: unknown): error is PostgresError {
  return error instanceof Error && typeof (error as PostgresError).code === 'string';
}

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: env.NODE_ENV !== 'test', bodyLimit: MAX_BODY_SIZE_BYTES });

  app.register(cors, {
    origin: true,
    credentials: true,
  });

  app.register(cookie);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
        details: error.details,
      });
      return;
    }

    if (error instanceof ZodError) {
      reply.status(400).send({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.flatten(),
      });
      return;
    }

    if (isFastifyClientError(error)) {
      reply.status(error.statusCode!).send({
        error: error.message,
        code: error.code,
      });
      return;
    }

    if (isPostgresError(error) && error.code === '23505') {
      reply.status(409).send({ error: 'This already exists', code: 'CONFLICT' });
      return;
    }

    if (isPostgresError(error) && error.code === '23503') {
      reply.status(400).send({ error: 'Referenced record does not exist', code: 'VALIDATION_ERROR' });
      return;
    }

    app.log.error(error);
    reply.status(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  });

  if (process.env.NODE_ENV === 'test') {
    app.get('/api/test-internal-error', async () => {
      throw new Error('Test internal error');
    });

    app.get('/api/test-postgres-unique-violation', async () => {
      const error = new Error('duplicate key value violates unique constraint') as PostgresError;
      error.code = '23505';
      throw error;
    });

    app.get('/api/test-postgres-fk-violation', async () => {
      const error = new Error('insert or update violates foreign key constraint') as PostgresError;
      error.code = '23503';
      throw error;
    });
  }

  registerRoutes(app);

  return app;
}
