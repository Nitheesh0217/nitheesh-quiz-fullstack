# Deployment

This project is designed to run locally with Docker Compose and to deploy on a cloud VM using Docker Compose, nginx, and Certbot-managed TLS certificates.

## Local Development

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Start PostgreSQL and Redis:

```bash
docker compose up -d postgres redis
```

Run database migrations:

```bash
npm run db:migrate
```

Start the development app:

```bash
npm run dev
```

The frontend runs on `http://localhost:3000`; the Fastify API defaults to `http://localhost:4000`.

## Production With Docker Compose

The root `Dockerfile` builds the TypeScript server and Next.js client. The root `docker-compose.yml` defines:

- `postgres`: PostgreSQL 17
- `redis`: Redis 7
- `app`: the built application container
- `nginx`: reverse proxy using `nginx/nginx.conf`

Prepare required environment variables in a root `.env` file on the server:

```bash
JWT_SECRET=replace-with-32-plus-chars
JWT_REFRESH_SECRET=replace-with-32-plus-chars
COOKIE_SECRET=replace-with-16-plus-chars
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://your-domain.example/api/auth/google/callback
FRONTEND_URL=https://your-domain.example
AI_API_KEY=
AI_BASE_URL=
AI_MODEL=
RESEND_API_KEY=
EMAIL_FROM=Concentrate Portal <no-reply@your-domain.example>
```

Build and run:

```bash
docker compose up -d --build
```

Run migrations against the production database before accepting traffic:

```bash
docker compose exec app npm run db:migrate
```

## Nginx And SSL

The nginx service mounts `nginx/nginx.conf` and exposes ports `80` and `443`. For a self-hosted VM deployment:

1. Point your domain DNS records at the VM.
2. Install Docker, Docker Compose, nginx/Certbot tooling as needed by the host.
3. Use Certbot to obtain certificates for the domain.
4. Mount or copy the resulting certificate files into the path expected by `docker-compose.yml`, currently `nginx/ssl`.
5. Start the stack with `docker compose up -d --build`.

Keep production secrets out of git and rotate JWT, cookie, Google OAuth, and email provider credentials if they are ever exposed.
