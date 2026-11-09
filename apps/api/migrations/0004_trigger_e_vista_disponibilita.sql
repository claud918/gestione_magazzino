-- Trigger che mantengono i campi "parlanti" e vista di disponibilità.
-- Le colonne sono normali (non GENERATED) perché SQLite non propaga gli ON UPDATE CASCADE
-- delle FK composite quando cambia una colonna generata: con i trigger, rinominare una
-- varietà o modificare un lotto aggiorna automaticamente anche gli ordini collegati.

-- dettaglio_cdc.campo_varieta = campo || ' - ' || varieta
CREATE TRIGGER `dettaglio_cdc_campo_varieta_ins` AFTER INSERT ON `dettaglio_cdc`
BEGIN
  UPDATE `dettaglio_cdc` SET `campo_varieta` = NEW.`campo` || ' - ' || NEW.`varieta`
  WHERE `id` = NEW.`id` AND `campo_varieta` IS NOT NEW.`campo` || ' - ' || NEW.`varieta`;
END;
--> statement-breakpoint
CREATE TRIGGER `dettaglio_cdc_campo_varieta_upd` AFTER UPDATE OF `campo`, `varieta`, `campo_varieta` ON `dettaglio_cdc`
BEGIN
  UPDATE `dettaglio_cdc` SET `campo_varieta` = NEW.`campo` || ' - ' || NEW.`varieta`
  WHERE `id` = NEW.`id` AND `campo_varieta` IS NOT NEW.`campo` || ' - ' || NEW.`varieta`;
END;
--> statement-breakpoint

-- lotti_magazzino.riferimento_lotto_parlante =
--   campagna - prodotto - varietà (Cl. clone) - P.I. portainnesto - tipologia
CREATE TRIGGER `lotti_magazzino_riferimento_ins` AFTER INSERT ON `lotti_magazzino`
BEGIN
  UPDATE `lotti_magazzino` SET `riferimento_lotto_parlante` =
    NEW.`campagna` || ' - ' || NEW.`prodotto` || ' - ' || NEW.`codice_varieta` || ' (Cl. ' || NEW.`codice_clone` || ') - P.I. ' || NEW.`codice_portainnesto` || ' - ' || NEW.`tipologia`
  WHERE `id` = NEW.`id` AND `riferimento_lotto_parlante` IS NOT
    NEW.`campagna` || ' - ' || NEW.`prodotto` || ' - ' || NEW.`codice_varieta` || ' (Cl. ' || NEW.`codice_clone` || ') - P.I. ' || NEW.`codice_portainnesto` || ' - ' || NEW.`tipologia`;
END;
--> statement-breakpoint
CREATE TRIGGER `lotti_magazzino_riferimento_upd` AFTER UPDATE OF `campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia`, `riferimento_lotto_parlante` ON `lotti_magazzino`
BEGIN
  UPDATE `lotti_magazzino` SET `riferimento_lotto_parlante` =
    NEW.`campagna` || ' - ' || NEW.`prodotto` || ' - ' || NEW.`codice_varieta` || ' (Cl. ' || NEW.`codice_clone` || ') - P.I. ' || NEW.`codice_portainnesto` || ' - ' || NEW.`tipologia`
  WHERE `id` = NEW.`id` AND `riferimento_lotto_parlante` IS NOT
    NEW.`campagna` || ' - ' || NEW.`prodotto` || ' - ' || NEW.`codice_varieta` || ' (Cl. ' || NEW.`codice_clone` || ') - P.I. ' || NEW.`codice_portainnesto` || ' - ' || NEW.`tipologia`;
END;
--> statement-breakpoint

-- Vista disponibilità per combinazione prodotto + varietà + clone + portainnesto + campagna + tipologia
--   prodotto_qta    = Σ quantità lotti
--   ordinato        = Σ quantità ordini
--   consegnato      = Σ quantità ordini consegnati
--   disponibile     = prodotto_qta − ordinato   (negativo = scoperto)
--   giacenza_fisica = prodotto_qta − consegnato
--   scoperto        = max(0, ordinato − prodotto_qta)
CREATE VIEW `disponibilita` AS
WITH
  chiavi AS (
    SELECT `campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia` FROM `lotti_magazzino`
    UNION
    SELECT `campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia` FROM `ordine_impieghi`
  ),
  lotti AS (
    SELECT `campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia`,
      SUM(`quantita`) AS qta
    FROM `lotti_magazzino`
    GROUP BY `campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia`
  ),
  ordini AS (
    SELECT `campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia`,
      SUM(`quantita`) AS ordinato,
      SUM(CASE WHEN `consegnato` = 1 THEN `quantita` ELSE 0 END) AS consegnato
    FROM `ordine_impieghi`
    GROUP BY `campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia`
  )
SELECT
  k.`campagna`,
  k.`prodotto`,
  k.`codice_varieta`,
  k.`codice_clone`,
  k.`codice_portainnesto`,
  k.`tipologia`,
  COALESCE(l.qta, 0) AS prodotto_qta,
  COALESCE(o.ordinato, 0) AS ordinato,
  COALESCE(o.consegnato, 0) AS consegnato,
  COALESCE(l.qta, 0) - COALESCE(o.ordinato, 0) AS disponibile,
  COALESCE(l.qta, 0) - COALESCE(o.consegnato, 0) AS giacenza_fisica,
  MAX(0, COALESCE(o.ordinato, 0) - COALESCE(l.qta, 0)) AS scoperto
FROM chiavi k
LEFT JOIN lotti l USING (`campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia`)
LEFT JOIN ordini o USING (`campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia`);
