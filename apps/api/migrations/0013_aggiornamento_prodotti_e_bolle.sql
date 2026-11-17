-- Migration 0013: Aggiunta corpo_libero a bolle_trasporto e aggiornamento denominazioni prodotti
ALTER TABLE `bolle_trasporto` ADD COLUMN `corpo_libero` text;
--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
-- 1. Inserimento nuove denominazioni in tipi_prodotto
INSERT OR IGNORE INTO `tipi_prodotto` (`prodotto`) VALUES ('Barbatelle innestate certificate');
--> statement-breakpoint
INSERT OR IGNORE INTO `tipi_prodotto` (`prodotto`) VALUES ('Barbatelle franche');
--> statement-breakpoint
INSERT OR IGNORE INTO `tipi_prodotto` (`prodotto`) VALUES ('Talee portainnesto 68/70');
--> statement-breakpoint
INSERT OR IGNORE INTO `tipi_prodotto` (`prodotto`) VALUES ('Talee portainnesto');
--> statement-breakpoint
INSERT OR IGNORE INTO `tipi_prodotto` (`prodotto`) VALUES ('Marze certificate');
--> statement-breakpoint
-- 2. Aggiornamento tabelle operative: innesti
UPDATE `innesti` SET `prodotto` = 'Barbatelle innestate certificate' WHERE `prodotto` = 'Barbatelle innestate';
--> statement-breakpoint
UPDATE `innesti` SET `prodotto` = 'Barbatelle franche' WHERE `prodotto` = 'Barbatelle selvatiche';
--> statement-breakpoint
UPDATE `innesti` SET `prodotto` = 'Talee portainnesto 68/70' WHERE `prodotto` = 'Pezzoni Barbatelloni';
--> statement-breakpoint
UPDATE `innesti` SET `prodotto` = 'Talee portainnesto' WHERE `prodotto` = 'Pezzoni Standard';
--> statement-breakpoint
UPDATE `innesti` SET `prodotto` = 'Marze certificate' WHERE `prodotto` = 'Marze';
--> statement-breakpoint
-- 3. Aggiornamento tabelle operative: lotti_magazzino
UPDATE `lotti_magazzino` SET `prodotto` = 'Barbatelle innestate certificate' WHERE `prodotto` = 'Barbatelle innestate';
--> statement-breakpoint
UPDATE `lotti_magazzino` SET `prodotto` = 'Barbatelle franche' WHERE `prodotto` = 'Barbatelle selvatiche';
--> statement-breakpoint
UPDATE `lotti_magazzino` SET `prodotto` = 'Talee portainnesto 68/70' WHERE `prodotto` = 'Pezzoni Barbatelloni';
--> statement-breakpoint
UPDATE `lotti_magazzino` SET `prodotto` = 'Talee portainnesto' WHERE `prodotto` = 'Pezzoni Standard';
--> statement-breakpoint
UPDATE `lotti_magazzino` SET `prodotto` = 'Marze certificate' WHERE `prodotto` = 'Marze';
--> statement-breakpoint
-- 4. Aggiornamento tabelle operative: ordine_impieghi
UPDATE `ordine_impieghi` SET `prodotto` = 'Barbatelle innestate certificate' WHERE `prodotto` = 'Barbatelle innestate';
--> statement-breakpoint
UPDATE `ordine_impieghi` SET `prodotto` = 'Barbatelle franche' WHERE `prodotto` = 'Barbatelle selvatiche';
--> statement-breakpoint
UPDATE `ordine_impieghi` SET `prodotto` = 'Talee portainnesto 68/70' WHERE `prodotto` = 'Pezzoni Barbatelloni';
--> statement-breakpoint
UPDATE `ordine_impieghi` SET `prodotto` = 'Talee portainnesto' WHERE `prodotto` = 'Pezzoni Standard';
--> statement-breakpoint
UPDATE `ordine_impieghi` SET `prodotto` = 'Marze certificate' WHERE `prodotto` = 'Marze';
--> statement-breakpoint
-- 5. Aggiornamento righe bolle
UPDATE `bolle_righe` SET `prodotto` = 'Barbatelle innestate certificate' WHERE `prodotto` = 'Barbatelle innestate';
--> statement-breakpoint
UPDATE `bolle_righe` SET `prodotto` = 'Barbatelle franche' WHERE `prodotto` = 'Barbatelle selvatiche';
--> statement-breakpoint
UPDATE `bolle_righe` SET `prodotto` = 'Talee portainnesto 68/70' WHERE `prodotto` = 'Pezzoni Barbatelloni';
--> statement-breakpoint
UPDATE `bolle_righe` SET `prodotto` = 'Talee portainnesto' WHERE `prodotto` = 'Pezzoni Standard';
--> statement-breakpoint
UPDATE `bolle_righe` SET `prodotto` = 'Marze certificate' WHERE `prodotto` = 'Marze';
--> statement-breakpoint
-- 6. Rimozione vecchie denominazioni da tipi_prodotto
DELETE FROM `tipi_prodotto` WHERE `prodotto` IN ('Barbatelle innestate', 'Barbatelle selvatiche', 'Pezzoni Barbatelloni', 'Pezzoni Standard', 'Marze');
--> statement-breakpoint
-- 7. Aggiornamento riferimenti testuali incrociati
UPDATE `lotti_magazzino` SET `riferimento_innesto` = replace(`riferimento_innesto`, 'Barbatelle innestate', 'Barbatelle innestate certificate') WHERE `riferimento_innesto` LIKE '%Barbatelle innestate%';
--> statement-breakpoint
UPDATE `lotti_magazzino` SET `riferimento_innesto` = replace(`riferimento_innesto`, 'Barbatelle selvatiche', 'Barbatelle franche') WHERE `riferimento_innesto` LIKE '%Barbatelle selvatiche%';
--> statement-breakpoint
UPDATE `lotti_magazzino` SET `riferimento_innesto` = replace(`riferimento_innesto`, 'Pezzoni Barbatelloni', 'Talee portainnesto 68/70') WHERE `riferimento_innesto` LIKE '%Pezzoni Barbatelloni%';
--> statement-breakpoint
UPDATE `lotti_magazzino` SET `riferimento_innesto` = replace(`riferimento_innesto`, 'Pezzoni Standard', 'Talee portainnesto') WHERE `riferimento_innesto` LIKE '%Pezzoni Standard%';
--> statement-breakpoint
UPDATE `lotti_magazzino` SET `riferimento_innesto` = replace(`riferimento_innesto`, ' - Marze - ', ' - Marze certificate - ') WHERE `riferimento_innesto` LIKE '% - Marze - %';
--> statement-breakpoint
UPDATE `ordine_impieghi` SET `riferimento_lotto` = replace(`riferimento_lotto`, 'Barbatelle innestate', 'Barbatelle innestate certificate') WHERE `riferimento_lotto` LIKE '%Barbatelle innestate%';
--> statement-breakpoint
UPDATE `ordine_impieghi` SET `riferimento_lotto` = replace(`riferimento_lotto`, 'Barbatelle selvatiche', 'Barbatelle franche') WHERE `riferimento_lotto` LIKE '%Barbatelle selvatiche%';
--> statement-breakpoint
UPDATE `ordine_impieghi` SET `riferimento_lotto` = replace(`riferimento_lotto`, 'Pezzoni Barbatelloni', 'Talee portainnesto 68/70') WHERE `riferimento_lotto` LIKE '%Pezzoni Barbatelloni%';
--> statement-breakpoint
UPDATE `ordine_impieghi` SET `riferimento_lotto` = replace(`riferimento_lotto`, 'Pezzoni Standard', 'Talee portainnesto') WHERE `riferimento_lotto` LIKE '%Pezzoni Standard%';
--> statement-breakpoint
UPDATE `ordine_impieghi` SET `riferimento_lotto` = replace(`riferimento_lotto`, ' - Marze - ', ' - Marze certificate - ') WHERE `riferimento_lotto` LIKE '% - Marze - %';
--> statement-breakpoint
-- 8. Ricalcolo stringhe riferimento_lotto_parlante
UPDATE `innesti` SET `riferimento_lotto_parlante` =
  `campagna` || ' - ' || `prodotto` || ' - ' || `codice_varieta` || ' (Cl. ' || `codice_clone` || ') - P.I. ' || `codice_portainnesto` || ' - ' || `tipologia` ||
  CASE WHEN `cliente` IS NOT NULL AND `cliente` != '' THEN ' - ' || `cliente` ELSE '' END;
--> statement-breakpoint
UPDATE `lotti_magazzino` SET `riferimento_lotto_parlante` =
  `campagna` || ' - ' || `prodotto` || ' - ' || `codice_varieta` || ' (Cl. ' || `codice_clone` || ') - P.I. ' || `codice_portainnesto` || ' - ' || `tipologia` ||
  CASE WHEN `confezionamento` IS NOT NULL AND `confezionamento` != '' THEN ' - ' || `confezionamento` ELSE '' END;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
