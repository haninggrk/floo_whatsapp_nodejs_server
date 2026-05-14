import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health/live', async () => ({ ok: true }));
  app.get('/health/ready', async () => ({ ok: true }));
}
