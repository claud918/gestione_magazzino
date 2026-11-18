-- Migration 0017: Aggiunta tabella scadenze, tabella anagrafica causali_costo e campi lotti_magazzino

-- 1. Tabella scadenze
CREATE TABLE IF NOT EXISTS `scadenze` (
  `id` text PRIMARY KEY NOT NULL,
  `oggetto` text NOT NULL,
  `tipologia` text,
  `data_scadenza` text NOT NULL,
  `data_emissione` text,
  `note` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `scadenze_data_scadenza_idx` ON `scadenze` (`data_scadenza`);
--> statement-breakpoint

-- 2. Anagrafica causali_costo
CREATE TABLE IF NOT EXISTS `causali_costo` (
  `causale` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `causali_costo` (`causale`) VALUES ('Acquisto');
--> statement-breakpoint
INSERT OR IGNORE INTO `causali_costo` (`causale`) VALUES ('Concimazione');
--> statement-breakpoint
INSERT OR IGNORE INTO `causali_costo` (`causale`) VALUES ('Trattamento');
--> statement-breakpoint
INSERT OR IGNORE INTO `causali_costo` (`causale`) VALUES ('Manodopera');
--> statement-breakpoint
INSERT OR IGNORE INTO `causali_costo` (`causale`) SELECT DISTINCT `causale` FROM `inserimento_costi`;
--> statement-breakpoint

-- 3. Ricreazione inserimento_costi per rimuovere il vincolo CHECK fisso sulla causale
CREATE TABLE `_tmp_inserimento_costi` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`centro_di_costo` text NOT NULL,
	`dettaglio_cdc` text,
	`causale` text NOT NULL,
	`note` text,
	`campagna` text NOT NULL,
	`importo` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`centro_di_costo`) REFERENCES `centri_di_costo`(`centro_di_costo`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`centro_di_costo`,`dettaglio_cdc`) REFERENCES `dettaglio_cdc`(`centro_di_costo`,`campo_varieta`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`causale`) REFERENCES `causali_costo`(`causale`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `_tmp_inserimento_costi` SELECT * FROM `inserimento_costi`;
--> statement-breakpoint
DROP TABLE `inserimento_costi`;
--> statement-breakpoint
ALTER TABLE `_tmp_inserimento_costi` RENAME TO `inserimento_costi`;
--> statement-breakpoint
CREATE INDEX `inserimento_costi_data_idx` ON `inserimento_costi` (`data`);
--> statement-breakpoint

-- 4. Campi campo_varieta e prezzo_acquisto su lotti_magazzino
ALTER TABLE `lotti_magazzino` ADD COLUMN `campo_varieta` text DEFAULT 'NC';
--> statement-breakpoint
ALTER TABLE `lotti_magazzino` ADD COLUMN `prezzo_acquisto` real;
