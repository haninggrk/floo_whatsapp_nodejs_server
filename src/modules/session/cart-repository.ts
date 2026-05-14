import type Database from 'better-sqlite3';

export interface CartItem {
  id: number;
  phone: string;
  product_id: number;
  product_name: string;
  unit_price: number;
  quantity: number;
}

export class CartRepository {
  constructor(private readonly db: Database.Database) {}

  add(phone: string, productId: number, productName: string, unitPrice: number, quantity: number): void {
    this.db
      .prepare(
        `INSERT INTO wa_cart_items(phone, product_id, product_name, unit_price, quantity)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(phone, product_id) DO UPDATE SET
           quantity = wa_cart_items.quantity + excluded.quantity,
           updated_at = datetime('now')`,
      )
      .run(phone, productId, productName, unitPrice, quantity);
  }

  list(phone: string): CartItem[] {
    return this.db
      .prepare(`SELECT * FROM wa_cart_items WHERE phone = ? ORDER BY id ASC`)
      .all(phone) as CartItem[];
  }

  removeByIndex(phone: string, index: number): boolean {
    const items = this.list(phone);
    const item = items[index - 1];
    if (!item) {
      return false;
    }

    this.db.prepare(`DELETE FROM wa_cart_items WHERE id = ?`).run(item.id);
    return true;
  }

  clear(phone: string): void {
    this.db.prepare(`DELETE FROM wa_cart_items WHERE phone = ?`).run(phone);
  }
}
