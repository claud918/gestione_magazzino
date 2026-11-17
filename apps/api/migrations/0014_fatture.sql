-- Migration 0014: Creazione tabelle fatture e fatture_righe
CREATE TABLE IF NOT EXISTS `fatture` (
  `id` text PRIMARY KEY NOT NULL,
  `numero_fattura` text NOT NULL,
  `anno` integer NOT NULL,
  `progressivo` integer NOT NULL,
  `data_fattura` text NOT NULL,
  `cliente` text NOT NULL REFERENCES `clienti`(`ragione_sociale`) ON UPDATE CASCADE ON DELETE RESTRICT,
  `partita_iva` text,
  `codice_fiscale` text,
  `cessionario_indirizzo` text,
  `modalita_pagamento` text NOT NULL DEFAULT 'bonifico bancario 60 gg f.m. - banca d''appoggio BANCA INTESA  ag Cascina PI iban  IT30Q0306970951100000004529',
  `aliquota_iva` real NOT NULL DEFAULT 10,
  `totale_merce` real NOT NULL DEFAULT 0,
  `totale_iva` real NOT NULL DEFAULT 0,
  `totale_fattura` real NOT NULL DEFAULT 0,
  `note` text,
  `corpo_libero` text,
  `created_at` text NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `fatture_numero_uq` ON `fatture` (`numero_fattura`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `fatture_anno_prog_idx` ON `fatture` (`anno`, `progressivo`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `fatture_cliente_idx` ON `fatture` (`cliente`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `fatture_righe` (
  `id` text PRIMARY KEY NOT NULL,
  `fattura_id` text NOT NULL REFERENCES `fatture`(`id`) ON DELETE CASCADE,
  `ordine_id` text REFERENCES `ordine_impieghi`(`id`) ON DELETE SET NULL,
  `prodotto` text NOT NULL,
  `codice_varieta` text NOT NULL,
  `codice_clone` text NOT NULL,
  `codice_portainnesto` text NOT NULL,
  `quantita` integer NOT NULL,
  `prezzo_unitario` real NOT NULL DEFAULT 0,
  `importo` real NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `fatture_righe_fattura_idx` ON `fatture_righe` (`fattura_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `fatture_righe_ordine_idx` ON `fatture_righe` (`ordine_id`);
