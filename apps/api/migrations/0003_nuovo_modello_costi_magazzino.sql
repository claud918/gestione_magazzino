CREATE TABLE `anagrafica_personale` (
	`nome_cognome` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`cognome` text NOT NULL,
	`data_di_nascita` text NOT NULL,
	`data_visita_medica` text,
	`data_formazione_sicurezza` text,
	`data_patentino_muletto` text,
	`data_patentino_trattore` text,
	`data_rspp` text,
	`data_antincendio` text
);
--> statement-breakpoint
CREATE TABLE `anagrafica_portainnesto` (
	`codice_portainnesto` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `anagrafica_vite` (
	`codice_varieta` text NOT NULL,
	`codice_clone` text NOT NULL,
	PRIMARY KEY(`codice_varieta`, `codice_clone`)
);
--> statement-breakpoint
CREATE TABLE `attivita_cdc` (
	`id` text PRIMARY KEY NOT NULL,
	`centro_di_costo` text NOT NULL,
	`attivita` text NOT NULL,
	FOREIGN KEY (`centro_di_costo`) REFERENCES `centri_di_costo`(`centro_di_costo`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attivita_cdc_cdc_attivita_uq` ON `attivita_cdc` (`centro_di_costo`,`attivita`);--> statement-breakpoint
CREATE TABLE `centri_di_costo` (
	`centro_di_costo` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `clienti` (
	`ragione_sociale` text PRIMARY KEY NOT NULL,
	`partita_iva` text,
	`codice_fiscale` text,
	`citta` text,
	`indirizzo` text,
	`numero_telefono` text
);
--> statement-breakpoint
CREATE TABLE `dettaglio_cdc` (
	`id` text PRIMARY KEY NOT NULL,
	`centro_di_costo` text NOT NULL,
	`campo` text NOT NULL,
	`varieta` text NOT NULL,
	`campo_varieta` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`centro_di_costo`) REFERENCES `centri_di_costo`(`centro_di_costo`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dettaglio_cdc_campo_varieta_uq` ON `dettaglio_cdc` (`campo_varieta`);--> statement-breakpoint
CREATE UNIQUE INDEX `dettaglio_cdc_cdc_campo_varieta_uq` ON `dettaglio_cdc` (`centro_di_costo`,`campo_varieta`);--> statement-breakpoint
CREATE TABLE `inserimento_costi` (
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
	CONSTRAINT "inserimento_costi_causale_check" CHECK("inserimento_costi"."causale" IN ('Acquisto', 'Concimazione', 'Trattamento', 'Manodopera'))
);
--> statement-breakpoint
CREATE INDEX `inserimento_costi_data_idx` ON `inserimento_costi` (`data`);--> statement-breakpoint
CREATE TABLE `inserimento_ore` (
	`id` text PRIMARY KEY NOT NULL,
	`dipendente` text NOT NULL,
	`centro_di_costo` text NOT NULL,
	`attivita` text NOT NULL,
	`dettaglio_cdc` text,
	`numero_ore` real NOT NULL,
	`data_inserimento` text DEFAULT (CURRENT_DATE) NOT NULL,
	FOREIGN KEY (`dipendente`) REFERENCES `anagrafica_personale`(`nome_cognome`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`centro_di_costo`) REFERENCES `centri_di_costo`(`centro_di_costo`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`centro_di_costo`,`attivita`) REFERENCES `attivita_cdc`(`centro_di_costo`,`attivita`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`centro_di_costo`,`dettaglio_cdc`) REFERENCES `dettaglio_cdc`(`centro_di_costo`,`campo_varieta`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "inserimento_ore_numero_ore_check" CHECK("inserimento_ore"."numero_ore" > 0)
);
--> statement-breakpoint
CREATE INDEX `inserimento_ore_data_idx` ON `inserimento_ore` (`data_inserimento`);--> statement-breakpoint
CREATE TABLE `lotti_magazzino` (
	`id` text PRIMARY KEY NOT NULL,
	`data_inserimento` text DEFAULT (CURRENT_DATE) NOT NULL,
	`prodotto` text NOT NULL,
	`codice_varieta` text NOT NULL,
	`codice_clone` text NOT NULL,
	`codice_portainnesto` text NOT NULL,
	`campagna` text NOT NULL,
	`quantita` integer NOT NULL,
	`note` text,
	`provenienza` text NOT NULL,
	`riferimento_lotto_parlante` text DEFAULT '' NOT NULL,
	`tipologia` text DEFAULT 'Nuova produzione' NOT NULL,
	FOREIGN KEY (`prodotto`) REFERENCES `tipi_prodotto`(`prodotto`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`codice_portainnesto`) REFERENCES `anagrafica_portainnesto`(`codice_portainnesto`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`codice_varieta`,`codice_clone`) REFERENCES `anagrafica_vite`(`codice_varieta`,`codice_clone`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "lotti_magazzino_quantita_check" CHECK("lotti_magazzino"."quantita" >= 0),
	CONSTRAINT "lotti_magazzino_provenienza_check" CHECK("lotti_magazzino"."provenienza" IN ('Prodotto', 'Acquistato')),
	CONSTRAINT "lotti_magazzino_tipologia_check" CHECK("tipologia" IN ('Nuova produzione', 'Seconde', 'Frigoconservate', 'Ripiantate'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lotti_magazzino_riferimento_uq` ON `lotti_magazzino` (`riferimento_lotto_parlante`);--> statement-breakpoint
CREATE UNIQUE INDEX `lotti_magazzino_combinazione_uq` ON `lotti_magazzino` (`riferimento_lotto_parlante`,`campagna`,`prodotto`,`codice_varieta`,`codice_clone`,`codice_portainnesto`,`tipologia`);--> statement-breakpoint
CREATE TABLE `ordine_impieghi` (
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
	FOREIGN KEY (`prodotto`) REFERENCES `tipi_prodotto`(`prodotto`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`codice_portainnesto`) REFERENCES `anagrafica_portainnesto`(`codice_portainnesto`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`cliente`) REFERENCES `clienti`(`ragione_sociale`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`codice_varieta`,`codice_clone`) REFERENCES `anagrafica_vite`(`codice_varieta`,`codice_clone`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`riferimento_lotto`,`campagna`,`prodotto`,`codice_varieta`,`codice_clone`,`codice_portainnesto`,`tipologia`) REFERENCES `lotti_magazzino`(`riferimento_lotto_parlante`,`campagna`,`prodotto`,`codice_varieta`,`codice_clone`,`codice_portainnesto`,`tipologia`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "ordine_impieghi_quantita_check" CHECK("ordine_impieghi"."quantita" > 0),
	CONSTRAINT "ordine_impieghi_tipologia_check" CHECK("tipologia" IN ('Nuova produzione', 'Seconde', 'Frigoconservate', 'Ripiantate'))
);
--> statement-breakpoint
CREATE INDEX `ordine_impieghi_cliente_idx` ON `ordine_impieghi` (`cliente`);--> statement-breakpoint
CREATE TABLE `tipi_prodotto` (
	`prodotto` text PRIMARY KEY NOT NULL
);
