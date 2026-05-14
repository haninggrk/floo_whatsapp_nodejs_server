import type { FastifyInstance } from 'fastify';
import type { ConversationEngine } from '../modules/conversation/engine.js';
import { normalizePhone } from '../shared/phone.js';

export async function webhookRoutes(
  app: FastifyInstance,
  opts: { engine: ConversationEngine },
): Promise<void> {
  app.post('/webhooks/whatsapp/messages/messages-upsert', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const data = (body.data || body) as Record<string, unknown>;
    const key = (data.key || {}) as Record<string, unknown>;
    const messageObj = (data.message || {}) as Record<string, unknown>;
    const extendedText = (messageObj.extendedTextMessage || {}) as Record<string, unknown>;

    const fromMe = key.fromMe === true;
    const remoteJid = String(key.remoteJid || '');
    const isGroup = remoteJid.includes('@g.us');

    const text = String(messageObj.conversation || extendedText.text || '').trim();
    if (fromMe || isGroup || !text) {
      reply.status(200).send({ ok: true, skipped: true });
      return;
    }

    const phone = normalizePhone(remoteJid);
    if (!phone) {
      reply.status(200).send({ ok: true, skipped: true });
      return;
    }

    await opts.engine.handleIncomingMessage(phone, text);
    reply.status(200).send({ ok: true });
  });
}
