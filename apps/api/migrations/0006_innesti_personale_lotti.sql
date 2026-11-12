-- 1. Assicura che 'Barbatelle innestate' sia presente nei tipi_prodotto
INSERT OR IGNORE INTO `tipi_prodotto` (`prodotto`) VALUES ('Barbatelle innestate');
--> statement-breakpoint

-- 2. Tabella innesti
CREATE TABLE `innesti` (
	`id` text PRIMARY KEY NOT NULL,
	`data_inserimento` text DEFAULT (CURRENT_DATE) NOT NULL,
	`prodotto` text NOT NULL,
	`codice_varieta` text NOT NULL,
	`codice_clone` text NOT NULL,
	`codice_portainnesto` text NOT NULL,
	`campagna` text NOT NULL,
	`quantita` integer NOT NULL,
	`note` text,
	`cliente` text NOT NULL,
	`riferimento_lotto_parlante` text DEFAULT '' NOT NULL,
	`tipologia` text DEFAULT 'Nuova produzione' NOT NULL,
	CHECK (`quantita` >= 0),
	CHECK ("tipologia" IN ('Nuova produzione', 'Seconde', 'Frigoconservate', 'Ripiantate')),
	FOREIGN KEY (`prodotto`) REFERENCES `tipi_prodotto`(`prodotto`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`codice_varieta`, `codice_clone`) REFERENCES `anagrafica_vite`(`codice_varieta`, `codice_clone`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`codice_portainnesto`) REFERENCES `anagrafica_portainnesto`(`codice_portainnesto`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`cliente`) REFERENCES `clienti`(`ragione_sociale`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `innesti_riferimento_uq` ON `innesti` (`riferimento_lotto_parlante`);
--> statement-breakpoint
CREATE TRIGGER `innesti_riferimento_ins` AFTER INSERT ON `innesti`
BEGIN
  UPDATE `innesti` SET `riferimento_lotto_parlante` =
    NEW.`campagna` || ' - ' || NEW.`prodotto` || ' - ' || NEW.`codice_varieta` || ' (Cl. ' || NEW.`codice_clone` || ') - P.I. ' || NEW.`codice_portainnesto` || ' - ' || NEW.`tipologia` || ' - ' || NEW.`cliente`
  WHERE `id` = NEW.`id` AND `riferimento_lotto_parlante` IS NOT
    NEW.`campagna` || ' - ' || NEW.`prodotto` || ' - ' || NEW.`codice_varieta` || ' (Cl. ' || NEW.`codice_clone` || ') - P.I. ' || NEW.`codice_portainnesto` || ' - ' || NEW.`tipologia` || ' - ' || NEW.`cliente`;
END;
--> statement-breakpoint
CREATE TRIGGER `innesti_riferimento_upd` AFTER UPDATE OF `campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia`, `cliente`, `riferimento_lotto_parlante` ON `innesti`
BEGIN
  UPDATE `innesti` SET `riferimento_lotto_parlante` =
    NEW.`campagna` || ' - ' || NEW.`prodotto` || ' - ' || NEW.`codice_varieta` || ' (Cl. ' || NEW.`codice_clone` || ') - P.I. ' || NEW.`codice_portainnesto` || ' - ' || NEW.`tipologia` || ' - ' || NEW.`cliente`
  WHERE `id` = NEW.`id` AND `riferimento_lotto_parlante` IS NOT
    NEW.`campagna` || ' - ' || NEW.`prodotto` || ' - ' || NEW.`codice_varieta` || ' (Cl. ' || NEW.`codice_clone` || ') - P.I. ' || NEW.`codice_portainnesto` || ' - ' || NEW.`tipologia` || ' - ' || NEW.`cliente`;
END;
--> statement-breakpoint

-- 3. Aggiornamento lotti_magazzino (aggiunta riferimento_innesto, confezionamento, collocazione)
ALTER TABLE `lotti_magazzino` ADD `riferimento_innesto` text REFERENCES `innesti`(`riferimento_lotto_parlante`) ON UPDATE cascade ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `lotti_magazzino` ADD `confezionamento` text;
--> statement-breakpoint
ALTER TABLE `lotti_magazzino` ADD `collocazione` text;
--> statement-breakpoint

-- Trigger aggiornati per lotti_magazzino che includono confezionamento quando presente
DROP TRIGGER IF EXISTS `lotti_magazzino_riferimento_ins`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `lotti_magazzino_riferimento_upd`;
--> statement-breakpoint
CREATE TRIGGER `lotti_magazzino_riferimento_ins` AFTER INSERT ON `lotti_magazzino`
BEGIN
  UPDATE `lotti_magazzino` SET `riferimento_lotto_parlante` =
    NEW.`campagna` || ' - ' || NEW.`prodotto` || ' - ' || NEW.`codice_varieta` || ' (Cl. ' || NEW.`codice_clone` || ') - P.I. ' || NEW.`codice_portainnesto` || ' - ' || NEW.`tipologia` ||
    CASE WHEN NEW.`confezionamento` IS NOT NULL AND NEW.`confezionamento` != '' THEN ' - ' || NEW.`confezionamento` ELSE '' END
  WHERE `id` = NEW.`id` AND `riferimento_lotto_parlante` IS NOT
    NEW.`campagna` || ' - ' || NEW.`prodotto` || ' - ' || NEW.`codice_varieta` || ' (Cl. ' || NEW.`codice_clone` || ') - P.I. ' || NEW.`codice_portainnesto` || ' - ' || NEW.`tipologia` ||
    CASE WHEN NEW.`confezionamento` IS NOT NULL AND NEW.`confezionamento` != '' THEN ' - ' || NEW.`confezionamento` ELSE '' END;
END;
--> statement-breakpoint
CREATE TRIGGER `lotti_magazzino_riferimento_upd` AFTER UPDATE OF `campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia`, `confezionamento`, `riferimento_lotto_parlante` ON `lotti_magazzino`
BEGIN
  UPDATE `lotti_magazzino` SET `riferimento_lotto_parlante` =
    NEW.`campagna` || ' - ' || NEW.`prodotto` || ' - ' || NEW.`codice_varieta` || ' (Cl. ' || NEW.`codice_clone` || ') - P.I. ' || NEW.`codice_portainnesto` || ' - ' || NEW.`tipologia` ||
    CASE WHEN NEW.`confezionamento` IS NOT NULL AND NEW.`confezionamento` != '' THEN ' - ' || NEW.`confezionamento` ELSE '' END
  WHERE `id` = NEW.`id` AND `riferimento_lotto_parlante` IS NOT
    NEW.`campagna` || ' - ' || NEW.`prodotto` || ' - ' || NEW.`codice_varieta` || ' (Cl. ' || NEW.`codice_clone` || ') - P.I. ' || NEW.`codice_portainnesto` || ' - ' || NEW.`tipologia` ||
    CASE WHEN NEW.`confezionamento` IS NOT NULL AND NEW.`confezionamento` != '' THEN ' - ' || NEW.`confezionamento` ELSE '' END;
END;
--> statement-breakpoint

-- 4. Ricreazione anagrafica_personale con soprannome come chiave primaria
-- e inserimento_ore collegato a soprannome
CREATE TABLE `anagrafica_personale_new` (
	`soprannome` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`cognome` text NOT NULL,
	`nome_cognome` text DEFAULT '' NOT NULL,
	`data_di_nascita` text,
	`data_assunzione` text,
	`fine_assunzione` text,
	`data_visita_medica` text,
	`data_formazione_sicurezza` text,
	`data_patentino_muletto` text,
	`data_patentino_trattore` text,
	`data_rspp` text,
	`data_antincendio` text
);
--> statement-breakpoint
INSERT INTO `anagrafica_personale_new` (
  `soprannome`, `nome`, `cognome`, `nome_cognome`, `data_di_nascita`,
  `data_visita_medica`, `data_formazione_sicurezza`, `data_patentino_muletto`,
  `data_patentino_trattore`, `data_rspp`, `data_antincendio`
)
SELECT
  COALESCE(nome_cognome, nome), nome, cognome, nome_cognome, data_di_nascita,
  data_visita_medica, data_formazione_sicurezza, data_patentino_muletto,
  data_patentino_trattore, data_rspp, data_antincendio
FROM `anagrafica_personale`;
--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
DROP TABLE `anagrafica_personale`;
--> statement-breakpoint
ALTER TABLE `anagrafica_personale_new` RENAME TO `anagrafica_personale`;
--> statement-breakpoint

-- Ricreazione inserimento_ore con FK dipendente -> anagrafica_personale(soprannome)
CREATE TABLE `inserimento_ore_new` (
	`id` text PRIMARY KEY NOT NULL,
	`dipendente` text NOT NULL,
	`centro_di_costo` text NOT NULL,
	`attivita` text NOT NULL,
	`dettaglio_cdc` text,
	`numero_ore` real NOT NULL,
	`data_inserimento` text DEFAULT (CURRENT_DATE) NOT NULL,
	CHECK (`numero_ore` > 0),
	FOREIGN KEY (`dipendente`) REFERENCES `anagrafica_personale`(`soprannome`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`centro_di_costo`) REFERENCES `centri_di_costo`(`centro_di_costo`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`centro_di_costo`, `attivita`) REFERENCES `attivita_cdc`(`centro_di_costo`, `attivita`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`centro_di_costo`, `dettaglio_cdc`) REFERENCES `dettaglio_cdc`(`centro_di_costo`, `campo_varieta`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `inserimento_ore_new` SELECT * FROM `inserimento_ore`;
--> statement-breakpoint
DROP TABLE `inserimento_ore`;
--> statement-breakpoint
ALTER TABLE `inserimento_ore_new` RENAME TO `inserimento_ore`;
--> statement-breakpoint
CREATE INDEX `inserimento_ore_data_idx` ON `inserimento_ore` (`data_inserimento`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;

