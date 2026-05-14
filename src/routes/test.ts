import { lookup } from 'node:dns/promises';
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
  const requireKey = (request: { headers: Record<string, unknown> }, reply: { status: (code: number) => { send: (payload: Record<string, unknown>) => void } }): boolean => {
    const expectedKey = (opts.config.TEST_ENDPOINT_KEY || '').trim();
    if (!expectedKey) {
      return false;
    }

    const actualKey = String(request.headers['x-test-key'] || '').trim();
    if (!actualKey || actualKey !== expectedKey) {
      reply.status(401).send({ ok: false, error: 'unauthorized' });
      return true;
    }

    return false;
  };

  app.post('/test/send-message', async (request, reply) => {
    if (requireKey(request, reply)) {
      return;
    }

    const body = (request.body || {}) as TestSendBody;
    const text = (body.text || '').trim() || 'Test message from floo_whatsapp_nodejs_server.';

    try {
      await opts.evolution.sendText(opts.config.TEST_RECIPIENT_PHONE, text);
      reply.status(200).send({
        ok: true,
        phone: opts.config.TEST_RECIPIENT_PHONE,
        text,
      });
    } catch (error) {
      const err = error as Error & { cause?: { code?: string; message?: string } };
      reply.status(502).send({
        ok: false,
        error: 'evolution_request_failed',
        message: err.message,
        cause: err.cause?.code || err.cause?.message || null,
      });
    }
  });

  app.get('/test/evolution-ping', async (request, reply) => {
    if (requireKey(request, reply)) {
      return;
    }

    let host = '';
    try {
      host = new URL(opts.config.EVOLUTION_API_URL).hostname;
    } catch {
      reply.status(500).send({
        ok: false,
        error: 'invalid_evolution_url',
        value: opts.config.EVOLUTION_API_URL,
      });
      return;
    }

    const result: Record<string, unknown> = {
      ok: true,
      evolutionUrl: opts.config.EVOLUTION_API_URL,
      host,
    };

    try {
      const dns = await lookup(host);
      result.dns = { address: dns.address, family: dns.family };
    } catch (error) {
      const err = error as Error & { code?: string };
      result.ok = false;
      result.dns = {
        error: err.message,
        code: err.code || null,
      };
      reply.status(502).send(result);
      return;
    }

    try {
      const response = await fetch(opts.config.EVOLUTION_API_URL, { method: 'GET' });
      result.http = {
        ok: response.ok,
        status: response.status,
      };
    } catch (error) {
      const err = error as Error & { cause?: { code?: string; message?: string } };
      result.ok = false;
      result.http = {
        error: err.message,
        cause: err.cause?.code || err.cause?.message || null,
      };
      reply.status(502).send(result);
      return;
    }

    reply.status(200).send(result);
  });
}
