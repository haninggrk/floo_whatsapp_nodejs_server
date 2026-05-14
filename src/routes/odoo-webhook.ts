import type { FastifyInstance } from 'fastify';
import type { EvolutionClient } from '../modules/evolution/client.js';
import type { EventRepository } from '../modules/session/event-repository.js';
import type { SessionRepository } from '../modules/session/session-repository.js';
import type { CartRepository } from '../modules/session/cart-repository.js';
import { normalizePhone } from '../shared/phone.js';

interface OdooWebhookPayload {
  event_id?: string;
  type: 'payment_paid' | 'delivery_morning' | string;
  partner_phone?: string;
  partner_name?: string;
  order_name?: string;
  currency?: string;
  amount_total?: number;
  invoice_name?: string;
  invoice_url?: string;
  invoice_pdf_url?: string;
  scheduled_date?: string;
}

export async function odooWebhookRoutes(
  app: FastifyInstance,
  opts: {
    evolution: EvolutionClient;
    events: EventRepository;
    sessions: SessionRepository;
    carts: CartRepository;
  },
): Promise<void> {
  app.post('/webhooks/odoo', async (request, reply) => {
    const payload = request.body as OdooWebhookPayload;

    const eventId = (payload.event_id || '').trim() || `${payload.type}:${payload.order_name || ''}:${payload.partner_phone || ''}`;
    if (opts.events.has(eventId)) {
      reply.status(200).send({ ok: true, duplicate: true });
      return;
    }

    const phone = normalizePhone(payload.partner_phone || '');
    if (!phone) {
      reply.status(400).send({ ok: false, error: 'partner_phone is required' });
      return;
    }

    if (payload.type === 'payment_paid') {
      const total = payload.amount_total || 0;
      const currency = payload.currency || 'IDR';
      const invoiceName = payload.invoice_name || '-';

      await opts.evolution.sendText(
        phone,
        [
          `Pembayaran berhasil untuk order *${payload.order_name || '-'}*.`,
          `Total: ${currency} ${total.toLocaleString('id-ID')}`,
          `Invoice: *${invoiceName}*`,
          '',
          'Terima kasih, pesanan Anda sedang diproses.',
        ].join('\n'),
      );

      if (payload.invoice_pdf_url) {
        await opts.evolution.sendDocument(
          phone,
          payload.invoice_pdf_url,
          `${invoiceName}.pdf`,
          `Invoice ${invoiceName}`,
        );
      } else if (payload.invoice_url) {
        await opts.evolution.sendText(
          phone,
          [
            'Lihat invoice Anda di link berikut:',
            payload.invoice_url,
          ].join('\n'),
        );
      }

      opts.carts.clear(phone);
      opts.sessions.reset(phone);
    } else if (payload.type === 'delivery_morning') {
      await opts.evolution.sendText(
        phone,
        [
          `Selamat pagi ${payload.partner_name || 'Bapak/Ibu'},`,
          `Pesanan *${payload.order_name || '-'}* dijadwalkan dikirim hari ini.`,
          payload.scheduled_date ? `Jadwal: ${payload.scheduled_date}` : '',
          '',
          'Tim kami akan menghubungi Anda jika ada update.',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }

    opts.events.create(eventId, payload.type, payload);
    reply.status(200).send({ ok: true });
  });
}
