import type { AppConfig } from '../../config/index.js';
import { toEvolutionNumber } from '../../shared/phone.js';

export class EvolutionClient {
  constructor(private readonly config: AppConfig) {}

  async getConnectionState(): Promise<{ state: string; response: unknown }> {
    const url = `${this.config.EVOLUTION_API_URL}/instance/connectionState/${this.config.EVOLUTION_INSTANCE}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: this.config.EVOLUTION_API_KEY,
      },
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Failed to get Evolution connection state: ${response.status} ${raw}`);
    }

    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = raw;
    }

    const state =
      typeof parsed === 'object' && parsed !== null
        ? String((parsed as { instance?: { state?: string } }).instance?.state || '')
        : '';

    return { state, response: parsed };
  }

  async sendText(phone: string, text: string): Promise<void> {
    const number = toEvolutionNumber(phone);
    const url = `${this.config.EVOLUTION_API_URL}/message/sendText/${this.config.EVOLUTION_INSTANCE}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.config.EVOLUTION_API_KEY,
      },
      body: JSON.stringify({ number, options: { delay: 500 }, text }),
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Failed to send WhatsApp message: ${response.status} ${raw}`);
    }
  }

  async sendDocument(phone: string, fileUrl: string, fileName: string, caption: string): Promise<void> {
    const number = toEvolutionNumber(phone);
    const url = `${this.config.EVOLUTION_API_URL}/message/sendMedia/${this.config.EVOLUTION_INSTANCE}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.config.EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number,
        mediaMessage: {
          mediatype: 'document',
          media: fileUrl,
          fileName,
          caption,
        },
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Failed to send WhatsApp document: ${response.status} ${raw}`);
    }
  }
}
