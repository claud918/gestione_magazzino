import { Hono } from 'hono';
import { HealthResponse } from '@magazzino/shared';
import type { AppVariables } from './auth/middleware';
import { authRoutes } from './routes/auth';
import { crudRoutes } from './routes/crud';
import { disponibilitaRoutes } from './routes/disponibilita';
import { backupRoutes, esportaSnapshotDatabase } from './routes/backup';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Bucket R2 opzionale per il salvataggio automatico dei backup notturni */
  BACKUP_BUCKET?: R2Bucket;
}

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>().basePath('/api');

app.get('/health', async (c) => {
  const row = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
  const body: HealthResponse = HealthResponse.parse({ status: 'ok', db: row?.ok === 1 });
  return c.json(body);
});

app.route('/auth', authRoutes);
app.route('/crud', crudRoutes);
app.route('/disponibilita', disponibilitaRoutes);
app.route('/backup', backupRoutes);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal error' }, 500);
});

export default {
  fetch: app.fetch,
  /**
   * Cron Trigger notturno (configurato in wrangler.jsonc):
   * esporta uno snapshot completo del database D1 su Cloudflare R2 (se BACKUP_BUCKET è collegato)
   * e rimuove i backup più vecchi di 30 giorni.
   */
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (!env.BACKUP_BUCKET) {
      console.log('BACKUP_BUCKET R2 non configurato: backup automatico ignorato.');
      return;
    }

    const snapshot = await esportaSnapshotDatabase(env.DB);
    const dateStr = snapshot.esportatoIl.slice(0, 10);
    const key = `backups/backup-${dateStr}.json`;

    await env.BACKUP_BUCKET.put(key, JSON.stringify(snapshot, null, 2), {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });

    // Rotazione: conserva gli ultimi 30 giorni
    const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const list = await env.BACKUP_BUCKET.list({ prefix: 'backups/' });
    for (const obj of list.objects) {
      if (obj.uploaded.getTime() < cutoffMs) {
        await env.BACKUP_BUCKET.delete(obj.key);
      }
    }
  },
};
