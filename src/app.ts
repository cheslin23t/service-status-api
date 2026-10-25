import Fastify from 'fastify';
import type { AppConfig } from './types.js';
import { StatusStore } from './status.js';

export function buildApp(config: AppConfig, suppliedStore?: StatusStore) {
  const app = Fastify({ logger: true, trustProxy: true });
  const store = suppliedStore ?? new StatusStore(config, (message) => app.log.warn(message));

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('X-Content-Type-Options', 'nosniff');
    if (request.url === '/v1/services') reply.header('Cache-Control', store.get().stale ? 'no-store' : 'public, max-age=5');
    return payload;
  });

  app.get('/healthz', async () => ({ ok: true }));
  app.get('/v1/services', async () => store.get());

  let timer: NodeJS.Timeout | undefined;
  app.addHook('onReady', async () => {
    await store.refresh();
    timer = setInterval(() => void store.refresh(), config.pollIntervalMs);
    timer.unref();
  });
  app.addHook('onClose', async () => {
    if (timer) clearInterval(timer);
  });
  return app;
}
