import { Hono } from 'hono';
import type {
  CellaResocontoCliente,
  DettaglioResocontoClienti,
  ReportOrdiniClientiResponse,
  ReportResocontoClientiResponse,
  RigaOrdiniClienti,
  RigaResocontoClienti,
} from '@magazzino/shared';
import type { Env } from '../index';
import { type AppVariables, requireAuth } from '../auth/middleware';

export const reportClientiRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

reportClientiRoutes.use('*', requireAuth);

/**
 * GET /api/report-clienti/ordini-clienti
 * Replica la base del report disponibilità:
 * - prima colonna numerica: quantità prodotta (lotti_magazzino)
 * - per ciascun cliente: due colonne — Spedito (consegnato = true) e Da spedire (consegnato = false)
 * Filtri opzionali: campagna, prodotto, tipologia, cliente
 */
reportClientiRoutes.get('/ordini-clienti', async (c) => {
  const campagna = c.req.query('campagna')?.trim() || '';
  const prodotto = c.req.query('prodotto')?.trim() || '';
  const tipologia = c.req.query('tipologia')?.trim() || '';
  const clienteFiltro = c.req.query('cliente')?.trim() || '';

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
  if (tipologia) {
    whereParts.push('tipologia = ?');
    params.push(tipologia);
  }

  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

  const dispSql = `
    SELECT
      campagna,
      prodotto,
      codice_varieta,
      codice_clone,
      codice_portainnesto,
      tipologia,
      prodotto_qta
    FROM disponibilita
    ${whereClause}
    ORDER BY codice_varieta ASC, codice_clone ASC, codice_portainnesto ASC, campagna DESC, prodotto ASC
  `;

  const ordWhereParts = [...whereParts];
  const ordParams = [...params];
  if (clienteFiltro) {
    ordWhereParts.push('cliente = ?');
    ordParams.push(clienteFiltro);
  }
  const ordWhereClause = ordWhereParts.length > 0 ? `WHERE ${ordWhereParts.join(' AND ')}` : '';

  const ordiniSql = `
    SELECT
      campagna,
      prodotto,
      codice_varieta,
      codice_clone,
      codice_portainnesto,
      tipologia,
      cliente,
      SUM(CASE WHEN consegnato = 1 THEN quantita ELSE 0 END) AS spedito,
      SUM(CASE WHEN consegnato = 0 THEN quantita ELSE 0 END) AS da_spedire
    FROM ordine_impieghi
    ${ordWhereClause}
    GROUP BY campagna, prodotto, codice_varieta, codice_clone, codice_portainnesto, tipologia, cliente
    HAVING SUM(quantita) > 0
  `;

  const [dispRes, ordRes] = await Promise.all([
    c.env.DB.prepare(dispSql)
      .bind(...params)
      .all<{
        campagna: string;
        prodotto: string;
        codice_varieta: string;
        codice_clone: string;
        codice_portainnesto: string;
        tipologia: string;
        prodotto_qta: number;
      }>(),
    c.env.DB.prepare(ordiniSql)
      .bind(...ordParams)
      .all<{
        campagna: string;
        prodotto: string;
        codice_varieta: string;
        codice_clone: string;
        codice_portainnesto: string;
        tipologia: string;
        cliente: string;
        spedito: number;
        da_spedire: number;
      }>(),
  ]);

  const clientiSet = new Set<string>();
  const speditoMap = new Map<string, Record<string, number>>();
  const daSpedireMap = new Map<string, Record<string, number>>();

  for (const row of ordRes.results ?? []) {
    const key = `${row.campagna}|${row.prodotto}|${row.codice_varieta}|${row.codice_clone}|${row.codice_portainnesto}|${row.tipologia}`;
    const qtaSpedito = Number(row.spedito) || 0;
    const qtaDaSpedire = Number(row.da_spedire) || 0;

    if (qtaSpedito > 0) {
      let perCliSped = speditoMap.get(key);
      if (!perCliSped) {
        perCliSped = {};
        speditoMap.set(key, perCliSped);
      }
      perCliSped[row.cliente] = (perCliSped[row.cliente] || 0) + qtaSpedito;
      clientiSet.add(row.cliente);
    }

    if (qtaDaSpedire > 0) {
      let perCliDaSped = daSpedireMap.get(key);
      if (!perCliDaSped) {
        perCliDaSped = {};
        daSpedireMap.set(key, perCliDaSped);
      }
      perCliDaSped[row.cliente] = (perCliDaSped[row.cliente] || 0) + qtaDaSpedire;
      clientiSet.add(row.cliente);
    }
  }

  const righe: RigaOrdiniClienti[] = [];
  for (const d of dispRes.results ?? []) {
    const key = `${d.campagna}|${d.prodotto}|${d.codice_varieta}|${d.codice_clone}|${d.codice_portainnesto}|${d.tipologia}`;
    const perCliSpedito = speditoMap.get(key) ?? {};
    const perCliDaSpedire = daSpedireMap.get(key) ?? {};
    const totaleSpedito = Object.values(perCliSpedito).reduce((acc, v) => acc + v, 0);
    const totaleDaSpedire = Object.values(perCliDaSpedire).reduce((acc, v) => acc + v, 0);

    righe.push({
      campagna: d.campagna,
      prodotto: d.prodotto,
      codice_varieta: d.codice_varieta,
      codice_clone: d.codice_clone,
      codice_portainnesto: d.codice_portainnesto,
      tipologia: d.tipologia,
      prodotto_qta: Number(d.prodotto_qta) || 0,
      spedito_per_cliente: perCliSpedito,
      da_spedire_per_cliente: perCliDaSpedire,
      totale_spedito: totaleSpedito,
      totale_da_spedire: totaleDaSpedire,
    });
  }

  const clienti = Array.from(clientiSet).sort((a, b) =>
    a.localeCompare(b, 'it', { sensitivity: 'base' }),
  );

  const body: ReportOrdiniClientiResponse = { righe, clienti };
  return c.json(body);
});

/**
 * GET /api/report-clienti/resoconto-clienti
 * Righe: tipologie di prodotto (prodotto + tipologia), con dettagli per varietà, clone, portainnesto
 * Colonne per ogni cliente: quantità consegnata, prezzo, Prezzo × Quantità
 * Filtri opzionali: campagna, cliente
 */
reportClientiRoutes.get('/resoconto-clienti', async (c) => {
  const campagna = c.req.query('campagna')?.trim() || '';
  const clienteFiltro = c.req.query('cliente')?.trim() || '';

  const whereParts: string[] = ['consegnato = 1'];
  const params: unknown[] = [];

  if (campagna) {
    whereParts.push('campagna = ?');
    params.push(campagna);
  }
  if (clienteFiltro) {
    whereParts.push('cliente = ?');
    params.push(clienteFiltro);
  }

  const sql = `
    SELECT
      prodotto,
      tipologia,
      codice_varieta,
      codice_clone,
      codice_portainnesto,
      cliente,
      SUM(quantita) AS quantita_consegnata,
      SUM(quantita * COALESCE(prezzo_vendita, 0)) AS totale_importo
    FROM ordine_impieghi
    WHERE ${whereParts.join(' AND ')}
    GROUP BY prodotto, tipologia, codice_varieta, codice_clone, codice_portainnesto, cliente
    HAVING SUM(quantita) > 0
    ORDER BY prodotto ASC, tipologia ASC, codice_varieta ASC, codice_clone ASC, codice_portainnesto ASC, cliente ASC
  `;

  const campagneSql = `
    SELECT DISTINCT campagna
    FROM ordine_impieghi
    WHERE consegnato = 1 AND campagna IS NOT NULL AND campagna != ''
    ORDER BY campagna DESC
  `;

  const [res, campRes] = await Promise.all([
    c.env.DB.prepare(sql)
      .bind(...params)
      .all<{
        prodotto: string;
        tipologia: string;
        codice_varieta: string;
        codice_clone: string;
        codice_portainnesto: string;
        cliente: string;
        quantita_consegnata: number;
        totale_importo: number;
      }>(),
    c.env.DB.prepare(campagneSql).all<{ campagna: string }>(),
  ]);

  const clientiSet = new Set<string>();
  const righeMap = new Map<string, RigaResocontoClienti>();
  const dettagliMap = new Map<string, Map<string, DettaglioResocontoClienti>>();
  const parentRawImportoMap = new Map<string, Map<string, number>>();

  for (const row of res.results ?? []) {
    const qta = Number(row.quantita_consegnata) || 0;
    const importoRaw = Number(row.totale_importo) || 0;
    const totale = Math.round(importoRaw * 100) / 100;
    const prezzo = qta > 0 ? importoRaw / qta : 0;

    clientiSet.add(row.cliente);

    const parentKey = `${row.prodotto}|${row.tipologia}`;
    let riga = righeMap.get(parentKey);
    if (!riga) {
      riga = {
        prodotto: row.prodotto,
        tipologia: row.tipologia,
        per_cliente: {},
        totale_quantita: 0,
        totale_importo: 0,
        dettagli: [],
      };
      righeMap.set(parentKey, riga);
      dettagliMap.set(parentKey, new Map());
      parentRawImportoMap.set(parentKey, new Map());
    }

    // Aggiornamento totali riga padre mantenendo importo grezzo per evitare deriva da arrotondamento
    const rawPerCli = parentRawImportoMap.get(parentKey)!;
    const nuovoImportoRawCli = (rawPerCli.get(row.cliente) ?? 0) + importoRaw;
    rawPerCli.set(row.cliente, nuovoImportoRawCli);

    const qtaCliPrec = riga.per_cliente[row.cliente]?.quantita_consegnata ?? 0;
    const nuovaQtaCli = qtaCliPrec + qta;
    const nuovoTotaleCli = Math.round(nuovoImportoRawCli * 100) / 100;
    const nuovoPrezzoCli = nuovaQtaCli > 0 ? nuovoImportoRawCli / nuovaQtaCli : 0;
    riga.per_cliente[row.cliente] = {
      quantita_consegnata: nuovaQtaCli,
      prezzo: nuovoPrezzoCli,
      totale: nuovoTotaleCli,
    };
    riga.totale_quantita += qta;

    // Aggiornamento dettaglio varietà/clone/portainnesto
    const detMap = dettagliMap.get(parentKey)!;
    const detKey = `${row.codice_varieta}|${row.codice_clone}|${row.codice_portainnesto}`;
    let dettaglio = detMap.get(detKey);
    if (!dettaglio) {
      dettaglio = {
        codice_varieta: row.codice_varieta,
        codice_clone: row.codice_clone,
        codice_portainnesto: row.codice_portainnesto,
        per_cliente: {},
        totale_quantita: 0,
        totale_importo: 0,
      };
      detMap.set(detKey, dettaglio);
    }

    const cellaDettaglio: CellaResocontoCliente = {
      quantita_consegnata: qta,
      prezzo,
      totale,
    };
    dettaglio.per_cliente[row.cliente] = cellaDettaglio;
    dettaglio.totale_quantita += qta;
    dettaglio.totale_importo = Math.round((dettaglio.totale_importo + totale) * 100) / 100;
  }

  for (const [parentKey, riga] of righeMap.entries()) {
    const rawPerCli = parentRawImportoMap.get(parentKey)!;
    let sumRaw = 0;
    for (const v of rawPerCli.values()) {
      sumRaw += v;
    }
    riga.totale_importo = Math.round(sumRaw * 100) / 100;

    const detMap = dettagliMap.get(parentKey)!;
    riga.dettagli = Array.from(detMap.values()).sort((a, b) => {
      const vCmp = a.codice_varieta.localeCompare(b.codice_varieta, 'it', { sensitivity: 'base' });
      if (vCmp !== 0) return vCmp;
      const cCmp = a.codice_clone.localeCompare(b.codice_clone, 'it', { sensitivity: 'base' });
      if (cCmp !== 0) return cCmp;
      return a.codice_portainnesto.localeCompare(b.codice_portainnesto, 'it', {
        sensitivity: 'base',
      });
    });
  }

  const righe = Array.from(righeMap.values()).sort((a, b) => {
    const pCmp = a.prodotto.localeCompare(b.prodotto, 'it', { sensitivity: 'base' });
    if (pCmp !== 0) return pCmp;
    return a.tipologia.localeCompare(b.tipologia, 'it', { sensitivity: 'base' });
  });

  const clienti = Array.from(clientiSet).sort((a, b) =>
    a.localeCompare(b, 'it', { sensitivity: 'base' }),
  );

  const campagne = (campRes.results ?? []).map((r) => r.campagna).filter(Boolean);

  const body: ReportResocontoClientiResponse = { righe, clienti, campagne };
  return c.json(body);
});
