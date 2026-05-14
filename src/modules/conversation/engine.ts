import type { CartRepository } from '../session/cart-repository.js';
import type { EvolutionClient } from '../evolution/client.js';
import type { OdooAddress, OdooClient, OdooProduct } from '../odoo/client.js';
import type { SessionRepository, Session } from '../session/session-repository.js';
import { parsePositiveNumber, parseSelection } from '../../shared/validation.js';

interface ConversationDeps {
  sessions: SessionRepository;
  carts: CartRepository;
  odoo: OdooClient;
  evolution: EvolutionClient;
  baseUrl: string;
}

interface SessionContext extends Record<string, unknown> {
  wa_shipping_address?: string;
  addresses?: OdooAddress[];
  selected_shipping_address_id?: number;
  search?: string;
  offset?: number;
  products?: OdooProduct[];
  pending_product?: OdooProduct;
  return_state?: 'BROWSING_PRODUCTS';
  order_id?: number;
  order_name?: string;
  payment_url?: string;
}

export class ConversationEngine {
  private companyNameCache: string | null = null;

  constructor(private readonly deps: ConversationDeps) {}

  async handleIncomingMessage(phone: string, messageText: string): Promise<void> {
    const message = messageText.trim();
    const lower = message.toLowerCase();
    const session = this.deps.sessions.loadOrCreate(phone);

    if (['cancel', 'batal'].includes(lower)) {
      this.deps.carts.clear(phone);
      this.deps.sessions.reset(phone);
      await this.send(phone, 'Pesanan dibatalkan. Ketik *mulai* untuk order lagi.');
      return;
    }

    if (['help', 'bantuan'].includes(lower)) {
      await this.send(
        phone,
        [
          'Perintah yang tersedia:',
          '- *mulai* untuk memulai order',
          '- *keranjang* untuk lihat item',
          '- *hapus <nomor>* untuk hapus item keranjang',
          '- *checkout* untuk lanjut pembayaran',
          '- *alamat* untuk pilih/tambah alamat pengiriman',
          '- *status* untuk cek status order',
          '- *batal* untuk membatalkan sesi',
        ].join('\n'),
      );
      return;
    }

    if (lower === 'status') {
      await this.sendStatus(phone, session);
      return;
    }

    switch (session.state) {
      case 'IDLE':
        await this.startFlow(phone);
        break;
      case 'WAITING_NAME':
        await this.sendRegistrationLink(phone, session.partner_id || undefined, true);
        break;
      case 'WAITING_ADDRESS_CHOICE':
        await this.handleAddressChoice(phone, session, message, lower);
        break;
      case 'WAITING_ADDRESS_NEW':
        await this.sendRegistrationLink(phone, session.partner_id || undefined, false);
        break;
      case 'BROWSING_PRODUCTS':
        await this.handleProductBrowsing(phone, session, message, lower);
        break;
      case 'WAITING_QUANTITY':
        await this.handleQuantity(phone, session, message);
        break;
      case 'PAYMENT_PENDING':
        await this.handlePaymentPending(phone, session);
        break;
      default:
        this.deps.sessions.reset(phone);
        await this.send(phone, 'Sesi direset. Ketik *mulai* untuk memulai lagi.');
        break;
    }
  }

  private async startFlow(phone: string): Promise<void> {
    const companyName = await this.getCompanyName();
    const existing = await this.deps.odoo.getCustomerByPhone(phone);

    if (existing.found && existing.partner_id) {
      await this.send(phone, `Halo *${existing.name}* 👋\nSelamat datang di *${companyName}*.`);
      await this.promptAddressChoice(phone, existing.partner_id, existing.name);
      return;
    }

    await this.sendRegistrationLink(phone, undefined, true);
  }

  private async promptAddressChoice(
    phone: string,
    partnerId: number,
    partnerName: string | null,
    returnState?: 'BROWSING_PRODUCTS',
  ): Promise<void> {
    const previousContext = this.deps.sessions.loadOrCreate(phone).context_data as SessionContext;
    const list = await this.deps.odoo.listCustomerAddresses(partnerId);
    const addresses = list.addresses || [];

    this.deps.sessions.update(phone, 'WAITING_ADDRESS_CHOICE', {
      partnerId,
      partnerName,
      contextData: {
        ...previousContext,
        addresses,
        return_state: returnState,
      },
    });

    if (addresses.length === 0) {
      if (returnState === 'BROWSING_PRODUCTS') {
        this.deps.sessions.update(phone, 'BROWSING_PRODUCTS', {
          partnerId,
          partnerName,
          contextData: {
            ...previousContext,
            return_state: undefined,
          },
        });
      } else {
        this.deps.sessions.update(phone, 'IDLE', {
          partnerId,
          partnerName,
          contextData: {},
        });
      }

      const link = this.buildAddressRegisterLink(phone, partnerId);
      await this.send(phone, ['Belum ada alamat pengiriman tersimpan.', 'Silakan daftarkan alamat pada link berikut:', link, '', 'Setelah selesai, ketik *alamat* untuk memilih alamat.'].join('\n'));
      return;
    }

    const lines = addresses.map((a, i) => `${i + 1}. ${a.label}\n   ${a.full_address}`);
    const addNumber = addresses.length + 1;
    lines.push(`${addNumber}. Tambah alamat baru`);
    await this.send(
      phone,
      [
        'Pilih alamat pengiriman:',
        ...lines,
        '',
        'Ketik angka untuk memilih alamat.',
      ].join('\n'),
    );
  }

  private async handleAddressChoice(phone: string, session: Session, message: string, lower: string): Promise<void> {
    const partnerId = session.partner_id;
    if (!partnerId) {
      this.deps.sessions.reset(phone);
      await this.send(phone, 'Sesi tidak valid. Ketik *mulai* untuk memulai ulang.');
      return;
    }

    const context = session.context_data as SessionContext;
    const addresses = context.addresses || [];
    const returnState = context.return_state;
    const addNumber = addresses.length + 1;

    if (['tambah', 'baru', 'new'].includes(lower) || message.trim() === String(addNumber)) {
      if (returnState === 'BROWSING_PRODUCTS') {
        this.deps.sessions.update(phone, 'BROWSING_PRODUCTS', {
          partnerId,
          partnerName: session.partner_name,
          contextData: {
            ...context,
            return_state: undefined,
          },
        });
      } else {
        this.deps.sessions.update(phone, 'IDLE', {
          partnerId,
          partnerName: session.partner_name,
          contextData: {},
        });
      }

      const link = this.buildAddressRegisterLink(phone, partnerId);
      await this.send(phone, ['Silakan tambah alamat baru pada link berikut:', link, '', 'Setelah selesai, ketik *alamat* untuk pilih alamat pengiriman.'].join('\n'));
      return;
    }

    const selected = parseSelection(message, addresses.length);
    if (selected === null) {
      await this.send(phone, 'Input tidak valid. Ketik angka alamat atau *tambah*.');
      return;
    }

    const chosen = addresses[selected - 1];

    this.deps.sessions.update(phone, 'BROWSING_PRODUCTS', {
      partnerId,
      partnerName: session.partner_name,
      contextData: {
        ...context,
        selected_shipping_address_id: chosen.id,
        wa_shipping_address: chosen.full_address,
        return_state: undefined,
      },
    });

    await this.send(phone, `Alamat dipilih: *${chosen.label}*`);

    if (returnState === 'BROWSING_PRODUCTS') {
      await this.send(phone, 'Lanjut pilih produk atau ketik *checkout* jika sudah siap bayar.');
      return;
    }

    await this.showProductList(phone, partnerId, '', 0);
  }

  private async handleProductBrowsing(
    phone: string,
    session: Session,
    message: string,
    lower: string,
  ): Promise<void> {
    const partnerId = session.partner_id;
    if (!partnerId) {
      this.deps.sessions.reset(phone);
      await this.send(phone, 'Sesi tidak valid. Ketik *mulai* untuk memulai ulang.');
      return;
    }

    const context = session.context_data as SessionContext;
    const products = context.products || [];
    const currentSearch = context.search || '';
    const currentOffset = context.offset || 0;

    if (lower === 'keranjang') {
      await this.sendCart(phone);
      return;
    }

    if (lower.startsWith('hapus ')) {
      const idx = Number.parseInt(lower.replace('hapus ', '').trim(), 10);
      if (!Number.isInteger(idx) || idx < 1) {
        await this.send(phone, 'Format hapus salah. Contoh: *hapus 1*');
        return;
      }
      const removed = this.deps.carts.removeByIndex(phone, idx);
      await this.send(phone, removed ? 'Item keranjang dihapus.' : 'Nomor item tidak ditemukan.');
      return;
    }

    if (lower === 'checkout') {
      await this.handleCheckout(phone, session);
      return;
    }

    if (lower === 'alamat' || lower === 'ubah alamat') {
      await this.promptAddressChoice(phone, partnerId, session.partner_name, 'BROWSING_PRODUCTS');
      return;
    }

    if (lower.startsWith('cari ')) {
      const keyword = message.slice(5).trim();
      await this.showProductList(phone, partnerId, keyword, 0);
      return;
    }

    if (lower === 'next') {
      await this.showProductList(phone, partnerId, currentSearch, currentOffset + 10);
      return;
    }

    if (lower === 'prev') {
      await this.showProductList(phone, partnerId, currentSearch, Math.max(0, currentOffset - 10));
      return;
    }

    const selection = parseSelection(message, products.length);
    if (selection === null) {
      await this.send(
        phone,
        'Input tidak dikenali. Pilih nomor produk, ketik *cari <nama>*, *keranjang*, atau *checkout*.',
      );
      return;
    }

    const selectedProduct = products[selection - 1];
    this.deps.sessions.update(phone, 'WAITING_QUANTITY', {
      partnerId,
      partnerName: session.partner_name,
      contextData: {
        ...context,
        pending_product: selectedProduct,
      },
    });

    await this.send(
      phone,
      `Masukkan jumlah untuk *${selectedProduct.name}* (harga ${this.formatMoney(selectedProduct.price)}).`,
    );
  }

  private async handleQuantity(phone: string, session: Session, message: string): Promise<void> {
    const quantity = parsePositiveNumber(message);
    if (!quantity) {
      await this.send(phone, 'Jumlah harus lebih dari 0. Coba lagi.');
      return;
    }

    const context = session.context_data as SessionContext;
    const pending = context.pending_product;
    if (!pending) {
      this.deps.sessions.update(phone, 'BROWSING_PRODUCTS', {
        partnerId: session.partner_id,
        partnerName: session.partner_name,
        contextData: context,
      });
      await this.send(phone, 'Produk belum dipilih. Pilih produk terlebih dahulu.');
      return;
    }

    this.deps.carts.add(phone, pending.id, pending.name, pending.price, quantity);

    this.deps.sessions.update(phone, 'BROWSING_PRODUCTS', {
      partnerId: session.partner_id,
      partnerName: session.partner_name,
      contextData: {
        ...context,
        pending_product: undefined,
      },
    });

    await this.send(phone, `Ditambahkan: *${pending.name}* x ${quantity}.`);
    await this.send(phone, 'Ketik nomor produk lain, *keranjang*, atau *checkout*.');
  }

  private async handleCheckout(phone: string, session: Session): Promise<void> {
    const partnerId = session.partner_id;
    if (!partnerId) {
      this.deps.sessions.reset(phone);
      await this.send(phone, 'Sesi tidak valid. Ketik *mulai* untuk memulai ulang.');
      return;
    }

    const items = this.deps.carts.list(phone);
    if (items.length === 0) {
      await this.send(phone, 'Keranjang kosong. Silakan pilih produk dulu.');
      return;
    }

    const payment = await this.deps.odoo.createOrderWithPayment(
      partnerId,
      phone,
      items.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
      Number((session.context_data as SessionContext).selected_shipping_address_id || 0) || undefined,
    );

    this.deps.carts.clear(phone);

    this.deps.sessions.update(phone, 'PAYMENT_PENDING', {
      partnerId,
      partnerName: session.partner_name,
      contextData: {
        order_id: payment.order_id,
        order_name: payment.order_name,
        payment_url: payment.payment_url,
      },
    });

    await this.send(
      phone,
      [
        `Order *${payment.order_name}* berhasil dibuat.`,
        `Total: ${payment.currency} ${payment.amount_total.toLocaleString('id-ID')}`,
        '',
        'Silakan lakukan pembayaran melalui link berikut:',
        payment.payment_url,
        '',
        'Setelah pembayaran berhasil, invoice akan dikirim otomatis.',
      ].join('\n'),
    );
  }

  private async handlePaymentPending(phone: string, session: Session): Promise<void> {
    const context = session.context_data as SessionContext;
    await this.send(
      phone,
      [
        `Pembayaran untuk order *${context.order_name || '-'}* masih menunggu.`,
        'Silakan selesaikan pembayaran melalui link berikut:',
        `${context.payment_url || '-'}`,
        '',
        'Ketik *status* untuk cek status terbaru.',
      ].join('\n'),
    );
  }

  private async showProductList(phone: string, partnerId: number, search: string, offset: number): Promise<void> {
    const result = await this.deps.odoo.listProducts(partnerId, search, 10, offset);

    if (result.products.length === 0) {
      await this.send(phone, 'Produk tidak ditemukan. Coba kata kunci lain dengan format *cari <nama produk>*.');
      return;
    }

    const session = this.deps.sessions.loadOrCreate(phone);
    const context = session.context_data as SessionContext;

    this.deps.sessions.update(phone, 'BROWSING_PRODUCTS', {
      partnerId: session.partner_id,
      partnerName: session.partner_name,
      contextData: {
        ...context,
        search,
        offset,
        products: result.products,
      },
    });

    const list = result.products
      .map((p, idx) => `${idx + 1}. ${p.name} - ${this.formatMoney(p.price)}`)
      .join('\n');

    const hasNext = offset + result.products.length < result.total;
    const hasPrev = offset > 0;

    const nav: string[] = [];
    if (hasPrev) nav.push('*prev*');
    if (hasNext) nav.push('*next*');

    const heading = search ? `Hasil pencarian: *${search}*` : 'Daftar produk tersedia:';

    await this.send(
      phone,
      [
        heading,
        list,
        '',
        'Ketik nomor produk untuk memilih.',
        'Ketik *cari <nama>* untuk mencari produk.',
        nav.length > 0 ? `Navigasi: ${nav.join(' / ')}` : '',
        'Ketik *keranjang* untuk lihat item atau *checkout* untuk lanjut bayar.',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  private async sendCart(phone: string): Promise<void> {
    const items = this.deps.carts.list(phone);
    if (items.length === 0) {
      await this.send(phone, 'Keranjang masih kosong.');
      return;
    }

    const lines = items.map((item, idx) => {
      const subtotal = item.quantity * item.unit_price;
      return `${idx + 1}. ${item.product_name} x ${item.quantity} = ${this.formatMoney(subtotal)}`;
    });
    const total = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

    await this.send(phone, ['Keranjang Anda:', ...lines, '', `Total sementara: ${this.formatMoney(total)}`].join('\n'));
  }

  private async sendStatus(phone: string, session: Session): Promise<void> {
    const context = session.context_data as SessionContext;

    if (session.state === 'PAYMENT_PENDING') {
      await this.send(
        phone,
        [
          `Status: menunggu pembayaran untuk *${context.order_name || '-'}*.`,
          `Link pembayaran: ${context.payment_url || '-'}`,
        ].join('\n'),
      );
      return;
    }

    const items = this.deps.carts.list(phone);
    await this.send(
      phone,
      [
        `Status sesi: *${session.state}*`,
        `Jumlah item keranjang: ${items.length}`,
      ].join('\n'),
    );
  }


  private buildAddressRegisterLink(phone: string, partnerId?: number): string {
    const url = new URL('/address/register', this.deps.baseUrl);
    url.searchParams.set('phone', phone);
    if (partnerId) {
      url.searchParams.set('partnerId', String(partnerId));
    }
    return url.toString();
  }

  private async sendRegistrationLink(phone: string, partnerId?: number, includeCustomerName = false): Promise<void> {
    const companyName = await this.getCompanyName();
    const link = this.buildAddressRegisterLink(phone, partnerId);
    const lines = [
      includeCustomerName ? `Nomor Anda belum terdaftar di *${companyName}*.` : 'Silakan lengkapi data alamat Anda.',
      'Silakan daftarkan alamat Anda pada link berikut:',
      link,
      '',
      'Setelah selesai, ketik *mulai* untuk melanjutkan pemesanan.',
    ];

    this.deps.sessions.update(phone, 'IDLE', {
      contextData: {},
    });
    await this.send(phone, lines.join('\n'));
  }

  private async getCompanyName(): Promise<string> {
    if (this.companyNameCache) {
      return this.companyNameCache;
    }

    try {
      this.companyNameCache = await this.deps.odoo.getCompanyName();
    } catch {
      this.companyNameCache = 'Perusahaan';
    }
    return this.companyNameCache;
  }

  private async send(phone: string, text: string): Promise<void> {
    await this.deps.evolution.sendText(phone, text);
  }

  private formatMoney(value: number): string {
    return `Rp ${value.toLocaleString('id-ID')}`;
  }
}
