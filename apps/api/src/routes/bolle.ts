import { Hono } from 'hono';
import type {
  BollaRigaItem,
  BollaTrasportoDettaglio,
  BollaTrasportoSommario,
  ProssimoNumeroBollaResponse,
  SalvaBollaPayload,
} from '@magazzino/shared';
import type { Env } from '../index';
import { type AppVariables, requireAdmin, requireAuth } from '../auth/middleware';

export const bolleRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

bolleRoutes.use('*', requireAuth);

/**
 * GET /api/bolle/prossimo-numero
 * Calcola il prossimo progressivo disponibile sul database per l'anno specificato.
 */
bolleRoutes.get('/prossimo-numero', async (c) => {
  const annoQuery = c.req.query('anno');
  const anno = annoQuery ? parseInt(annoQuery, 10) : new Date().getFullYear();
  const annoValido = Number.isFinite(anno) && anno > 2000 ? anno : new Date().getFullYear();

  const row = await c.env.DB.prepare(
    'SELECT MAX(progressivo) AS maxProg FROM bolle_trasporto WHERE anno = ?',
  )
    .bind(annoValido)
    .first<{ maxProg: number | null }>();

  const maxProg = row?.maxProg ?? 0;
  const progressivo = Number(maxProg) + 1;
  const numeroBolla = `${progressivo}/${annoValido}`;

  const res: ProssimoNumeroBollaResponse = {
    anno: annoValido,
    progressivo,
    numeroBolla,
  };
  return c.json(res);
});

/**
 * GET /api/bolle
 * Elenco sommario di tutte le bolle salvate con totale quantità e numero righe.
 */
bolleRoutes.get('/', async (c) => {
  const annoQuery = c.req.query('anno');
  const clienteQuery = c.req.query('cliente');

  const whereParts: string[] = [];
  const params: unknown[] = [];

  if (annoQuery) {
    const anno = parseInt(annoQuery, 10);
    if (Number.isFinite(anno)) {
      whereParts.push('b.anno = ?');
      params.push(anno);
    }
  }

  if (clienteQuery) {
    whereParts.push('b.cliente = ?');
    params.push(clienteQuery.trim());
  }

  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

  const sql = `
    SELECT
      b.id,
      b.numero_bolla AS numeroBolla,
      b.anno,
      b.progressivo,
      b.data_bolla AS dataBolla,
      b.cliente,
      b.cessionario_indirizzo AS cessionarioIndirizzo,
      b.luogo_destinazione AS luogoDestinazione,
      b.causale_trasporto AS causaleTrasporto,
      b.trasporto_a_cura_di AS trasportoACuraDi,
      b.vettore,
      b.aspetto_beni AS aspettoBeni,
      b.numero_colli AS numeroColli,
      b.data_ora_inizio_trasporto AS dataOraInizioTrasporto,
      b.note,
      b.corpo_libero AS corpoLibero,
      b.created_at AS createdAt,
      COALESCE(SUM(r.quantita), 0) AS totaleQuantita,
      COUNT(r.id) AS numeroRighe
    FROM bolle_trasporto b
    LEFT JOIN bolle_righe r ON r.bolla_id = b.id
    ${whereClause}
    GROUP BY b.id
    ORDER BY b.anno DESC, b.progressivo DESC, b.created_at DESC
  `;

  const query = c.env.DB.prepare(sql);
  const result = await (params.length > 0 ? query.bind(...params) : query).all<BollaTrasportoSommario>();

  return c.json({ bolle: result.results ?? [] });
});

/**
 * GET /api/bolle/:id
 * Dettaglio completo di una bolla con tutte le sue righe merci.
 */
bolleRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  const headerSql = `
    SELECT
      id,
      numero_bolla AS numeroBolla,
      anno,
      progressivo,
      data_bolla AS dataBolla,
      cliente,
      cessionario_indirizzo AS cessionarioIndirizzo,
      luogo_destinazione AS luogoDestinazione,
      causale_trasporto AS causaleTrasporto,
      trasporto_a_cura_di AS trasportoACuraDi,
      vettore,
      aspetto_beni AS aspettoBeni,
      numero_colli AS numeroColli,
      data_ora_inizio_trasporto AS dataOraInizioTrasporto,
      note,
      corpo_libero AS corpoLibero,
      created_at AS createdAt
    FROM bolle_trasporto
    WHERE id = ?
  `;

  const header = await c.env.DB.prepare(headerSql).bind(id).first<Omit<BollaTrasportoSommario, 'totaleQuantita' | 'numeroRighe'>>();
  if (!header) {
    return c.json({ error: 'Bolla non trovata' }, 404);
  }

  const righeSql = `
    SELECT
      id,
      bolla_id AS bollaId,
      ordine_id AS ordineId,
      prodotto,
      codice_varieta AS codiceVarieta,
      codice_clone AS codiceClone,
      codice_portainnesto AS codicePortainnesto,
      quantita
    FROM bolle_righe
    WHERE bolla_id = ?
    ORDER BY rowid ASC
  `;

  const righeRes = await c.env.DB.prepare(righeSql).bind(id).all<BollaRigaItem>();
  const righe = righeRes.results ?? [];
  const totaleQuantita = righe.reduce((acc, r) => acc + (Number(r.quantita) || 0), 0);

  const dettaglio: BollaTrasportoDettaglio = {
    ...header,
    righe,
    totaleQuantita,
    numeroRighe: righe.length,
  };

  return c.json({ bolla: dettaglio });
});

/**
 * POST /api/bolle
 * Salva una nuova bolla di trasporto e le relative righe merci (solo admin).
 */
bolleRoutes.post('/', requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) as SalvaBollaPayload | null;
  if (!body) {
    return c.json({ error: 'Payload non valido' }, 400);
  }

  const {
    dataBolla,
    cliente,
    cessionarioIndirizzo,
    luogoDestinazione,
    causaleTrasporto = 'Vendita',
    trasportoACuraDi = 'Cedente',
    vettore = '',
    aspettoBeni = '',
    numeroColli = '',
    dataOraInizioTrasporto = '',
    note = '',
    corpoLibero = '',
    righe = [],
  } = body;

  if (!dataBolla || !/^\d{4}-\d{2}-\d{2}$/.test(dataBolla)) {
    return c.json({ error: 'Data bolla non valida (formato YYYY-MM-DD)' }, 400);
  }
  if (!cliente || !cliente.trim()) {
    return c.json({ error: 'Cliente obbligatorio' }, 400);
  }
  if (!luogoDestinazione || !luogoDestinazione.trim()) {
    return c.json({ error: 'Luogo di destinazione obbligatorio' }, 400);
  }
  const corpoLiberoTrim = (corpoLibero || '').trim();
  const hasRighe = Array.isArray(righe) && righe.length > 0;
  if (!corpoLiberoTrim && !hasRighe) {
    return c.json({ error: 'La bolla deve contenere una descrizione della merce nel corpo centrale o almeno una riga' }, 400);
  }

  const annoData = parseInt(dataBolla.slice(0, 4), 10) || new Date().getFullYear();

  // Determinazione numero bolla, anno e progressivo
  let numeroBolla = (body.numeroBolla || '').trim();
  let anno = annoData;
  let progressivo = 0;

  const matchSlash = numeroBolla.match(/^(\d+)\/(\d{4})$/);
  const matchSoloNum = numeroBolla.match(/^(\d+)$/);

  if (matchSlash) {
    progressivo = parseInt(matchSlash[1], 10);
    anno = parseInt(matchSlash[2], 10);
  } else if (matchSoloNum) {
    progressivo = parseInt(matchSoloNum[1], 10);
    anno = annoData;
    numeroBolla = `${progressivo}/${anno}`;
  } else if (!numeroBolla) {
    const row = await c.env.DB.prepare(
      'SELECT MAX(progressivo) AS maxProg FROM bolle_trasporto WHERE anno = ?',
    )
      .bind(anno)
      .first<{ maxProg: number | null }>();
    progressivo = (row?.maxProg ?? 0) + 1;
    numeroBolla = `${progressivo}/${anno}`;
  } else {
    // Altro formato custom inserito dall'utente (es. DDT-01)
    const row = await c.env.DB.prepare(
      'SELECT MAX(progressivo) AS maxProg FROM bolle_trasporto WHERE anno = ?',
    )
      .bind(anno)
      .first<{ maxProg: number | null }>();
    progressivo = (row?.maxProg ?? 0) + 1;
  }

  // Verifica unicità numeroBolla
  const esiste = await c.env.DB.prepare('SELECT id FROM bolle_trasporto WHERE numero_bolla = ?')
    .bind(numeroBolla)
    .first();
  if (esiste) {
    return c.json({ error: `Il numero bolla ${numeroBolla} è già presente nell'archivio.` }, 409);
  }

  const bollaId = crypto.randomUUID();

  // Inserimento testata bolla
  const insertHeaderSql = `
    INSERT INTO bolle_trasporto (
      id,
      numero_bolla,
      anno,
      progressivo,
      data_bolla,
      cliente,
      cessionario_indirizzo,
      luogo_destinazione,
      causale_trasporto,
      trasporto_a_cura_di,
      vettore,
      aspetto_beni,
      numero_colli,
      data_ora_inizio_trasporto,
      note,
      corpo_libero
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const headerStmt = c.env.DB.prepare(insertHeaderSql).bind(
    bollaId,
    numeroBolla,
    anno,
    progressivo,
    dataBolla,
    cliente.trim(),
    cessionarioIndirizzo?.trim() || null,
    luogoDestinazione.trim(),
    causaleTrasporto.trim() || 'Vendita',
    trasportoACuraDi.trim() || 'Cedente',
    vettore?.trim() || null,
    aspettoBeni?.trim() || null,
    numeroColli?.trim() || null,
    dataOraInizioTrasporto?.trim() || null,
    note?.trim() || null,
    corpoLiberoTrim || null,
  );

  const insertRigaSql = `
    INSERT INTO bolle_righe (
      id,
      bolla_id,
      ordine_id,
      prodotto,
      codice_varieta,
      codice_clone,
      codice_portainnesto,
      quantita
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const batchStmts = [headerStmt];
  const righeSalvate: BollaRigaItem[] = [];

  for (const r of righe) {
    const rigaId = crypto.randomUUID();
    const quantita = Math.max(0, parseInt(String(r.quantita), 10) || 0);
    const rigaItem: BollaRigaItem = {
      id: rigaId,
      bollaId,
      ordineId: r.ordineId || null,
      prodotto: String(r.prodotto || '').trim(),
      codiceVarieta: String(r.codiceVarieta || '').trim(),
      codiceClone: String(r.codiceClone || '').trim(),
      codicePortainnesto: String(r.codicePortainnesto || '').trim(),
      quantita,
    };
    righeSalvate.push(rigaItem);
    batchStmts.push(
      c.env.DB.prepare(insertRigaSql).bind(
        rigaId,
        bollaId,
        rigaItem.ordineId,
        rigaItem.prodotto,
        rigaItem.codiceVarieta,
        rigaItem.codiceClone,
        rigaItem.codicePortainnesto,
        rigaItem.quantita,
      ),
    );
  }

  await c.env.DB.batch(batchStmts);

  const totaleQuantita = righeSalvate.reduce((acc, r) => acc + r.quantita, 0);

  const responseBolla: BollaTrasportoDettaglio = {
    id: bollaId,
    numeroBolla,
    anno,
    progressivo,
    dataBolla,
    cliente: cliente.trim(),
    cessionarioIndirizzo: cessionarioIndirizzo?.trim() || null,
    luogoDestinazione: luogoDestinazione.trim(),
    causaleTrasporto: causaleTrasporto.trim() || 'Vendita',
    trasportoACuraDi: trasportoACuraDi.trim() || 'Cedente',
    vettore: vettore?.trim() || null,
    aspettoBeni: aspettoBeni?.trim() || null,
    numeroColli: numeroColli?.trim() || null,
    dataOraInizioTrasporto: dataOraInizioTrasporto?.trim() || null,
    note: note?.trim() || null,
    corpoLibero: corpoLiberoTrim || null,
    createdAt: new Date().toISOString(),
    righe: righeSalvate,
    totaleQuantita,
    numeroRighe: righeSalvate.length,
  };

  return c.json({ bolla: responseBolla }, 201);
});

/**
 * DELETE /api/bolle/:id
 * Elimina una bolla di trasporto e le sue righe merci dall'archivio (solo admin).
 */
bolleRoutes.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');

  const check = await c.env.DB.prepare('SELECT id FROM bolle_trasporto WHERE id = ?').bind(id).first();
  if (!check) {
    return c.json({ error: 'Bolla non trovata' }, 404);
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM bolle_righe WHERE bolla_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM bolle_trasporto WHERE id = ?').bind(id),
  ]);

  return c.json({ ok: true, id });
});
