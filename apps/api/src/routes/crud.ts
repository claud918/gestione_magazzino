import { Hono } from 'hono';
import {
  TABELLE,
  isNomeTabella,
  calcolaCampiDerivati,
  validaRiga,
  CONFLITTO_TABELLA,
  type NomeTabella,
  type RigaTabella,
} from '@magazzino/shared';
import type { Env } from '../index';
import { type AppVariables, requireAdmin, requireAuth } from '../auth/middleware';

export const crudRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

crudRoutes.use('*', requireAuth);

/**
 * GET /api/crud/:tabella
 * Ritorna le righe della tabella ordinate secondo la definizione.
 */
crudRoutes.get('/:tabella', async (c) => {
  const tabellaParam = c.req.param('tabella');
  if (!isNomeTabella(tabellaParam)) {
    return c.json({ error: 'Tabella non trovata' }, 404);
  }

  const def = TABELLE[tabellaParam];
  const orderClauses = def.ordinamento
    .map((o) => `"${o.campo}" ${o.discendente ? 'DESC' : 'ASC'}`)
    .join(', ');
  const sql = `SELECT * FROM "${def.nome}" ${orderClauses ? `ORDER BY ${orderClauses}` : ''}`;

  const res = await c.env.DB.prepare(sql).all<RigaTabella>();
  return c.json({ righe: res.results ?? [] });
});

/**
 * GET /api/crud/:tabella/opzioni
 * Ritorna un dizionario di liste opzioni per i riferimenti FK della tabella
 */
crudRoutes.get('/:tabella/opzioni', async (c) => {
  const tabellaParam = c.req.param('tabella');
  if (!isNomeTabella(tabellaParam)) {
    return c.json({ error: 'Tabella non trovata' }, 404);
  }

  const def = TABELLE[tabellaParam];
  const opzioni: Record<string, unknown[]> = {};

  for (const campo of def.campi) {
    if (campo.riferimento) {
      const refTab = campo.riferimento.tabella;
      const refDef = TABELLE[refTab];
      const order = refDef.ordinamento
        .map((o) => `"${o.campo}" ${o.discendente ? 'DESC' : 'ASC'}`)
        .join(', ');
      const sql = `SELECT * FROM "${refTab}" ${order ? `ORDER BY ${order}` : ''}`;
      const res = await c.env.DB.prepare(sql).all();
      opzioni[campo.nome] = res.results ?? [];
    }
  }

  return c.json({ opzioni });
});

/**
 * POST /api/crud/:tabella
 * Inserimento nuova riga (solo admin).
 */
crudRoutes.post('/:tabella', requireAdmin, async (c) => {
  const tabellaParam = c.req.param('tabella');
  if (!isNomeTabella(tabellaParam)) {
    return c.json({ error: 'Tabella non trovata' }, 404);
  }

  const def = TABELLE[tabellaParam];
  const body = await c.req.json().catch(() => ({}));

  const { valori, errori } = validaRiga(def, body);
  if (errori.length > 0) {
    return c.json({ error: 'Dati non validi', errori }, 400);
  }

  // Aggiungi ID uuid per tabelle con id automatico
  if (def.chiave.length === 1 && def.chiave[0] === 'id') {
    valori['id'] = crypto.randomUUID();
  }

  // Calcola campi derivati prima di inserire
  const rigaCompleta = calcolaCampiDerivati(def.nome, valori);

  const colonne = Object.keys(rigaCompleta);
  const placeholders = colonne.map(() => '?').join(', ');
  const sql = `INSERT INTO "${def.nome}" (${colonne.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders}) RETURNING *`;
  const params = colonne.map((k) => rigaCompleta[k]);

  try {
    const inserted = await c.env.DB.prepare(sql)
      .bind(...params)
      .first<RigaTabella>();
    return c.json({ riga: inserted }, 201);
  } catch (err: any) {
    console.error('Errore inserimento:', err);
    return c.json({ error: err.message || 'Errore durante il salvataggio' }, 400);
  }
});

/**
 * PUT /api/crud/:tabella
 * Modifica riga esistente (solo admin).
 * Identificata via query param con i campi della chiave primaria.
 */
crudRoutes.put('/:tabella', requireAdmin, async (c) => {
  const tabellaParam = c.req.param('tabella');
  if (!isNomeTabella(tabellaParam)) {
    return c.json({ error: 'Tabella non trovata' }, 404);
  }

  const def = TABELLE[tabellaParam];
  const body = await c.req.json().catch(() => ({}));

  // Estrai chiave primaria
  const whereParts: string[] = [];
  const whereParams: unknown[] = [];
  for (const k of def.chiave) {
    const v = c.req.query(k) ?? body[k];
    if (v === undefined || v === null || v === '') {
      return c.json({ error: `Chiave primaria mancante: ${k}` }, 400);
    }
    whereParts.push(`"${k}" = ?`);
    whereParams.push(v);
  }

  const { valori, errori } = validaRiga(def, body);
  if (errori.length > 0) {
    return c.json({ error: 'Dati non validi', errori }, 400);
  }

  const rigaCompleta = calcolaCampiDerivati(def.nome, valori);

  const setCols = Object.keys(rigaCompleta).filter((col) => {
    // Permetti la modifica della chiave primaria per tabelle come anagrafica_personale (soprannome)
    if (def.nome === 'anagrafica_personale' && col === 'soprannome') return true;
    return !def.chiave.includes(col);
  });
  if (setCols.length === 0) {
    return c.json({ error: 'Nessun campo modificabile fornito' }, 400);
  }

  const setClauses = setCols.map((c) => `"${c}" = ?`).join(', ');
  const sql = `UPDATE "${def.nome}" SET ${setClauses} WHERE ${whereParts.join(' AND ')} RETURNING *`;
  const params = [...setCols.map((k) => rigaCompleta[k]), ...whereParams];

  try {
    const updated = await c.env.DB.prepare(sql)
      .bind(...params)
      .first<RigaTabella>();
    if (!updated) {
      return c.json({ error: 'Riga non trovata' }, 404);
    }
    return c.json({ riga: updated });
  } catch (err: any) {
    console.error('Errore modifica:', err);
    return c.json({ error: err.message || 'Errore durante la modifica' }, 400);
  }
});

/**
 * DELETE /api/crud/:tabella
 * Eliminazione riga (solo admin).
 */
crudRoutes.delete('/:tabella', requireAdmin, async (c) => {
  const tabellaParam = c.req.param('tabella');
  if (!isNomeTabella(tabellaParam)) {
    return c.json({ error: 'Tabella non trovata' }, 404);
  }

  const def = TABELLE[tabellaParam];
  const whereParts: string[] = [];
  const whereParams: unknown[] = [];
  for (const k of def.chiave) {
    const v = c.req.query(k);
    if (!v) {
      return c.json({ error: `Chiave primaria mancante nei parametri query: ${k}` }, 400);
    }
    whereParts.push(`"${k}" = ?`);
    whereParams.push(v);
  }

  const sql = `DELETE FROM "${def.nome}" WHERE ${whereParts.join(' AND ')}`;
  try {
    const res = await c.env.DB.prepare(sql).bind(...whereParams).run();
    if ((res.meta.changes ?? 0) === 0) {
      return c.json({ error: 'Riga non trovata' }, 404);
    }
    return c.json({ ok: true });
  } catch (err: any) {
    console.error('Errore eliminazione:', err);
    return c.json(
      {
        error:
          'Impossibile eliminare: il record è utilizzato da altre tabelle collegate (vincolo di integrità)',
        details: err.message,
      },
      400,
    );
  }
});

/**
 * POST /api/crud/:tabella/import
 * Importazione massiva da CSV (solo admin).
 */
crudRoutes.post('/:tabella/import', requireAdmin, async (c) => {
  const tabellaParam = c.req.param('tabella');
  if (!isNomeTabella(tabellaParam)) {
    return c.json({ error: 'Tabella non trovata' }, 404);
  }

  const def = TABELLE[tabellaParam];
  const body = await c.req.json().catch(() => ({}));
  const rawRighe = Array.isArray(body.righe) ? body.righe : [];
  const modalita: 'upsert' | 'ignora' | 'errore' =
    body.modalita === 'ignora' || body.modalita === 'errore' ? body.modalita : 'upsert';

  if (rawRighe.length === 0) {
    return c.json({ error: "Nessuna riga fornita per l'importazione" }, 400);
  }

  // Validazione di tutte le righe prima dell'inserimento
  const righeValide: RigaTabella[] = [];
  const erroriValidazione: { riga: number; messaggio: string }[] = [];

  for (let i = 0; i < rawRighe.length; i++) {
    const raw = rawRighe[i];
    const { valori, errori } = validaRiga(def, raw);
    if (errori.length > 0) {
      erroriValidazione.push({
        riga: i + 1,
        messaggio: errori.map((e) => e.messaggio).join('; '),
      });
      continue;
    }

    if (def.chiave.length === 1 && def.chiave[0] === 'id' && !valori['id']) {
      valori['id'] = crypto.randomUUID();
    }

    const rigaCompleta = calcolaCampiDerivati(def.nome, valori);
    righeValide.push(rigaCompleta);
  }

  if (erroriValidazione.length > 0) {
    return c.json(
      {
        error: `Rilevati errori in ${erroriValidazione.length} righe su ${rawRighe.length}`,
        dettagli: erroriValidazione.slice(0, 20),
      },
      400,
    );
  }

  // Individua il bersaglio di conflitto per ON CONFLICT
  const conflictCols = CONFLITTO_TABELLA[def.nome] ?? (def.chiave[0] !== 'id' ? def.chiave : null);

  const statements: ReturnType<typeof c.env.DB.prepare>[] = [];

  for (const riga of righeValide) {
    const colonne = Object.keys(riga);
    const placeholders = colonne.map(() => '?').join(', ');
    const params = colonne.map((k) => riga[k]);

    let sql = `INSERT INTO "${def.nome}" (${colonne.map((col) => `"${col}"`).join(', ')}) VALUES (${placeholders})`;

    if (conflictCols && conflictCols.length > 0) {
      const conflictSql = conflictCols.map((col) => `"${col}"`).join(', ');

      if (modalita === 'ignora') {
        sql += ` ON CONFLICT (${conflictSql}) DO NOTHING`;
      } else if (modalita === 'upsert') {
        const updateCols = colonne.filter((col) => !conflictCols.includes(col) && col !== 'id');
        if (updateCols.length > 0) {
          const updateClauses = updateCols.map((col) => `"${col}" = excluded."${col}"`).join(', ');
          sql += ` ON CONFLICT (${conflictSql}) DO UPDATE SET ${updateClauses}`;
        } else {
          sql += ` ON CONFLICT (${conflictSql}) DO NOTHING`;
        }
      }
    }

    statements.push(c.env.DB.prepare(sql).bind(...params));
  }

  // Esecuzione a blocchi (max 100 query per batch in Cloudflare D1)
  const CHUNK_SIZE = 100;
  let totaleModifiche = 0;

  try {
    for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
      const chunk = statements.slice(i, i + CHUNK_SIZE);
      const results = await c.env.DB.batch(chunk);
      for (const res of results) {
        totaleModifiche += res.meta?.changes ?? 0;
      }
    }

    return c.json({
      successo: true,
      totale: righeValide.length,
      modifiche: totaleModifiche,
      messaggio: `Importazione completata con successo: ${righeValide.length} record elaborati.`,
    });
  } catch (err: any) {
    console.error('Errore batch import:', err);
    let msg = err.message || "Errore durante l'importazione";
    if (msg.includes('FOREIGN KEY constraint failed')) {
      msg =
        'Errore di integrità: uno o più valori referenziati (es. Varietà, Clone, Portainnesto, Prodotto, Cliente) non esistono nel database. Popola prima le rispettive anagrafiche.';
    } else if (msg.includes('UNIQUE constraint failed')) {
      msg =
        'Errore di duplicato: uno o più record sono già presenti nel database. Seleziona la modalità "Aggiorna se già presente (Upsert)" o "Ignora duplicati".';
    }
    return c.json({ error: msg }, 400);
  }
});

