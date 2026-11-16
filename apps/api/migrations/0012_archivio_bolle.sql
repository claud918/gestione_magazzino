-- Migration 0012: Creazione tabelle per Archivio Bolle di Trasporto
CREATE TABLE IF NOT EXISTS `bolle_trasporto` (
  `id` text PRIMARY KEY NOT NULL,
  `numero_bolla` text NOT NULL,
  `anno` integer NOT NULL,
  `progressivo` integer NOT NULL,
  `data_bolla` text NOT NULL,
  `cliente` text NOT NULL REFERENCES `clienti`(`ragione_sociale`) ON UPDATE CASCADE ON DELETE RESTRICT,
  `cessionario_indirizzo` text,
  `luogo_destinazione` text NOT NULL,
  `causale_trasporto` text NOT NULL DEFAULT 'Vendita',
  `trasporto_a_cura_di` text NOT NULL DEFAULT 'Cedente',
  `vettore` text,
  `aspetto_beni` text,
  `numero_colli` text,
  `data_ora_inizio_trasporto` text,
  `note` text,
  `created_at` text NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `bolle_trasporto_numero_uq` ON `bolle_trasporto` (`numero_bolla`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bolle_trasporto_anno_prog_idx` ON `bolle_trasporto` (`anno`, `progressivo`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bolle_trasporto_cliente_idx` ON `bolle_trasporto` (`cliente`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `bolle_righe` (
  `id` text PRIMARY KEY NOT NULL,
  `bolla_id` text NOT NULL REFERENCES `bolle_trasporto`(`id`) ON DELETE CASCADE,
  `ordine_id` text REFERENCES `ordine_impieghi`(`id`) ON DELETE SET NULL,
  `prodotto` text NOT NULL,
  `codice_varieta` text NOT NULL,
  `codice_clone` text NOT NULL,
  `codice_portainnesto` text NOT NULL,
  `quantita` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bolle_righe_bolla_idx` ON `bolle_righe` (`bolla_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bolle_righe_ordine_idx` ON `bolle_righe` (`ordine_id`);
