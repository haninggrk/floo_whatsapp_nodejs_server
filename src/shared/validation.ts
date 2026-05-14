export function parseSelection(input: string, max: number): number | null {
  const parsed = Number.parseInt(input.trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    return null;
  }
  return parsed;
}

export function parsePositiveNumber(input: string): number | null {
  const parsed = Number.parseFloat(input.trim());
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function isStartCommand(input: string): boolean {
  return ['hi', 'halo', 'mulai', 'start', 'order', 'pesan'].includes(input.trim().toLowerCase());
}
