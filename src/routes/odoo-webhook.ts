import type { FastifyInstance } from 'fastify';
import type { EvolutionClient } from '../modules/evolution/client.js';
import type { EventRepository } from '../modules/session/event-repository.js';
import type { SessionRepository } from '../modules/session/session-repository.js';
import type { CartRepository } from '../modules/session/cart-repository.js';
import { normalizePhone } from '../shared/phone.js';

interface OdooWebhookPayload {
  event_id?: string;
  type: 'payment_paid' | 'delivery_morning' | 'delivery_locked' | 'delivery_unlocked' | string;
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

function formatScheduledDateId(raw?: string): { dateText?: string; timeText?: string } {
  const text = String(raw || '').trim();
  const m = text.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!m) {
    return {};
  }

  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  const year = Number(m[3]);
  const hour = m[4];
  const minute = m[5];

  const dateObj = new Date(year, month, day);
  if (Number.isNaN(dateObj.getTime())) {
    return {};
  }

  const weekdays = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const weekdayName = weekdays[dateObj.getDay()] || '';
  const monthName = months[month] || '';

  return {
    dateText: weekdayName && monthName ? `${weekdayName}, ${day} ${monthName} ${year}` : undefined,
    timeText: `${hour}:${minute}`,
  };
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
    } else if (payload.type === 'delivery_locked') {
      const when = formatScheduledDateId(payload.scheduled_date);
      await opts.evolution.sendText(
        phone,
        [
          `Halo, pesanan *${payload.order_name || '-'}* telah dijadwalkan dikirim.`,
          when.dateText ? `📅 Tanggal: ${when.dateText}` : (payload.scheduled_date ? `📅 Tanggal: ${payload.scheduled_date}` : ''),
          when.timeText ? `🕐 Jam: ${when.timeText}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    } else if (payload.type === 'delivery_unlocked') {
      const when = formatScheduledDateId(payload.scheduled_date);
      await opts.evolution.sendText(
        phone,
        [
          `Halo ${payload.partner_name || 'Bapak/Ibu'},`,
          `Jadwal pengiriman untuk order *${payload.order_name || '-'}* sedang dibuka kembali untuk penyesuaian.`,
          when.dateText ? `📅 Tanggal: ${when.dateText}` : (payload.scheduled_date ? `📅 Tanggal: ${payload.scheduled_date}` : ''),
          when.timeText ? `🕐 Jam: ${when.timeText}` : '',
          '',
          'Kami akan kirim konfirmasi lagi setelah jadwal dikunci ulang.',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }

    opts.events.create(eventId, payload.type, payload);
    reply.status(200).send({ ok: true });
  });
}
