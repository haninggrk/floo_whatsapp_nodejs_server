import type Database from 'better-sqlite3';

export class EventRepository {
  constructor(private readonly db: Database.Database) {}

  has(eventId: string): boolean {
    const row = this.db
      .prepare(`SELECT event_id FROM wa_processed_events WHERE event_id = ?`)
      .get(eventId);
    return Boolean(row);
  }

  create(eventId: string, eventType: string, payload: unknown): void {
    this.db
      .prepare(
        `INSERT INTO wa_processed_events(event_id, event_type, payload) VALUES (?, ?, ?)`,
      )
      .run(eventId, eventType, JSON.stringify(payload));
  }
}
