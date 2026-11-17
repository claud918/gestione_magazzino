import { Hono } from 'hono';
import type {
  FatturaRigaItem,
  FatturaDettaglio,
  FatturaSommario,
  ProssimoNumeroFatturaResponse,
  SalvaFatturaPayload,
} from '@magazzino/shared';
import { ALIQUOTA_IVA_PREDEFINITA, MODALITA_PAGAMENTO_PREDEFINITA } from '@magazzino/shared';
import type { Env } from '../index';
import { type AppVariables, requireAdmin, requireAuth } from '../auth/middleware';

export const fattureRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

fattureRoutes.use('*', requireAuth);

/**
 * GET /api/fatture/prossimo-numero
 * Calcola il prossimo progressivo disponibile sul database per l'anno specificato.
 */
fattureRoutes.get('/prossimo-numero', async (c) => {
  const annoQuery = c.req.query('anno');
  const anno = annoQuery ? parseInt(annoQuery, 10) : new Date().getFullYear();
  const annoValido = Number.isFinite(anno) && anno > 2000 ? anno : new Date().getFullYear();

  const row = await c.env.DB.prepare(
    'SELECT MAX(progressivo) AS maxProg FROM fatture WHERE anno = ?',
  )
    .bind(annoValido)
    .first<{ maxProg: number | null }>();

  const maxProg = row?.maxProg ?? 0;
  const progressivo = Number(maxProg) + 1;
  const numeroFattura = `${progressivo}/${annoValido}`;

  const res: ProssimoNumeroFatturaResponse = {
    anno: annoValido,
    progressivo,
    numeroFattura,
  };
  return c.json(res);
});

/**
 * GET /api/fatture
 * Elenco sommario di tutte le fatture salvate con totali e conteggio righe.
 */
fattureRoutes.get('/', async (c) => {
  const annoQuery = c.req.query('anno');
  const clienteQuery = c.req.query('cliente');

  const whereParts: string[] = [];
  const params: unknown[] = [];

  if (annoQuery) {
    const anno = parseInt(annoQuery, 10);
    if (Number.isFinite(anno)) {
      whereParts.push('f.anno = ?');
      params.push(anno);
    }
  }

  if (clienteQuery) {
    whereParts.push('f.cliente = ?');
    params.push(clienteQuery.trim());
  }

  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

  const sql = `
    SELECT
      f.id,
      f.numero_fattura AS numeroFattura,
      f.anno,
      f.progressivo,
      f.data_fattura AS dataFattura,
      f.cliente,
      f.partita_iva AS partitaIva,
      f.codice_fiscale AS codiceFiscale,
      f.cessionario_indirizzo AS cessionarioIndirizzo,
      f.modalita_pagamento AS modalitaPagamento,
      f.aliquota_iva AS aliquotaIva,
      f.totale_merce AS totaleMerce,
      f.totale_iva AS totaleIva,
      f.totale_fattura AS totaleFattura,
      f.note,
      f.corpo_libero AS corpoLibero,
      f.created_at AS createdAt,
      COALESCE(SUM(r.quantita), 0) AS totaleQuantita,
      COUNT(r.id) AS numeroRighe
    FROM fatture f
    LEFT JOIN fatture_righe r ON r.fattura_id = f.id
    ${whereClause}
    GROUP BY f.id
    ORDER BY f.anno DESC, f.progressivo DESC, f.created_at DESC
  `;

  const query = c.env.DB.prepare(sql);
  const result = await (params.length > 0 ? query.bind(...params) : query).all<FatturaSommario>();

  return c.json({ fatture: result.results ?? [] });
});

/**
 * GET /api/fatture/:id
 * Dettaglio completo di una fattura con tutte le sue righe merci e prezzi.
 */
fattureRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  const headerSql = `
    SELECT
      id,
      numero_fattura AS numeroFattura,
      anno,
      progressivo,
      data_fattura AS dataFattura,
      cliente,
      partita_iva AS partitaIva,
      codice_fiscale AS codiceFiscale,
      cessionario_indirizzo AS cessionarioIndirizzo,
      modalita_pagamento AS modalitaPagamento,
      aliquota_iva AS aliquotaIva,
      totale_merce AS totaleMerce,
      totale_iva AS totaleIva,
      totale_fattura AS totaleFattura,
      note,
      corpo_libero AS corpoLibero,
      created_at AS createdAt
    FROM fatture
    WHERE id = ?
  `;

  const header = await c.env.DB.prepare(headerSql).bind(id).first<Omit<FatturaSommario, 'totaleQuantita' | 'numeroRighe'>>();
  if (!header) {
    return c.json({ error: 'Fattura non trovata' }, 404);
  }

  const righeSql = `
    SELECT
      id,
      fattura_id AS fatturaId,
      ordine_id AS ordineId,
      prodotto,
      codice_varieta AS codiceVarieta,
      codice_clone AS codiceClone,
      codice_portainnesto AS codicePortainnesto,
      quantita,
      prezzo_unitario AS prezzoUnitario,
      COALESCE(aliquota_iva, 10) AS aliquotaIva,
      importo
    FROM fatture_righe
    WHERE fattura_id = ?
    ORDER BY rowid ASC
  `;

  const righeRes = await c.env.DB.prepare(righeSql).bind(id).all<FatturaRigaItem>();
  const righe = righeRes.results ?? [];
  const totaleQuantita = righe.reduce((acc, r) => acc + (Number(r.quantita) || 0), 0);

  const dettaglio: FatturaDettaglio = {
    ...header,
    righe,
    totaleQuantita,
    numeroRighe: righe.length,
  };

  return c.json({ fattura: dettaglio });
});

/**
 * POST /api/fatture
 * Salva una nuova fattura e le relative righe con prezzi e totali (solo admin).
 */
fattureRoutes.post('/', requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) as SalvaFatturaPayload | null;
  if (!body) {
    return c.json({ error: 'Payload non valido' }, 400);
  }

  const {
    dataFattura,
    cliente,
    partitaIva = '',
    codiceFiscale = '',
    cessionarioIndirizzo = '',
    modalitaPagamento = MODALITA_PAGAMENTO_PREDEFINITA,
    aliquotaIva = ALIQUOTA_IVA_PREDEFINITA,
    note = '',
    corpoLibero = '',
    righe = [],
  } = body;

  if (!dataFattura || !/^\d{4}-\d{2}-\d{2}$/.test(dataFattura)) {
    return c.json({ error: 'Data fattura non valida (formato YYYY-MM-DD)' }, 400);
  }
  if (!cliente || !cliente.trim()) {
    return c.json({ error: 'Cliente obbligatorio' }, 400);
  }
  const corpoLiberoTrim = (corpoLibero || '').trim();
  const hasRighe = Array.isArray(righe) && righe.length > 0;
  if (!corpoLiberoTrim && !hasRighe) {
    return c.json({ error: 'La fattura deve contenere una descrizione dei beni o almeno una riga merce' }, 400);
  }

  const annoData = parseInt(dataFattura.slice(0, 4), 10) || new Date().getFullYear();

  // Determinazione numero fattura, anno e progressivo
  let numeroFattura = (body.numeroFattura || '').trim();
  let anno = annoData;
  let progressivo = 0;

  const matchSlash = numeroFattura.match(/^(\d+)\/(\d{4})$/);
  const matchSoloNum = numeroFattura.match(/^(\d+)$/);

  if (matchSlash) {
    progressivo = parseInt(matchSlash[1], 10);
    anno = parseInt(matchSlash[2], 10);
  } else if (matchSoloNum) {
    progressivo = parseInt(matchSoloNum[1], 10);
    anno = annoData;
    numeroFattura = `${progressivo}/${anno}`;
  } else if (!numeroFattura) {
    const row = await c.env.DB.prepare(
      'SELECT MAX(progressivo) AS maxProg FROM fatture WHERE anno = ?',
    )
      .bind(anno)
      .first<{ maxProg: number | null }>();
    progressivo = (row?.maxProg ?? 0) + 1;
    numeroFattura = `${progressivo}/${anno}`;
  } else {
    const row = await c.env.DB.prepare(
      'SELECT MAX(progressivo) AS maxProg FROM fatture WHERE anno = ?',
    )
      .bind(anno)
      .first<{ maxProg: number | null }>();
    progressivo = (row?.maxProg ?? 0) + 1;
  }

  // Verifica unicità numeroFattura
  const esiste = await c.env.DB.prepare('SELECT id FROM fatture WHERE numero_fattura = ?')
    .bind(numeroFattura)
    .first();
  if (esiste) {
    return c.json({ error: `Il numero fattura ${numeroFattura} è già presente nell'archivio.` }, 409);
  }

  const fatturaId = crypto.randomUUID();

  // Calcolo o recupero totali
  let totaleMerce = 0;
  let totaleIvaCalcolato = 0;
  const righeSalvate: FatturaRigaItem[] = [];

  for (const r of righe) {
    const rigaId = crypto.randomUUID();
    const quantita = Math.max(0, parseInt(String(r.quantita), 10) || 0);
    const prezzoUnitario = Math.max(0, Number(r.prezzoUnitario) || 0);
    const importo = Math.round(quantita * prezzoUnitario * 100) / 100;
    const rigaAliquota = Number.isFinite(Number(r.aliquotaIva)) ? Number(r.aliquotaIva) : 10;
    const rigaIva = Math.round(importo * (rigaAliquota / 100) * 100) / 100;

    totaleMerce += importo;
    totaleIvaCalcolato += rigaIva;

    righeSalvate.push({
      id: rigaId,
      fatturaId,
      ordineId: r.ordineId || null,
      prodotto: String(r.prodotto || '').trim(),
      codiceVarieta: String(r.codiceVarieta || '').trim(),
      codiceClone: String(r.codiceClone || '').trim(),
      codicePortainnesto: String(r.codicePortainnesto || '').trim(),
      quantita,
      prezzoUnitario,
      aliquotaIva: rigaAliquota,
      importo,
    });
  }

  // Se è specificato un totaleMerce esplicito nel payload (es. per fattura libera da corpo libero)
  if (body.totaleMerce !== undefined && Number(body.totaleMerce) >= 0 && righe.length === 0) {
    totaleMerce = Math.round(Number(body.totaleMerce) * 100) / 100;
  } else {
    totaleMerce = Math.round(totaleMerce * 100) / 100;
  }

  const aliquotaVal = Number.isFinite(Number(aliquotaIva)) ? Number(aliquotaIva) : 10;
  const totaleIva = righeSalvate.length > 0
    ? Math.round(totaleIvaCalcolato * 100) / 100
    : Math.round((totaleMerce * (aliquotaVal / 100)) * 100) / 100;
  const totaleFattura = Math.round((totaleMerce + totaleIva) * 100) / 100;

  // Inserimento testata fattura
  const insertHeaderSql = `
    INSERT INTO fatture (
      id,
      numero_fattura,
      anno,
      progressivo,
      data_fattura,
      cliente,
      partita_iva,
      codice_fiscale,
      cessionario_indirizzo,
      modalita_pagamento,
      aliquota_iva,
      totale_merce,
      totale_iva,
      totale_fattura,
      note,
      corpo_libero
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const headerStmt = c.env.DB.prepare(insertHeaderSql).bind(
    fatturaId,
    numeroFattura,
    anno,
    progressivo,
    dataFattura,
    cliente.trim(),
    partitaIva?.trim() || null,
    codiceFiscale?.trim() || null,
    cessionarioIndirizzo?.trim() || null,
    modalitaPagamento.trim() || MODALITA_PAGAMENTO_PREDEFINITA,
    aliquotaVal,
    totaleMerce,
    totaleIva,
    totaleFattura,
    note?.trim() || null,
    corpoLiberoTrim || null,
  );

  const insertRigaSql = `
    INSERT INTO fatture_righe (
      id,
      fattura_id,
      ordine_id,
      prodotto,
      codice_varieta,
      codice_clone,
      codice_portainnesto,
      quantita,
      prezzo_unitario,
      aliquota_iva,
      importo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const batchStmts = [headerStmt];
  for (const r of righeSalvate) {
    batchStmts.push(
      c.env.DB.prepare(insertRigaSql).bind(
        r.id!,
        fatturaId,
        r.ordineId,
        r.prodotto,
        r.codiceVarieta,
        r.codiceClone,
        r.codicePortainnesto,
        r.quantita,
        r.prezzoUnitario,
        r.aliquotaIva ?? 10,
        r.importo,
      ),
    );
  }

  await c.env.DB.batch(batchStmts);

  const totaleQuantita = righeSalvate.reduce((acc, r) => acc + r.quantita, 0);

  const responseFattura: FatturaDettaglio = {
    id: fatturaId,
    numeroFattura,
    anno,
    progressivo,
    dataFattura,
    cliente: cliente.trim(),
    partitaIva: partitaIva?.trim() || null,
    codiceFiscale: codiceFiscale?.trim() || null,
    cessionarioIndirizzo: cessionarioIndirizzo?.trim() || null,
    modalitaPagamento: modalitaPagamento.trim() || MODALITA_PAGAMENTO_PREDEFINITA,
    aliquotaIva: aliquotaVal,
    totaleMerce,
    totaleIva,
    totaleFattura,
    note: note?.trim() || null,
    corpoLibero: corpoLiberoTrim || null,
    createdAt: new Date().toISOString(),
    righe: righeSalvate,
    totaleQuantita,
    numeroRighe: righeSalvate.length,
  };

  return c.json({ fattura: responseFattura }, 201);
});

/**
 * DELETE /api/fatture/:id
 * Elimina una fattura e le sue righe dall'archivio (solo admin).
 */
fattureRoutes.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');

  const check = await c.env.DB.prepare('SELECT id FROM fatture WHERE id = ?').bind(id).first();
  if (!check) {
    return c.json({ error: 'Fattura non trovata' }, 404);
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM fatture_righe WHERE fattura_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM fatture WHERE id = ?').bind(id),
  ]);

  return c.json({ ok: true, id });
});
