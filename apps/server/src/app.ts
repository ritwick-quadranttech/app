import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

export function buildApp(opts: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify(opts);

  app.get('/health', () => ({ status: 'ok' }));

  return app;
}
