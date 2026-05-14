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

interface RegionParentQuery {
  provinceId?: string;
  regencyId?: string;
  districtId?: string;
}

interface RegionRow {
  id: string;
  parent_id?: string;
  name: string;
}

const REGION_SOURCES = {
  provinces: 'https://raw.githubusercontent.com/edwardsamuel/Wilayah-Administratif-Indonesia/master/csv/provinces.csv',
  regencies: 'https://raw.githubusercontent.com/edwardsamuel/Wilayah-Administratif-Indonesia/master/csv/regencies.csv',
  districts: 'https://raw.githubusercontent.com/edwardsamuel/Wilayah-Administratif-Indonesia/master/csv/districts.csv',
  villages: 'https://raw.githubusercontent.com/edwardsamuel/Wilayah-Administratif-Indonesia/master/csv/villages.csv',
} as const;

const REGION_CACHE: {
  provinces: RegionRow[] | null;
  regencies: RegionRow[] | null;
  districts: RegionRow[] | null;
  villages: RegionRow[] | null;
} = {
  provinces: null,
  regencies: null,
  districts: null,
  villages: null,
};

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
    const provinceEl = document.getElementById('province');
    const cityEl = document.getElementById('city');
    const districtEl = document.getElementById('district');
    const villageEl = document.getElementById('village');

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
    }

    async function loadDistricts(regencyId) {
      const response = await fetch('/address/regions/districts?regencyId=' + encodeURIComponent(regencyId));
      const json = await response.json();
      setOptions(districtEl, json.items || [], 'Pilih Kecamatan');
      districtEl.disabled = false;
      setOptions(villageEl, [], 'Pilih Kelurahan');
      villageEl.disabled = true;
    }

    async function loadVillages(districtId) {
      const response = await fetch('/address/regions/villages?districtId=' + encodeURIComponent(districtId));
      const json = await response.json();
      setOptions(villageEl, json.items || [], 'Pilih Kelurahan');
      villageEl.disabled = false;
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
        return;
      }
      await loadDistricts(regencyId);
    });

    districtEl.addEventListener('change', async () => {
      const districtId = districtEl.value;
      if (!districtId) {
        setOptions(villageEl, [], 'Pilih Kelurahan');
        villageEl.disabled = true;
        return;
      }
      await loadVillages(districtId);
    });

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
        village: villageEl.options[villageEl.selectedIndex] ? villageEl.options[villageEl.selectedIndex].text : '',
        district: districtEl.options[districtEl.selectedIndex] ? districtEl.options[districtEl.selectedIndex].text : '',
        city: cityEl.options[cityEl.selectedIndex] ? cityEl.options[cityEl.selectedIndex].text : '',
        province: provinceEl.options[provinceEl.selectedIndex] ? provinceEl.options[provinceEl.selectedIndex].text : '',
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

    loadProvinces().catch((error) => {
      msg.className = 'err';
      msg.textContent = String(error && error.message ? error.message : error);
    });
  </script>
</body>
</html>`;
}

function parseRegionCsv(content: string, hasParent: boolean): RegionRow[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',');
      if (!hasParent) {
        return { id: (parts[0] || '').trim(), name: (parts[1] || '').trim() };
      }
      return {
        id: (parts[0] || '').trim(),
        parent_id: (parts[1] || '').trim(),
        name: parts.slice(2).join(',').trim(),
      };
    })
    .filter((row) => row.id && row.name);
}

async function loadRegionData(kind: keyof typeof REGION_SOURCES): Promise<RegionRow[]> {
  const cached = REGION_CACHE[kind];
  if (cached) {
    return cached;
  }

  const response = await fetch(REGION_SOURCES[kind]);
  if (!response.ok) {
    throw new Error(`Failed loading ${kind} data`);
  }
  const text = await response.text();
  const rows = parseRegionCsv(text, kind !== 'provinces');
  REGION_CACHE[kind] = rows;
  return rows;
}

export async function addressRegisterRoutes(
  app: FastifyInstance,
  opts: { odoo: OdooClient },
): Promise<void> {
  app.get('/address/regions/provinces', async (_request, reply) => {
    const items = await loadRegionData('provinces');
    reply.status(200).send({ items });
  });

  app.get<{ Querystring: RegionParentQuery }>('/address/regions/regencies', async (request, reply) => {
    const provinceId = String(request.query.provinceId || '').trim();
    if (!provinceId) {
      reply.status(400).send({ items: [], message: 'provinceId is required' });
      return;
    }
    const all = await loadRegionData('regencies');
    reply.status(200).send({ items: all.filter((item) => item.parent_id === provinceId) });
  });

  app.get<{ Querystring: RegionParentQuery }>('/address/regions/districts', async (request, reply) => {
    const regencyId = String(request.query.regencyId || '').trim();
    if (!regencyId) {
      reply.status(400).send({ items: [], message: 'regencyId is required' });
      return;
    }
    const all = await loadRegionData('districts');
    reply.status(200).send({ items: all.filter((item) => item.parent_id === regencyId) });
  });

  app.get<{ Querystring: RegionParentQuery }>('/address/regions/villages', async (request, reply) => {
    const districtId = String(request.query.districtId || '').trim();
    if (!districtId) {
      reply.status(400).send({ items: [], message: 'districtId is required' });
      return;
    }
    const all = await loadRegionData('villages');
    reply.status(200).send({ items: all.filter((item) => item.parent_id === districtId) });
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

    reply.status(200).send({ ok: true });
  });
}
