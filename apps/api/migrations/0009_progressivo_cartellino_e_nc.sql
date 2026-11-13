PRAGMA foreign_keys=OFF;
--> statement-breakpoint
-- 1. Inserimento record 'NC' in anagrafica_vite, anagrafica_portainnesto e tipi_prodotto
INSERT OR IGNORE INTO `anagrafica_vite` (`codice_varieta`, `codice_clone`) VALUES ('NC', 'NC');
--> statement-breakpoint
INSERT OR IGNORE INTO `anagrafica_portainnesto` (`codice_portainnesto`) VALUES ('NC');
--> statement-breakpoint
INSERT OR IGNORE INTO `tipi_prodotto` (`prodotto`) VALUES ('Barbatelle innestate');
--> statement-breakpoint
INSERT OR IGNORE INTO `tipi_prodotto` (`prodotto`) VALUES ('Pezzoni Barbatelloni');
--> statement-breakpoint
INSERT OR IGNORE INTO `tipi_prodotto` (`prodotto`) VALUES ('Pezzoni Standard');
--> statement-breakpoint
INSERT OR IGNORE INTO `tipi_prodotto` (`prodotto`) VALUES ('Marze');
--> statement-breakpoint
-- 2. Aggiornamento ordine_impieghi: aggiunta progressivo_cartellino e rimozione vincolo FK su riferimento_lotto
DROP VIEW IF EXISTS `disponibilita`;
--> statement-breakpoint
CREATE TABLE `ordine_impieghi_new` (
	`id` text PRIMARY KEY NOT NULL,
	`riferimento_lotto` text,
	`data_inserimento` text DEFAULT (CURRENT_DATE) NOT NULL,
	`prodotto` text NOT NULL,
	`codice_varieta` text NOT NULL,
	`codice_clone` text NOT NULL,
	`codice_portainnesto` text NOT NULL,
	`campagna` text NOT NULL,
	`quantita` integer NOT NULL,
	`note` text,
	`consegnato` integer DEFAULT false NOT NULL,
	`cliente` text NOT NULL,
	`tipologia` text DEFAULT 'Nuova produzione' NOT NULL,
	`progressivo_cartellino` text,
	CHECK (`quantita` > 0),
	CHECK ("tipologia" IN ('Nuova produzione', 'Seconde', 'Frigoconservate', 'Ripiantate')),
	FOREIGN KEY (`prodotto`) REFERENCES `tipi_prodotto`(`prodotto`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`cliente`) REFERENCES `clienti`(`ragione_sociale`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`codice_portainnesto`) REFERENCES `anagrafica_portainnesto`(`codice_portainnesto`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`codice_varieta`, `codice_clone`) REFERENCES `anagrafica_vite`(`codice_varieta`, `codice_clone`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `ordine_impieghi_new` (
  `id`, `riferimento_lotto`, `data_inserimento`, `prodotto`,
  `codice_varieta`, `codice_clone`, `codice_portainnesto`, `campagna`,
  `quantita`, `note`, `consegnato`, `cliente`, `tipologia`, `progressivo_cartellino`
)
SELECT
  `id`, `riferimento_lotto`, `data_inserimento`, `prodotto`,
  `codice_varieta`, `codice_clone`, `codice_portainnesto`, `campagna`,
  `quantita`, `note`, `consegnato`, `cliente`, `tipologia`, NULL
FROM `ordine_impieghi`;
--> statement-breakpoint
DROP TABLE `ordine_impieghi`;
--> statement-breakpoint
ALTER TABLE `ordine_impieghi_new` RENAME TO `ordine_impieghi`;
--> statement-breakpoint
CREATE INDEX `ordine_impieghi_cliente_idx` ON `ordine_impieghi` (`cliente`);
--> statement-breakpoint
-- 3. Ricrea vista disponibilita
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
--> statement-breakpoint
PRAGMA foreign_keys=ON;

