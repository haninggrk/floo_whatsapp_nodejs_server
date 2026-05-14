import pino, { type Logger } from 'pino';

let logger: Logger | null = null;

export function initLogger(level: string): Logger {
  logger = pino({ level });
  return logger;
}

export function getLogger(): Logger {
  if (!logger) {
    throw new Error('Logger not initialized');
  }
  return logger;
}
