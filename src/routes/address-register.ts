import type { FastifyInstance } from 'fastify';
import type { OdooClient } from '../modules/odoo/client.js';
import type { EvolutionClient } from '../modules/evolution/client.js';

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

interface RegionParentQuery {
  provinceId?: string;
  regencyId?: string;
  districtId?: string;
  villageId?: string;
}

interface RegionRow {
  id: string;
  parent_id?: string;
  name: string;
}

const SOURCE_WILAYAH = 'https://raw.githubusercontent.com/cahyadsn/wilayah/master/db/wilayah.sql';
const SOURCE_KODEPOS = 'https://raw.githubusercontent.com/cahyadsn/wilayah_kodepos/main/db/wilayah_kodepos.sql';

let wilayahRowsCache: RegionRow[] | null = null;
let kodeposMapCache: Map<string, string> | null = null;

function escHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parentCode(code: string): string | undefined {
  if (code.length === 2) return undefined;
  if (code.length === 5) return code.slice(0, 2);
  if (code.length === 8) return code.slice(0, 5);
  if (code.length === 13) return code.slice(0, 8);
  return undefined;
}

function parseSqlPairs(sql: string): Array<{ code: string; value: string }> {
  const rows: Array<{ code: string; value: string }> = [];
  const regex = /\('([^']+)'\s*,\s*'([^']*)'\)/g;
  let match: RegExpExecArray | null = regex.exec(sql);
  while (match) {
    rows.push({ code: match[1], value: match[2] });
    match = regex.exec(sql);
  }
  return rows;
}

async function getWilayahRows(): Promise<RegionRow[]> {
  if (wilayahRowsCache) {
    return wilayahRowsCache;
  }

  const response = await fetch(SOURCE_WILAYAH);
  if (!response.ok) {
    throw new Error('Failed to load wilayah master data');
  }
  const sql = await response.text();
  const pairs = parseSqlPairs(sql);

  wilayahRowsCache = pairs
    .map((p) => ({
      id: p.code,
      parent_id: parentCode(p.code),
      name: p.value,
    }))
    .filter((r) => r.id.length === 2 || r.id.length === 5 || r.id.length === 8 || r.id.length === 13);

  return wilayahRowsCache;
}

async function getKodeposMap(): Promise<Map<string, string>> {
  if (kodeposMapCache) {
    return kodeposMapCache;
  }

  const response = await fetch(SOURCE_KODEPOS);
  if (!response.ok) {
    throw new Error('Failed to load kodepos master data');
  }
  const sql = await response.text();
  const pairs = parseSqlPairs(sql);

  kodeposMapCache = new Map<string, string>();
  for (const row of pairs) {
    kodeposMapCache.set(row.code, row.value);
  }
  return kodeposMapCache;
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
      --bg: #edf2ec;
      --card: #ffffff;
      --ink: #1f2d22;
      --muted: #5f6d62;
      --brand: #25523b;
      --line: #c8d3ca;
    }
    body {
      margin: 0;
      background: var(--bg);
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
      box-shadow: 0 8px 22px rgba(37, 82, 59, 0.12);
      overflow: hidden;
    }
    .head {
      padding: 18px 20px;
      background: var(--brand);
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
    input, select {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 14px;
      color: var(--ink);
      outline: none;
      background: #fff;
    }
    input:focus, select:focus {
      border-color: var(--brand);
      box-shadow: 0 0 0 3px rgba(37, 82, 59, 0.14);
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
    #msg.ok { color: #0f5d36; }
    #msg.err { color: #8c1f1f; }
    .wa-link {
      display: inline-block;
      margin-top: 8px;
      color: var(--brand);
      text-decoration: underline;
      font-weight: 600;
    }
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
          <input id="contact_phone" type="text" value="${safePhone}" placeholder="08xxxxxxxxxx" required />
        </label>
      </div>

      <label>Jalan
        <input id="street" type="text" placeholder="Jalan, nomor rumah, patokan" required />
      </label>

      <div class="grid-2">
        <label>Provinsi
          <select id="province" required>
            <option value="">Pilih Provinsi</option>
          </select>
        </label>
        <label>Kota/Kabupaten
          <select id="city" required disabled>
            <option value="">Pilih Kota/Kabupaten</option>
          </select>
        </label>
      </div>

      <div class="grid-2">
        <label>Kecamatan
          <select id="district" required disabled>
            <option value="">Pilih Kecamatan</option>
          </select>
        </label>
        <label>Kelurahan
          <select id="village" required disabled>
            <option value="">Pilih Kelurahan</option>
          </select>
        </label>
      </div>

      <label>Kode Pos
        <input id="postal_code" type="text" readonly required />
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
    const provinceEl = document.getElementById('province');
    const cityEl = document.getElementById('city');
    const districtEl = document.getElementById('district');
    const villageEl = document.getElementById('village');
    const postalEl = document.getElementById('postal_code');

    function setOptions(selectEl, items, placeholder) {
      selectEl.innerHTML = '';
      const first = document.createElement('option');
      first.value = '';
      first.textContent = placeholder;
      selectEl.appendChild(first);
      for (const item of items) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        selectEl.appendChild(option);
      }
    }

    async function loadProvinces() {
      const response = await fetch('/address/regions/provinces');
      const json = await response.json();
      setOptions(provinceEl, json.items || [], 'Pilih Provinsi');
    }

    async function loadRegencies(provinceId) {
      const response = await fetch('/address/regions/regencies?provinceId=' + encodeURIComponent(provinceId));
      const json = await response.json();
      setOptions(cityEl, json.items || [], 'Pilih Kota/Kabupaten');
      cityEl.disabled = false;
      setOptions(districtEl, [], 'Pilih Kecamatan');
      districtEl.disabled = true;
      setOptions(villageEl, [], 'Pilih Kelurahan');
      villageEl.disabled = true;
      postalEl.value = '';
    }

    async function loadDistricts(regencyId) {
      const response = await fetch('/address/regions/districts?regencyId=' + encodeURIComponent(regencyId));
      const json = await response.json();
      setOptions(districtEl, json.items || [], 'Pilih Kecamatan');
      districtEl.disabled = false;
      setOptions(villageEl, [], 'Pilih Kelurahan');
      villageEl.disabled = true;
      postalEl.value = '';
    }

    async function loadVillages(districtId) {
      const response = await fetch('/address/regions/villages?districtId=' + encodeURIComponent(districtId));
      const json = await response.json();
      setOptions(villageEl, json.items || [], 'Pilih Kelurahan');
      villageEl.disabled = false;
      postalEl.value = '';
    }

    async function loadPostalCode(villageId) {
      const response = await fetch('/address/regions/postal-code?villageId=' + encodeURIComponent(villageId));
      const json = await response.json();
      if (response.ok && json.postal_code) {
        postalEl.value = json.postal_code;
      } else {
        postalEl.value = '';
      }
    }

    provinceEl.addEventListener('change', async () => {
      const provinceId = provinceEl.value;
      if (!provinceId) {
        setOptions(cityEl, [], 'Pilih Kota/Kabupaten');
        cityEl.disabled = true;
        setOptions(districtEl, [], 'Pilih Kecamatan');
        districtEl.disabled = true;
        setOptions(villageEl, [], 'Pilih Kelurahan');
        villageEl.disabled = true;
        postalEl.value = '';
        return;
      }
      await loadRegencies(provinceId);
    });

    cityEl.addEventListener('change', async () => {
      const regencyId = cityEl.value;
      if (!regencyId) {
        setOptions(districtEl, [], 'Pilih Kecamatan');
        districtEl.disabled = true;
        setOptions(villageEl, [], 'Pilih Kelurahan');
        villageEl.disabled = true;
        postalEl.value = '';
        return;
      }
      await loadDistricts(regencyId);
    });

    districtEl.addEventListener('change', async () => {
      const districtId = districtEl.value;
      if (!districtId) {
        setOptions(villageEl, [], 'Pilih Kelurahan');
        villageEl.disabled = true;
        postalEl.value = '';
        return;
      }
      await loadVillages(districtId);
    });

    villageEl.addEventListener('change', async () => {
      const villageId = villageEl.value;
      if (!villageId) {
        postalEl.value = '';
        return;
      }
      await loadPostalCode(villageId);
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      msg.className = '';
      msg.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Menyimpan...';

      const phone = document.getElementById('phone').value;
      const phoneDigits = String(phone).replace(/[^\d]/g, '');
      const waLink = 'https://wa.me/' + phoneDigits + '?text=' + encodeURIComponent('mulai');

      const payload = {
        phone,
        partnerId: Number(document.getElementById('partnerId').value || 0) || undefined,
        customerName: (document.getElementById('customerName') || { value: '' }).value,
        recipient_name: document.getElementById('recipient_name').value,
        contact_phone: document.getElementById('contact_phone').value,
        street: document.getElementById('street').value,
        village: villageEl.options[villageEl.selectedIndex] ? villageEl.options[villageEl.selectedIndex].text : '',
        district: districtEl.options[districtEl.selectedIndex] ? districtEl.options[districtEl.selectedIndex].text : '',
        city: cityEl.options[cityEl.selectedIndex] ? cityEl.options[cityEl.selectedIndex].text : '',
        province: provinceEl.options[provinceEl.selectedIndex] ? provinceEl.options[provinceEl.selectedIndex].text : '',
        postal_code: postalEl.value,
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
        msg.innerHTML = 'Alamat berhasil disimpan. Lanjut pemesanan via WhatsApp.<br/><a class="wa-link" href="' + waLink + '">Buka WhatsApp dan kirim "mulai"</a>';
        form.reset();
        cityEl.disabled = true;
        districtEl.disabled = true;
        villageEl.disabled = true;
        postalEl.value = '';
      } catch (error) {
        msg.className = 'err';
        msg.textContent = String(error && error.message ? error.message : error);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Simpan Alamat';
      }
    });

    loadProvinces().catch((error) => {
      msg.className = 'err';
      msg.textContent = String(error && error.message ? error.message : error);
    });
  </script>
</body>
</html>`;
}

export async function addressRegisterRoutes(
  app: FastifyInstance,
  opts: { odoo: OdooClient; evolution?: EvolutionClient },
): Promise<void> {
  app.get('/address/regions/provinces', async (_request, reply) => {
    const rows = await getWilayahRows();
    reply.status(200).send({ items: rows.filter((r) => r.id.length === 2) });
  });

  app.get<{ Querystring: RegionParentQuery }>('/address/regions/regencies', async (request, reply) => {
    const provinceId = String(request.query.provinceId || '').trim();
    if (!provinceId) {
      reply.status(400).send({ items: [], message: 'provinceId is required' });
      return;
    }
    const rows = await getWilayahRows();
    reply.status(200).send({ items: rows.filter((r) => r.id.length === 5 && r.parent_id === provinceId) });
  });

  app.get<{ Querystring: RegionParentQuery }>('/address/regions/districts', async (request, reply) => {
    const regencyId = String(request.query.regencyId || '').trim();
    if (!regencyId) {
      reply.status(400).send({ items: [], message: 'regencyId is required' });
      return;
    }
    const rows = await getWilayahRows();
    reply.status(200).send({ items: rows.filter((r) => r.id.length === 8 && r.parent_id === regencyId) });
  });

  app.get<{ Querystring: RegionParentQuery }>('/address/regions/villages', async (request, reply) => {
    const districtId = String(request.query.districtId || '').trim();
    if (!districtId) {
      reply.status(400).send({ items: [], message: 'districtId is required' });
      return;
    }
    const rows = await getWilayahRows();
    reply.status(200).send({ items: rows.filter((r) => r.id.length === 13 && r.parent_id === districtId) });
  });

  app.get<{ Querystring: RegionParentQuery }>('/address/regions/postal-code', async (request, reply) => {
    const villageId = String(request.query.villageId || '').trim();
    if (!villageId) {
      reply.status(400).send({ postal_code: '', message: 'villageId is required' });
      return;
    }

    const map = await getKodeposMap();
    const postalCode = map.get(villageId) || '';
    reply.status(postalCode ? 200 : 404).send({ postal_code: postalCode });
  });

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

    if (opts.evolution) {
      try {
        await opts.evolution.sendText(phone, 'Alamat berhasil disimpan. Ketik *mulai* untuk lanjut pemesanan.');
      } catch {
        // Keep form success even if outbound WhatsApp notification fails.
      }
    }

    reply.status(200).send({ ok: true });
  });
}
