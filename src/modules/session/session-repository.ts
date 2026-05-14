import type Database from 'better-sqlite3';

export const STATES = [
  'IDLE',
  'WAITING_NAME',
  'WAITING_ADDRESS_CHOICE',
  'WAITING_ADDRESS_NEW',
  'BROWSING_PRODUCTS',
  'WAITING_QUANTITY',
  'PAYMENT_PENDING',
] as const;

export type ConversationState = (typeof STATES)[number];

export interface Session {
  phone: string;
  state: ConversationState;
  partner_id: number | null;
  partner_name: string | null;
  context_data: Record<string, unknown>;
}

interface RawSession {
  phone: string;
  state: string;
  partner_id: number | null;
  partner_name: string | null;
  context_data: string;
}

function parse(raw: RawSession): Session {
  return {
    phone: raw.phone,
    state: raw.state as ConversationState,
    partner_id: raw.partner_id,
    partner_name: raw.partner_name,
    context_data: raw.context_data ? JSON.parse(raw.context_data) : {},
  };
}

export class SessionRepository {
  constructor(private readonly db: Database.Database) {}

  loadOrCreate(phone: string): Session {
    this.db
      .prepare(
        `INSERT INTO wa_sessions(phone, state) VALUES (?, 'IDLE') ON CONFLICT(phone) DO NOTHING`,
      )
      .run(phone);

    const row = this.db.prepare(`SELECT * FROM wa_sessions WHERE phone = ?`).get(phone) as RawSession;
    return parse(row);
  }

  update(
    phone: string,
    state: ConversationState,
    updates: {
      partnerId?: number | null;
      partnerName?: string | null;
      contextData?: Record<string, unknown>;
    },
  ): void {
    const current = this.loadOrCreate(phone);
    this.db
      .prepare(
        `UPDATE wa_sessions
         SET state = ?,
             partner_id = ?,
             partner_name = ?,
             context_data = ?,
             updated_at = datetime('now')
         WHERE phone = ?`,
      )
      .run(
        state,
        updates.partnerId !== undefined ? updates.partnerId : current.partner_id,
        updates.partnerName !== undefined ? updates.partnerName : current.partner_name,
        JSON.stringify(updates.contextData !== undefined ? updates.contextData : current.context_data),
        phone,
      );
  }

  reset(phone: string): void {
    this.db
      .prepare(
        `UPDATE wa_sessions
         SET state = 'IDLE',
             partner_id = NULL,
             partner_name = NULL,
             context_data = '{}',
             updated_at = datetime('now')
         WHERE phone = ?`,
      )
      .run(phone);
  }
}
