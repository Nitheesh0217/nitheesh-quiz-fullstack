import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  COOKIE_SECRET: z.string().min(16),
  // Google OAuth — optional. When unset, the /api/auth/google routes respond
  // with a clear "not configured" error instead of the app failing to boot.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:4000/api/auth/google/callback'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  // AI chatbot (optional). When unset, /api/chat falls back to a
  // deterministic DB-driven mock response instead of calling a real LLM.
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  AI_MODEL: z.string().default('gpt-4o-mini'),
  // Transactional email (password reset, future email verification).
  // Optional so the app still boots without it configured; sendPasswordResetEmail
  // throws a clear error if it's missing outside test env when actually invoked.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Concentrate Portal <no-reply@concentrate-portal.app>'),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
