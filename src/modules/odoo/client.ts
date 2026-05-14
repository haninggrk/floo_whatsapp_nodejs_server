import type { AppConfig } from '../../config/index.js';

interface OdooRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { message?: string; data?: unknown };
}

export interface OdooCustomer {
  found: boolean;
  partner_id: number | null;
  name: string;
  wa_shipping_address: string;
}

export interface OdooProduct {
  id: number;
  name: string;
  price: number;
}

export interface OdooProductResponse {
  products: OdooProduct[];
  total: number;
}

export interface OdooPaymentResponse {
  order_id: number;
  order_name: string;
  amount_total: number;
  currency: string;
  payment_url: string;
}

export interface OdooAddress {
  id: number;
  label: string;
  full_address: string;
}

export class OdooClient {
  private uid: number | null = null;

  constructor(private readonly config: AppConfig) {}

  async ping(): Promise<{ ok: true; uid: number }> {
    const uid = await this.getUid();
    return { ok: true, uid };
  }

  async getCustomerByPhone(phone: string): Promise<OdooCustomer> {
    return this.callModel('sale.order', 'wa_get_customer_by_phone', [phone]);
  }

  async getCompanyName(): Promise<string> {
    const res = await this.callModel<{ company_name: string }>('sale.order', 'wa_get_company_name', []);
    return res.company_name || 'Perusahaan';
  }

  async findOrCreateCustomer(phone: string, name: string): Promise<OdooCustomer> {
    return this.callModel('sale.order', 'wa_find_or_create_customer', [phone, name]);
  }

  async updateCustomerAddress(partnerId: number, address: string): Promise<{ ok: boolean }> {
    return this.callModel('sale.order', 'wa_update_customer_address', [partnerId, address]);
  }

  async listCustomerAddresses(partnerId: number): Promise<{ addresses: OdooAddress[] }> {
    return this.callModel('sale.order', 'wa_list_customer_addresses', [partnerId]);
  }

  async createCustomerAddress(
    partnerId: number,
    payload: {
      recipient_name: string;
      phone: string;
      street: string;
      village: string;
      district: string;
      city: string;
      province: string;
      postal_code: string;
    },
  ): Promise<{ address_id: number; label: string; full_address: string }> {
    return this.callModel('sale.order', 'wa_create_customer_address', [partnerId, payload]);
  }

  async listProducts(
    partnerId: number,
    search: string,
    limit: number,
    offset: number,
  ): Promise<OdooProductResponse> {
    return this.callModel('sale.order', 'wa_list_whatsapp_products', [partnerId, search, limit, offset]);
  }

  async createOrderWithPayment(
    partnerId: number,
    phone: string,
    items: Array<{ product_id: number; quantity: number }>,
    shippingAddressId?: number,
  ): Promise<OdooPaymentResponse> {
    return this.callModel('sale.order', 'wa_create_order_with_payment', [partnerId, phone, items, shippingAddressId || false]);
  }

  private async callModel<T>(model: string, method: string, args: unknown[]): Promise<T> {
    const uid = await this.getUid();
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.ODOO_DB,
          uid,
          this.config.ODOO_PASSWORD,
          model,
          method,
          args,
          {},
        ],
      },
      id: Date.now(),
    };

    const response = await fetch(`${this.config.ODOO_URL}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Odoo object call failed with status ${response.status}`);
    }

    const body = (await response.json()) as OdooRpcResponse<T>;
    if (body.error) {
      const extra = body.error.data ? ` | data=${JSON.stringify(body.error.data)}` : '';
      throw new Error((body.error.message || `Odoo model call failed: ${model}.${method}`) + extra);
    }

    if (body.result === undefined) {
      throw new Error(`Odoo model call returned empty result: ${model}.${method}`);
    }

    return body.result;
  }

  private async getUid(): Promise<number> {
    if (this.uid) {
      return this.uid;
    }

    const forcedUid = (this.config.ODOO_UID || '').trim();
    if (forcedUid) {
      this.uid = Number.parseInt(forcedUid, 10);
      if (!Number.isInteger(this.uid)) {
        throw new Error('ODOO_UID must be an integer when provided');
      }
      return this.uid;
    }

    const login = (this.config.ODOO_LOGIN || '').trim();
    if (!login) {
      throw new Error('ODOO_LOGIN is required when ODOO_UID is not provided');
    }

    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'common',
        method: 'authenticate',
        args: [this.config.ODOO_DB, login, this.config.ODOO_PASSWORD, {}],
      },
      id: Date.now(),
    };

    const response = await fetch(`${this.config.ODOO_URL}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Odoo authenticate failed with status ${response.status}`);
    }

    const body = (await response.json()) as OdooRpcResponse<number>;
    if (body.error || !body.result) {
      throw new Error(body.error?.message || 'Odoo authentication failed');
    }

    this.uid = body.result;
    return this.uid;
  }
}
