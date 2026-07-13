import { buildApp } from './app';
import { env } from './env';

const app = buildApp();

// Binding to 0.0.0.0 (not 'localhost') is required so the process is
// reachable from other containers (e.g. nginx) and from the Docker host
// port mapping — a loopback-only bind is invisible outside the container.
app.listen({ port: env.PORT, host: '0.0.0.0' }).catch((error: unknown) => {
  app.log.error(error);
  process.exit(1);
});
