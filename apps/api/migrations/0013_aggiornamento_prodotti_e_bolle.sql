-- Migration 0013: Aggiunta corpo_libero a bolle_trasporto e aggiornamento denominazioni prodotti
ALTER TABLE `bolle_trasporto` ADD COLUMN `corpo_libero` text;
--> statement-breakpoint
-- 1. Disattiva temporaneamente i trigger per consentire l'aggiornamento coordinato dei riferimenti
DROP TRIGGER IF EXISTS `innesti_riferimento_upd`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `innesti_riferimento_ins`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `lotti_magazzino_riferimento_upd`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `lotti_magazzino_riferimento_ins`;
--> statement-breakpoint
-- 2. Salva temporaneamente i riferimenti innesto dei lotti magazzino e azzerali per non violare i vincoli FK
CREATE TABLE IF NOT EXISTS `_tmp_lotti_innesti` AS
SELECT `id`, `riferimento_innesto` FROM `lotti_magazzino` WHERE `riferimento_innesto` IS NOT NULL;
--> statement-breakpoint
UPDATE `lotti_magazzino` SET `riferimento_innesto` = NULL WHERE `riferimento_innesto` IS NOT NULL;
--> statement-breakpoint
-- 3. Inserimento nuove denominazioni in tipi_prodotto
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
-- 4. Aggiorna colonna prodotto in tutte le tabelle che referenziano tipi_prodotto
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
-- 5. Elimina le vecchie denominazioni da tipi_prodotto (ora non più referenziate)
DELETE FROM `tipi_prodotto` WHERE `prodotto` IN ('Barbatelle innestate', 'Barbatelle selvatiche', 'Pezzoni Barbatelloni', 'Pezzoni Standard', 'Marze');
--> statement-breakpoint
-- 6. Ricalcola le stringhe riferimento_lotto_parlante su innesti
UPDATE `innesti` SET `riferimento_lotto_parlante` =
  `campagna` || ' - ' || `prodotto` || ' - ' || `codice_varieta` || ' (Cl. ' || `codice_clone` || ') - P.I. ' || `codice_portainnesto` || ' - ' || `tipologia` || ' - ' || `cliente`;
--> statement-breakpoint
-- 7. Ricalcola le stringhe riferimento_lotto_parlante su lotti_magazzino
UPDATE `lotti_magazzino` SET `riferimento_lotto_parlante` =
  `campagna` || ' - ' || `prodotto` || ' - ' || `codice_varieta` || ' (Cl. ' || `codice_clone` || ') - P.I. ' || `codice_portainnesto` || ' - ' || `tipologia` ||
  CASE WHEN `confezionamento` IS NOT NULL AND `confezionamento` != '' THEN ' - ' || `confezionamento` ELSE '' END;
--> statement-breakpoint
-- 8. Aggiorna la tabella temporanea dei riferimenti innesto con le nuove denominazioni
UPDATE `_tmp_lotti_innesti` SET `riferimento_innesto` = replace(`riferimento_innesto`, 'Barbatelle innestate', 'Barbatelle innestate certificate') WHERE `riferimento_innesto` LIKE '%Barbatelle innestate%';
--> statement-breakpoint
UPDATE `_tmp_lotti_innesti` SET `riferimento_innesto` = replace(`riferimento_innesto`, 'Barbatelle selvatiche', 'Barbatelle franche') WHERE `riferimento_innesto` LIKE '%Barbatelle selvatiche%';
--> statement-breakpoint
UPDATE `_tmp_lotti_innesti` SET `riferimento_innesto` = replace(`riferimento_innesto`, 'Pezzoni Barbatelloni', 'Talee portainnesto 68/70') WHERE `riferimento_innesto` LIKE '%Pezzoni Barbatelloni%';
--> statement-breakpoint
UPDATE `_tmp_lotti_innesti` SET `riferimento_innesto` = replace(`riferimento_innesto`, 'Pezzoni Standard', 'Talee portainnesto') WHERE `riferimento_innesto` LIKE '%Pezzoni Standard%';
--> statement-breakpoint
UPDATE `_tmp_lotti_innesti` SET `riferimento_innesto` = replace(`riferimento_innesto`, ' - Marze - ', ' - Marze certificate - ') WHERE `riferimento_innesto` LIKE '% - Marze - %';
--> statement-breakpoint
-- 9. Ripristina i riferimenti innesto aggiornati su lotti_magazzino
UPDATE `lotti_magazzino` SET `riferimento_innesto` = (
  SELECT `t`.`riferimento_innesto` FROM `_tmp_lotti_innesti` `t` WHERE `t`.`id` = `lotti_magazzino`.`id`
) WHERE `id` IN (SELECT `id` FROM `_tmp_lotti_innesti`);
--> statement-breakpoint
DROP TABLE IF EXISTS `_tmp_lotti_innesti`;
--> statement-breakpoint
-- 10. Aggiorna le stringhe riferimento_lotto su ordine_impieghi
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
-- 11. Ricrea i trigger di innesti e lotti_magazzino
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
