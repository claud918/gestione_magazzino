import { Hono } from 'hono';
import { NOMI_TABELLE, type NomeTabella } from '@magazzino/shared';
import type { Env } from '../index';
import { type AppVariables, requireAdmin, requireAuth } from '../auth/middleware';

export const backupRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

backupRoutes.use('*', requireAuth, requireAdmin);

export async function esportaSnapshotDatabase(d1: D1Database) {
  const dati: Record<string, unknown[]> = {};

  for (const tab of NOMI_TABELLE) {
    const res = await d1.prepare(`SELECT * FROM "${tab}"`).all();
    dati[tab] = res.results ?? [];
  }

  const dispRes = await d1.prepare('SELECT * FROM disponibilita').all();

  return {
    applicazione: 'Gestione Costi, Ordini e Magazzino',
    esportatoIl: new Date().toISOString(),
    dati,
    vistaDisponibilita: dispRes.results ?? [],
  };
}

backupRoutes.get('/download', async (c) => {
  const snapshot = await esportaSnapshotDatabase(c.env.DB);
  const dateStr = snapshot.esportatoIl.slice(0, 10);
  const filename = `backup-magazzino-${dateStr}.json`;

  return new Response(JSON.stringify(snapshot, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});
