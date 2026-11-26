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

  const whereParts: string[] = ['r.prodotto_qta > 0', "r.tipologia = 'Nuova produzione'"];
  const params: unknown[] = [];

  if (campagna) {
    whereParts.push('r.campagna = ?');
    params.push(campagna);
  }
  if (prodotto) {
    whereParts.push('r.prodotto = ?');
    params.push(prodotto);
  }
  if (varieta) {
    whereParts.push('r.codice_varieta = ?');
    params.push(varieta);
  }

  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  const sql = `
    SELECT
      r.campagna,
      r.prodotto,
      r.codice_varieta,
      r.codice_clone,
      r.codice_portainnesto,
      r.tipologia,
      r.innestato,
      r.prodotto_qta,
      r.resa,
      COALESCE(s.seconde_qta, 0) AS seconde_qta,
      CASE
        WHEN COALESCE(r.innestato, 0) > 0
          THEN ROUND((CAST(COALESCE(s.seconde_qta, 0) AS REAL) / r.innestato) * 100, 2)
        ELSE 0.0
      END AS seconde_resa
    FROM rese r
    LEFT JOIN (
      SELECT
        campagna,
        prodotto,
        codice_varieta,
        codice_clone,
        codice_portainnesto,
        SUM(quantita) AS seconde_qta
      FROM lotti_magazzino
      WHERE tipologia = 'Seconde'
      GROUP BY campagna, prodotto, codice_varieta, codice_clone, codice_portainnesto
    ) s
      ON s.campagna = r.campagna
     AND s.prodotto = r.prodotto
     AND s.codice_varieta = r.codice_varieta
     AND s.codice_clone = r.codice_clone
     AND s.codice_portainnesto = r.codice_portainnesto
    ${whereClause}
    ORDER BY r.codice_varieta ASC, r.codice_clone ASC, r.codice_portainnesto ASC, r.campagna DESC, r.prodotto ASC
  `;

  const res = await c.env.DB.prepare(sql)
    .bind(...params)
    .all<RigaResa>();

  return c.json({ rese: res.results ?? [] });
});

