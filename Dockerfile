# Base image
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Run the build (build:server compiles Fastify/TS to dist/, build:client runs next build)
ENV NODE_ENV=production
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# PORT is intentionally NOT set here: both `next start` and Fastify
# (src/server/env.ts) read process.env.PORT, so a single container-wide
# value would put both processes on the same port. Leaving it unset lets
# each default correctly on its own (Next -> 3000, Fastify -> 4000).

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Copy example env as fallback to prevent --env-file errors
COPY --chown=nextjs:nodejs .env.example .env

COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/package-lock.json ./package-lock.json
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

USER nextjs

# 3000 = Next.js frontend, 4000 = Fastify backend (see src/server/env.ts PORT default)
EXPOSE 3000
EXPOSE 4000

CMD ["npm", "run", "start"]
