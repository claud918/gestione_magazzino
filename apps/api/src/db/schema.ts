/**
 * Schema Drizzle del database D1 (SQLite) per la Cooperativa Barbatelle.
 * Vedi REQUISITI.md, GLOSSARY.md e docs/adr/0007-nuovo-modello-costi-magazzino.md.
 */
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// AUTENTICAZIONE E RUOLI NOMINATIVI (admin | commerciale | produttore)
// ============================================================================

export const utenti = sqliteTable(
  'utenti',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    nome: text('nome').notNull(),
    passwordHash: text('password_hash').notNull(),
    ruolo: text('ruolo', { enum: ['admin', 'commerciale', 'produttore'] }).notNull(),
    attivo: integer('attivo', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [uniqueIndex('utenti_email_uq').on(t.email)],
);

export const sessioni = sqliteTable(
  'sessioni',
  {
    id: text('id').primaryKey(),
    utenteId: integer('utente_id')
      .notNull()
      .references(() => utenti.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index('sessioni_utente_idx').on(t.utenteId)],
);

export const loginTentativi = sqliteTable('login_tentativi', {
  ip: text('ip').primaryKey(),
  tentativi: integer('tentativi').notNull().default(0),
  finestraStart: integer('finestra_start').notNull(),
});

// ============================================================================
// MODELLO COSTI / ORE / MAGAZZINO / ORDINI (ex Supabase, vedi ADR-0007)
//
// Convenzioni:
// - id uuid (text) generati dall'API con crypto.randomUUID();
// - chiavi testuali con ON UPDATE CASCADE (rinominare aggiorna i record collegati)
//   e ON DELETE RESTRICT (non si elimina un valore in uso);
// - `dettaglio_cdc.campo_varieta` e `lotti_magazzino.riferimento_lotto_parlante`
//   sono mantenuti da trigger (migration 0004) così che le modifiche si propaghino a cascata.
// ============================================================================

const uuid = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID());
const oggi = sql`(CURRENT_DATE)`;
const TIPOLOGIE = `('Nuova produzione', 'Seconde', 'Frigoconservate', 'Ripiantate')`;

export const anagraficaPersonale = sqliteTable('anagrafica_personale', {
  nomeCognome: text('nome_cognome').primaryKey(),
  nome: text('nome').notNull(),
  cognome: text('cognome').notNull(),
  dataDiNascita: text('data_di_nascita').notNull(),
  dataVisitaMedica: text('data_visita_medica'),
  dataFormazioneSicurezza: text('data_formazione_sicurezza'),
  dataPatentinoMuletto: text('data_patentino_muletto'),
  dataPatentinoTrattore: text('data_patentino_trattore'),
  dataRspp: text('data_rspp'),
  dataAntincendio: text('data_antincendio'),
});

export const centriDiCosto = sqliteTable('centri_di_costo', {
  centroDiCosto: text('centro_di_costo').primaryKey(),
});

export const attivitaCdc = sqliteTable(
  'attivita_cdc',
  {
    id: uuid(),
    centroDiCosto: text('centro_di_costo')
      .notNull()
      .references(() => centriDiCosto.centroDiCosto, { onUpdate: 'cascade', onDelete: 'restrict' }),
    attivita: text('attivita').notNull(),
  },
  (t) => [uniqueIndex('attivita_cdc_cdc_attivita_uq').on(t.centroDiCosto, t.attivita)],
);

export const dettaglioCdc = sqliteTable(
  'dettaglio_cdc',
  {
    id: uuid(),
    centroDiCosto: text('centro_di_costo')
      .notNull()
      .references(() => centriDiCosto.centroDiCosto, { onUpdate: 'cascade', onDelete: 'restrict' }),
    campo: text('campo').notNull(),
    varieta: text('varieta').notNull(),
    /** campo || ' - ' || varieta (mantenuto da trigger) */
    campoVarieta: text('campo_varieta').notNull().default(''),
  },
  (t) => [
    uniqueIndex('dettaglio_cdc_campo_varieta_uq').on(t.campoVarieta),
    uniqueIndex('dettaglio_cdc_cdc_campo_varieta_uq').on(t.centroDiCosto, t.campoVarieta),
  ],
);

export const inserimentoOre = sqliteTable(
  'inserimento_ore',
  {
    id: uuid(),
    dipendente: text('dipendente')
      .notNull()
      .references(() => anagraficaPersonale.nomeCognome, { onUpdate: 'cascade', onDelete: 'restrict' }),
    centroDiCosto: text('centro_di_costo')
      .notNull()
      .references(() => centriDiCosto.centroDiCosto, { onUpdate: 'cascade', onDelete: 'restrict' }),
    attivita: text('attivita').notNull(),
    dettaglioCdc: text('dettaglio_cdc'),
    numeroOre: real('numero_ore').notNull(),
    dataInserimento: text('data_inserimento').notNull().default(oggi),
  },
  (t) => [
    check('inserimento_ore_numero_ore_check', sql`${t.numeroOre} > 0`),
    // L'attività deve appartenere al centro di costo scelto
    foreignKey({
      name: 'inserimento_ore_attivita_fk',
      columns: [t.centroDiCosto, t.attivita],
      foreignColumns: [attivitaCdc.centroDiCosto, attivitaCdc.attivita],
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    // Il dettaglio (facoltativo) deve appartenere al centro di costo scelto
    foreignKey({
      name: 'inserimento_ore_dettaglio_fk',
      columns: [t.centroDiCosto, t.dettaglioCdc],
      foreignColumns: [dettaglioCdc.centroDiCosto, dettaglioCdc.campoVarieta],
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    index('inserimento_ore_data_idx').on(t.dataInserimento),
  ],
);

export const inserimentoCosti = sqliteTable(
  'inserimento_costi',
  {
    id: uuid(),
    data: text('data').notNull(),
    centroDiCosto: text('centro_di_costo')
      .notNull()
      .references(() => centriDiCosto.centroDiCosto, { onUpdate: 'cascade', onDelete: 'restrict' }),
    dettaglioCdc: text('dettaglio_cdc'),
    causale: text('causale').notNull(),
    note: text('note'),
    campagna: text('campagna').notNull(),
    importo: real('importo').notNull().default(0),
  },
  (t) => [
    check(
      'inserimento_costi_causale_check',
      sql`${t.causale} IN ('Acquisto', 'Concimazione', 'Trattamento', 'Manodopera')`,
    ),
    foreignKey({
      name: 'inserimento_costi_dettaglio_fk',
      columns: [t.centroDiCosto, t.dettaglioCdc],
      foreignColumns: [dettaglioCdc.centroDiCosto, dettaglioCdc.campoVarieta],
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    index('inserimento_costi_data_idx').on(t.data),
  ],
);

export const anagraficaVite = sqliteTable(
  'anagrafica_vite',
  {
    codiceVarieta: text('codice_varieta').notNull(),
    codiceClone: text('codice_clone').notNull(),
  },
  (t) => [primaryKey({ columns: [t.codiceVarieta, t.codiceClone] })],
);

export const anagraficaPortainnesto = sqliteTable('anagrafica_portainnesto', {
  codicePortainnesto: text('codice_portainnesto').primaryKey(),
});

export const clienti = sqliteTable('clienti', {
  ragioneSociale: text('ragione_sociale').primaryKey(),
  partitaIva: text('partita_iva'),
  codiceFiscale: text('codice_fiscale'),
  citta: text('citta'),
  indirizzo: text('indirizzo'),
  numeroTelefono: text('numero_telefono'),
});

export const tipiProdotto = sqliteTable('tipi_prodotto', {
  prodotto: text('prodotto').primaryKey(),
});

export const lottiMagazzino = sqliteTable(
  'lotti_magazzino',
  {
    id: uuid(),
    dataInserimento: text('data_inserimento').notNull().default(oggi),
    prodotto: text('prodotto')
      .notNull()
      .references(() => tipiProdotto.prodotto, { onUpdate: 'cascade', onDelete: 'restrict' }),
    codiceVarieta: text('codice_varieta').notNull(),
    codiceClone: text('codice_clone').notNull(),
    codicePortainnesto: text('codice_portainnesto')
      .notNull()
      .references(() => anagraficaPortainnesto.codicePortainnesto, {
        onUpdate: 'cascade',
        onDelete: 'restrict',
      }),
    campagna: text('campagna').notNull(),
    quantita: integer('quantita').notNull(),
    note: text('note'),
    provenienza: text('provenienza').notNull(),
    /** campagna - prodotto - varietà (Cl. clone) - P.I. portainnesto - tipologia (mantenuto da trigger) */
    riferimentoLottoParlante: text('riferimento_lotto_parlante').notNull().default(''),
    tipologia: text('tipologia').notNull().default('Nuova produzione'),
  },
  (t) => [
    check('lotti_magazzino_quantita_check', sql`${t.quantita} >= 0`),
    check('lotti_magazzino_provenienza_check', sql`${t.provenienza} IN ('Prodotto', 'Acquistato')`),
    check('lotti_magazzino_tipologia_check', sql.raw(`"tipologia" IN ${TIPOLOGIE}`)),
    // Il clone deve appartenere alla varietà
    foreignKey({
      name: 'lotti_magazzino_vite_fk',
      columns: [t.codiceVarieta, t.codiceClone],
      foreignColumns: [anagraficaVite.codiceVarieta, anagraficaVite.codiceClone],
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    uniqueIndex('lotti_magazzino_riferimento_uq').on(t.riferimentoLottoParlante),
    // Chiave per la FK composita degli ordini (coerenza ordine ↔ lotto)
    uniqueIndex('lotti_magazzino_combinazione_uq').on(
      t.riferimentoLottoParlante,
      t.campagna,
      t.prodotto,
      t.codiceVarieta,
      t.codiceClone,
      t.codicePortainnesto,
      t.tipologia,
    ),
  ],
);

export const ordineImpieghi = sqliteTable(
  'ordine_impieghi',
  {
    id: uuid(),
    riferimentoLotto: text('riferimento_lotto'),
    dataInserimento: text('data_inserimento').notNull().default(oggi),
    prodotto: text('prodotto')
      .notNull()
      .references(() => tipiProdotto.prodotto, { onUpdate: 'cascade', onDelete: 'restrict' }),
    codiceVarieta: text('codice_varieta').notNull(),
    codiceClone: text('codice_clone').notNull(),
    codicePortainnesto: text('codice_portainnesto')
      .notNull()
      .references(() => anagraficaPortainnesto.codicePortainnesto, {
        onUpdate: 'cascade',
        onDelete: 'restrict',
      }),
    campagna: text('campagna').notNull(),
    quantita: integer('quantita').notNull(),
    note: text('note'),
    consegnato: integer('consegnato', { mode: 'boolean' }).notNull().default(false),
    cliente: text('cliente')
      .notNull()
      .references(() => clienti.ragioneSociale, { onUpdate: 'cascade', onDelete: 'restrict' }),
    tipologia: text('tipologia').notNull().default('Nuova produzione'),
  },
  (t) => [
    check('ordine_impieghi_quantita_check', sql`${t.quantita} > 0`),
    check('ordine_impieghi_tipologia_check', sql.raw(`"tipologia" IN ${TIPOLOGIE}`)),
    foreignKey({
      name: 'ordine_impieghi_vite_fk',
      columns: [t.codiceVarieta, t.codiceClone],
      foreignColumns: [anagraficaVite.codiceVarieta, anagraficaVite.codiceClone],
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    // Se è indicato un lotto, i dati dell'ordine devono coincidere con quelli del lotto
    foreignKey({
      name: 'ordine_impieghi_lotto_fk',
      columns: [
        t.riferimentoLotto,
        t.campagna,
        t.prodotto,
        t.codiceVarieta,
        t.codiceClone,
        t.codicePortainnesto,
        t.tipologia,
      ],
      foreignColumns: [
        lottiMagazzino.riferimentoLottoParlante,
        lottiMagazzino.campagna,
        lottiMagazzino.prodotto,
        lottiMagazzino.codiceVarieta,
        lottiMagazzino.codiceClone,
        lottiMagazzino.codicePortainnesto,
        lottiMagazzino.tipologia,
      ],
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    index('ordine_impieghi_cliente_idx').on(t.cliente),
  ],
);
