import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/index.js';
import type { EvolutionClient } from '../modules/evolution/client.js';

interface TestSendBody {
  text?: string;
}

export async function testRoutes(
  app: FastifyInstance,
  opts: {
    config: AppConfig;
    evolution: EvolutionClient;
  },
): Promise<void> {
  app.post('/test/send-message', async (request, reply) => {
    const expectedKey = (opts.config.TEST_ENDPOINT_KEY || '').trim();
    if (expectedKey) {
      const actualKey = String(request.headers['x-test-key'] || '').trim();
      if (!actualKey || actualKey !== expectedKey) {
        reply.status(401).send({ ok: false, error: 'unauthorized' });
        return;
      }
    }

    const body = (request.body || {}) as TestSendBody;
    const text = (body.text || '').trim() || 'Test message from floo_whatsapp_nodejs_server.';

    await opts.evolution.sendText(opts.config.TEST_RECIPIENT_PHONE, text);
    reply.status(200).send({
      ok: true,
      phone: opts.config.TEST_RECIPIENT_PHONE,
      text,
    });
  });
}
