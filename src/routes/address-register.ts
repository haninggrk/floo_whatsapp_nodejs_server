import type { FastifyInstance } from 'fastify';
import type { OdooClient } from '../modules/odoo/client.js';

interface AddressRegisterQuery {
  phone?: string;
  partnerId?: string;
}

interface AddressRegisterBody {
  phone?: string;
  partnerId?: number;
  customerName?: string;
  recipient_name?: string;
  contact_phone?: string;
  street?: string;
  village?: string;
  district?: string;
  city?: string;
  province?: string;
  postal_code?: string;
}

function escHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderFormHtml(phone: string, partnerId: string): string {
  const safePhone = escHtml(phone);
  const safePartnerId = escHtml(partnerId);
  const needsCustomerName = safePartnerId === '';

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Daftar Alamat</title>
  <style>
    :root {
      --bg: #f4f7fb;
      --card: #ffffff;
      --ink: #1f2937;
      --muted: #6b7280;
      --brand: #0365f8;
      --line: #d9e2f2;
    }
    body {
      margin: 0;
      background: linear-gradient(135deg, #eef4ff 0%, #f8fbff 50%, #eef6f3 100%);
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      color: var(--ink);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .card {
      width: 100%;
      max-width: 640px;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: 0 10px 30px rgba(3, 101, 248, 0.08);
      overflow: hidden;
    }
    .head {
      padding: 18px 20px;
      background: linear-gradient(135deg, #0365f8, #2f7dff);
      color: #fff;
      font-weight: 600;
      font-size: 18px;
    }
    .body {
      padding: 20px;
      display: grid;
      gap: 12px;
    }
    label {
      display: grid;
      gap: 6px;
      font-size: 13px;
      color: var(--muted);
      font-weight: 600;
    }
    input {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 14px;
      color: var(--ink);
      outline: none;
    }
    input:focus {
      border-color: var(--brand);
      box-shadow: 0 0 0 3px rgba(3, 101, 248, 0.12);
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .muted {
      color: var(--muted);
      font-size: 12px;
      margin-top: -4px;
    }
    button {
      margin-top: 4px;
      border: 0;
      border-radius: 10px;
      background: var(--brand);
      color: white;
      font-size: 14px;
      font-weight: 700;
      padding: 11px 14px;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    #msg {
      min-height: 20px;
      font-size: 13px;
    }
    #msg.ok { color: #0f766e; }
    #msg.err { color: #b91c1c; }
    @media (max-width: 700px) {
      .grid-2 { grid-template-columns: 1fr; }
      .head { font-size: 16px; }
    }
  </style>
</head>
<body>
  <main class="card">
    <section class="head">Form Alamat Pengiriman</section>
    <form id="addressForm" class="body">
      <input id="phone" type="hidden" value="${safePhone}" />
      <input id="partnerId" type="hidden" value="${safePartnerId}" />

      ${needsCustomerName ? `<label>Nama Customer
        <input id="customerName" type="text" placeholder="Nama lengkap" required />
      </label>` : ''}

      <div class="grid-2">
        <label>Nama Penerima
          <input id="recipient_name" type="text" placeholder="Nama penerima barang" required />
        </label>
        <label>No HP Penerima
          <input id="contact_phone" type="text" placeholder="08xxxxxxxxxx" required />
        </label>
      </div>

      <label>Jalan
        <input id="street" type="text" placeholder="Jalan, nomor rumah, patokan" required />
      </label>

      <div class="grid-2">
        <label>Kelurahan
          <input id="village" type="text" required />
        </label>
        <label>Kecamatan
          <input id="district" type="text" required />
        </label>
      </div>

      <div class="grid-2">
        <label>Kota/Kabupaten
          <input id="city" type="text" required />
        </label>
        <label>Provinsi
          <input id="province" type="text" required />
        </label>
      </div>

      <label>Kode Pos
        <input id="postal_code" type="text" required />
      </label>

      <div class="muted">Nomor WhatsApp: ${safePhone}</div>
      <button id="submitBtn" type="submit">Simpan Alamat</button>
      <div id="msg"></div>
    </form>
  </main>

  <script>
    const form = document.getElementById('addressForm');
    const submitBtn = document.getElementById('submitBtn');
    const msg = document.getElementById('msg');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      msg.className = '';
      msg.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Menyimpan...';

      const payload = {
        phone: document.getElementById('phone').value,
        partnerId: Number(document.getElementById('partnerId').value || 0) || undefined,
        customerName: (document.getElementById('customerName') || { value: '' }).value,
        recipient_name: document.getElementById('recipient_name').value,
        contact_phone: document.getElementById('contact_phone').value,
        street: document.getElementById('street').value,
        village: document.getElementById('village').value,
        district: document.getElementById('district').value,
        city: document.getElementById('city').value,
        province: document.getElementById('province').value,
        postal_code: document.getElementById('postal_code').value,
      };

      try {
        const response = await fetch('/address/register/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await response.json();

        if (!response.ok || !json.ok) {
          throw new Error(json.message || 'Gagal menyimpan alamat.');
        }

        msg.className = 'ok';
        msg.textContent = 'Alamat berhasil disimpan. Kembali ke WhatsApp lalu ketik "mulai".';
        form.reset();
      } catch (error) {
        msg.className = 'err';
        msg.textContent = String(error && error.message ? error.message : error);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Simpan Alamat';
      }
    });
  </script>
</body>
</html>`;
}

export async function addressRegisterRoutes(
  app: FastifyInstance,
  opts: { odoo: OdooClient },
): Promise<void> {
  app.get<{ Querystring: AddressRegisterQuery }>('/address/register', async (request, reply) => {
    const phone = String(request.query.phone || '').trim();
    const partnerId = String(request.query.partnerId || '').trim();

    if (!phone) {
      reply.status(400).type('text/plain').send('phone query parameter is required');
      return;
    }

    reply.type('text/html').send(renderFormHtml(phone, partnerId));
  });

  app.post<{ Body: AddressRegisterBody }>('/address/register/submit', async (request, reply) => {
    const body = request.body || {};
    const phone = String(body.phone || '').trim();
    let partnerId = Number(body.partnerId || 0) || 0;

    if (!phone) {
      reply.status(400).send({ ok: false, message: 'Nomor WhatsApp wajib diisi.' });
      return;
    }

    if (!partnerId) {
      const customerName = String(body.customerName || '').trim();
      if (!customerName) {
        reply.status(400).send({ ok: false, message: 'Nama customer wajib diisi.' });
        return;
      }
      const customer = await opts.odoo.findOrCreateCustomer(phone, customerName);
      if (!customer.partner_id) {
        reply.status(500).send({ ok: false, message: 'Gagal membuat customer di Odoo.' });
        return;
      }
      partnerId = customer.partner_id;
    }

    await opts.odoo.createCustomerAddress(partnerId, {
      recipient_name: String(body.recipient_name || '').trim(),
      phone: String(body.contact_phone || '').trim(),
      street: String(body.street || '').trim(),
      village: String(body.village || '').trim(),
      district: String(body.district || '').trim(),
      city: String(body.city || '').trim(),
      province: String(body.province || '').trim(),
      postal_code: String(body.postal_code || '').trim(),
    });

    reply.status(200).send({ ok: true });
  });
}
