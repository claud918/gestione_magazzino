-- Migration 0008: Vista Rese (innesti vs lotti magazzino)
DROP VIEW IF EXISTS `rese`;
--> statement-breakpoint
CREATE VIEW `rese` AS
WITH
  chiavi AS (
    SELECT `campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia` FROM `innesti`
    UNION
    SELECT `campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia` FROM `lotti_magazzino`
  ),
  innesti_agg AS (
    SELECT `campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia`,
      SUM(`quantita`) AS innestato
    FROM `innesti`
    GROUP BY `campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia`
  ),
  lotti_agg AS (
    SELECT `campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia`,
      SUM(`quantita`) AS qta
    FROM `lotti_magazzino`
    GROUP BY `campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia`
  )
SELECT
  k.`campagna`,
  k.`prodotto`,
  k.`codice_varieta`,
  k.`codice_clone`,
  k.`codice_portainnesto`,
  k.`tipologia`,
  COALESCE(i.innestato, 0) AS innestato,
  COALESCE(l.qta, 0) AS prodotto_qta,
  CASE
    WHEN COALESCE(i.innestato, 0) > 0 THEN ROUND((CAST(COALESCE(l.qta, 0) AS REAL) / i.innestato) * 100, 2)
    ELSE 0.0
  END AS resa
FROM chiavi k
LEFT JOIN innesti_agg i USING (`campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia`)
LEFT JOIN lotti_agg l USING (`campagna`, `prodotto`, `codice_varieta`, `codice_clone`, `codice_portainnesto`, `tipologia`);

