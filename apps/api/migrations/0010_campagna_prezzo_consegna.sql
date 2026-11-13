-- 0010_campagna_prezzo_consegna.sql
-- 1. Aggiorna i valori di campagna da formato 'AAAA/AA' o 'AAAA/AAAA' a semplice anno a 4 cifre 'AAAA'
UPDATE `innesti` SET `campagna` = substr(`campagna`, 1, 4) WHERE `campagna` LIKE '____/%';
UPDATE `lotti_magazzino` SET `campagna` = substr(`campagna`, 1, 4) WHERE `campagna` LIKE '____/%';
UPDATE `ordine_impieghi` SET `campagna` = substr(`campagna`, 1, 4) WHERE `campagna` LIKE '____/%';

-- 2. Aggiungi colonne alla tabella ordine_impieghi:
--    - prezzo_vendita (real / numerico decimale facoltativo)
--    - indirizzo_consegna (text facoltativo)
ALTER TABLE `ordine_impieghi` ADD COLUMN `prezzo_vendita` real;
ALTER TABLE `ordine_impieghi` ADD COLUMN `indirizzo_consegna` text;

-- 3. Ricrea la vista disponibilita aggiornata
DROP VIEW IF EXISTS `disponibilita`;

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
