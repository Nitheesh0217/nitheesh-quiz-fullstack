import { defineConfig, loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'react',
    },
    resolve: {
      // Mirrors the "@/*" -> "./src/*" path alias in tsconfig.json so
      // components importing via the alias (e.g. Header.tsx) can be
      // resolved by Vitest the same way Next.js resolves them.
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    test: {
      environment: 'node',
      globals: true,
      include: ['src/**/*.test.{ts,tsx}'],
      fileParallelism: false,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/server/**/*.ts', 'src/lib/**/*.ts', 'src/components/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
        exclude: [
          'src/server/**/*.test.ts',
          'src/server/db/migrations/**',
          'src/server/server.ts',
          'src/server/db/migrate.ts',
          'src/server/db/seedE2e.ts',
          'src/server/db/types.ts',
          'src/server/types/**',
          'src/**/*.test.{ts,tsx}',
          'src/app/layout.tsx',
        ],
        thresholds: {
          lines: 95,
          statements: 95,
          branches: 95,
          functions: 95,
        },
      },
    },
  };
});
