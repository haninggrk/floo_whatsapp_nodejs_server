import type { FastifyInstance } from 'fastify';
import type { ConversationEngine } from '../modules/conversation/engine.js';
import { normalizePhone } from '../shared/phone.js';

export async function webhookRoutes(
  app: FastifyInstance,
  opts: { engine: ConversationEngine },
): Promise<void> {
  const handler = async (request: { body?: unknown }, reply: { status: (code: number) => { send: (payload: Record<string, unknown>) => void } }) => {
    // Ack early so Evolution does not retry aggressively on downstream failures.
    reply.status(200).send({ ok: true });

    try {
      const body = (request.body || {}) as Record<string, unknown>;
      const data = (body.data || body) as Record<string, unknown>;
      const key = (data.key || {}) as Record<string, unknown>;
      const messageObj = (data.message || {}) as Record<string, unknown>;
      const extendedText = (messageObj.extendedTextMessage || {}) as Record<string, unknown>;

      const fromMe = key.fromMe === true;
      const remoteJid = String(key.remoteJid || '');
      const isGroup = remoteJid.includes('@g.us');

      const text = String(messageObj.conversation || extendedText.text || '').trim();
      if (fromMe || isGroup || !text) {
        return;
      }

      const phone = normalizePhone(remoteJid);
      if (!phone) {
        return;
      }

      await opts.engine.handleIncomingMessage(phone, text);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Webhook processing error:', error);
    }
  };

  app.post('/webhooks/whatsapp/messages/messages-upsert', handler);
  app.post('/webhooks/whatsapp/messages', handler);
}
