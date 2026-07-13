# Deployment

This project is designed to run locally with Docker Compose and to deploy on a cloud VM using Docker Compose, nginx, and Certbot-managed TLS certificates.

## Local infrastructure

Postgres and Redis run in containers even during local development, so the app always talks to a real database:

- Postgres 17 on host port `5433` (not the default `5432`, to avoid clashing with a local Postgres install)
- Redis 7 on `6379`

```bash
docker compose up -d postgres redis
```

## Dockerfile

Multi-stage build: install dependencies once, compile the Fastify server (`tsc`) and the Next.js client separately, then copy just the compiled output into a slim runtime image — no source TypeScript or dev dependencies ship to production.

## docker-compose.yml services

`postgres`, `redis`, `app` (the compiled Next.js + Fastify container), `nginx` (reverse proxy in front of `app`).

## Deploying to a VM

Works on any provider (AWS EC2, DigitalOcean, GCP Compute Engine, etc.) — these steps are provider-agnostic.

### 1. Install Docker

```bash
sudo apt update
sudo apt install docker.io docker-compose -y
```

### 2. Clone the repo

```bash
git clone <repository_url> /var/www/concentrate-portal
cd /var/www/concentrate-portal
```

### 3. Create a production `.env`

Never commit this file.

```bash
NODE_ENV=production
PORT=4000

DATABASE_URL=postgres://postgres:secure-db-password@postgres:5432/concentrate-quiz
REDIS_URL=redis://redis:6379

# generate real random values for these, not the placeholders below
JWT_SECRET=replace-with-a-real-64-char-secret
JWT_REFRESH_SECRET=replace-with-a-different-64-char-secret
COOKIE_SECRET=replace-with-a-16-plus-char-secret

# optional - leave blank to disable Google sign-in
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/auth/google/callback

# optional - leave blank to run the AI chat assistant on its deterministic mock fallback instead of a live provider
AI_API_KEY=

FRONTEND_URL=https://yourdomain.com
```

### 4. Build and start

```bash
docker compose up -d --build
```

### 5. Run migrations

```bash
docker compose exec app npm run db:migrate
```

## nginx and TLS

`nginx/nginx.conf` routes `/api/*` to the Fastify container on port 4000 and everything else to the Next.js container on port 3000.

To put a real domain and TLS in front of it:

1. Point the domain's DNS `A` record at the VM's IP.
2. Install Certbot: `sudo apt install certbot -y`
3. Stop nginx to free port 80: `docker compose stop nginx`
4. Get a certificate: `sudo certbot certonly --standalone -d yourdomain.com`
5. Copy the cert into the path `docker-compose.yml` expects:
   ```bash
   mkdir -p nginx/ssl
   cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/ssl/fullchain.pem
   cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/ssl/privkey.pem
   ```
6. Start nginx back up: `docker compose start nginx`
