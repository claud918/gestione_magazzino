import { Hono } from 'hono';
import type { RigaResa } from '@magazzino/shared';
import type { Env } from '../index';
import { type AppVariables, requireAuth } from '../auth/middleware';

export const reseRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

reseRoutes.use('*', requireAuth);

/**
 * GET /api/rese
 * Restituisce i dati aggregati dalla vista `rese` (raffronto innestato vs prodotto).
 * Filtri opzionali:
 * - campagna: string
 * - prodotto: string
 * - codice_varieta: string
 */
reseRoutes.get('/', async (c) => {
  const campagna = c.req.query('campagna');
  const prodotto = c.req.query('prodotto');
  const varieta = c.req.query('codice_varieta');

  const whereParts: string[] = ['prodotto_qta > 0'];
  const params: unknown[] = [];

  if (campagna) {
    whereParts.push('campagna = ?');
    params.push(campagna);
  }
  if (prodotto) {
    whereParts.push('prodotto = ?');
    params.push(prodotto);
  }
  if (varieta) {
    whereParts.push('codice_varieta = ?');
    params.push(varieta);
  }

  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  const sql = `
    SELECT
      campagna,
      prodotto,
      codice_varieta,
      codice_clone,
      codice_portainnesto,
      tipologia,
      innestato,
      prodotto_qta,
      resa
    FROM rese
    ${whereClause}
    ORDER BY campagna DESC, prodotto ASC, codice_varieta ASC, codice_clone ASC, codice_portainnesto ASC
  `;

  const res = await c.env.DB.prepare(sql)
    .bind(...params)
    .all<RigaResa>();

  return c.json({ rese: res.results ?? [] });
});

