export function normalizePhone(raw: string): string {
  const cleaned = raw
    .replace('@s.whatsapp.net', '')
    .replace('@c.us', '')
    .replace(/\D/g, '');

  if (!cleaned) return '';

  let normalized = cleaned;
  if (normalized.startsWith('0')) {
    normalized = `62${normalized.slice(1)}`;
  }

  if (!normalized.startsWith('62')) {
    normalized = `62${normalized}`;
  }

  return `+${normalized}`;
}

export function toEvolutionNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}
