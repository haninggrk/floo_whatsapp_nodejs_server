import { z } from 'zod';

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
  SQLITE_PATH: z.string().default('./data/wa-customer-bot.db'),

  ODOO_URL: z.string().url(),
  ODOO_DB: z.string().min(1),
  ODOO_LOGIN: z.string().optional(),
  ODOO_PASSWORD: z.string().min(1),
  ODOO_UID: z.string().optional(),

  EVOLUTION_API_URL: z.string().url(),
  EVOLUTION_API_KEY: z.string().min(1),
  EVOLUTION_INSTANCE: z.string().min(1),

  BASE_URL: z.string().url(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): AppConfig {
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  return parsed.data;
}
