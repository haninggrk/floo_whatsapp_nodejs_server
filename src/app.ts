import 'dotenv/config';
import Fastify from 'fastify';
import { loadConfig } from './config/index.js';
import { initLogger, getLogger } from './modules/logging/logger.js';
import { initDatabase } from './database/index.js';
import { SessionRepository } from './modules/session/session-repository.js';
import { CartRepository } from './modules/session/cart-repository.js';
import { EventRepository } from './modules/session/event-repository.js';
import { OdooClient } from './modules/odoo/client.js';
import { EvolutionClient } from './modules/evolution/client.js';
import { ConversationEngine } from './modules/conversation/engine.js';
import { webhookRoutes } from './routes/webhook.js';
import { odooWebhookRoutes } from './routes/odoo-webhook.js';
import { healthRoutes } from './routes/health.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  initLogger(config.LOG_LEVEL);
  const logger = getLogger();

  const db = initDatabase(config.SQLITE_PATH);
  const sessions = new SessionRepository(db);
  const carts = new CartRepository(db);
  const events = new EventRepository(db);

  const odoo = new OdooClient(config);
  const evolution = new EvolutionClient(config);
  const engine = new ConversationEngine({ sessions, carts, odoo, evolution });

  const app = Fastify({ logger: false, trustProxy: true });

  await app.register(healthRoutes);
  await app.register(webhookRoutes, { engine });
  await app.register(odooWebhookRoutes, { evolution, events, sessions, carts });

  app.setErrorHandler((error, request, reply) => {
    logger.error({ err: error, url: request.url }, 'Unhandled request error');
    reply.status(500).send({ error: 'internal_server_error' });
  });

  const address = await app.listen({ port: config.PORT, host: config.HOST });
  logger.info({ address }, 'WhatsApp customer bot server started');
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
