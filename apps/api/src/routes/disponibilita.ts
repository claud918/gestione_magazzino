import { Hono } from 'hono';
import type { RigaDisponibilita } from '@magazzino/shared';
import type { Env } from '../index';
import { type AppVariables, requireAuth } from '../auth/middleware';

export const disponibilitaRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

disponibilitaRoutes.use('*', requireAuth);

/**
 * GET /api/disponibilita
 * Restituisce i dati aggregati dalla vista `disponibilita`.
 * Filtri opzionali:
 * - campagna: string
 * - prodotto: string
 * - codice_varieta: string
 * - soloDisponibili: boolean
 * - soloScoperti: boolean
 */
disponibilitaRoutes.get('/', async (c) => {
  const campagna = c.req.query('campagna');
  const prodotto = c.req.query('prodotto');
  const varieta = c.req.query('codice_varieta');
  const soloDisponibili = c.req.query('soloDisponibili') === 'true';
  const soloScoperti = c.req.query('soloScoperti') === 'true';

  const whereParts: string[] = [];
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
  if (soloDisponibili) {
    whereParts.push('disponibile > 0');
  }
  if (soloScoperti) {
    whereParts.push('scoperto > 0');
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
      prodotto_qta,
      ordinato,
      consegnato,
      disponibile,
      giacenza_fisica,
      scoperto
    FROM disponibilita
    ${whereClause}
    ORDER BY campagna DESC, prodotto ASC, codice_varieta ASC, codice_clone ASC, codice_portainnesto ASC
  `;

  const res = await c.env.DB.prepare(sql)
    .bind(...params)
    .all<RigaDisponibilita>();

  return c.json({ disponibilita: res.results ?? [] });
});
