CREATE TABLE `cloni` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`varieta_id` integer NOT NULL,
	`codice` text NOT NULL,
	`attivo` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`varieta_id`) REFERENCES `varieta`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cloni_varieta_codice_uq` ON `cloni` (`varieta_id`,`codice`);--> statement-breakpoint
CREATE INDEX `cloni_varieta_idx` ON `cloni` (`varieta_id`);--> statement-breakpoint
CREATE TABLE `conferimenti_lotti` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`socio_id` integer NOT NULL,
	`varieta_id` integer NOT NULL,
	`clone_id` integer NOT NULL,
	`portainnesto_id` integer NOT NULL,
	`codice_lotto` text,
	`quantita_conferita` integer NOT NULL,
	`data_conferimento` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`socio_id`) REFERENCES `soci`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`varieta_id`) REFERENCES `varieta`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`clone_id`) REFERENCES `cloni`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`portainnesto_id`) REFERENCES `portainnesti`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `conferimenti_combinazione_idx` ON `conferimenti_lotti` (`varieta_id`,`clone_id`,`portainnesto_id`);--> statement-breakpoint
CREATE INDEX `conferimenti_socio_idx` ON `conferimenti_lotti` (`socio_id`);--> statement-breakpoint
CREATE TABLE `login_tentativi` (
	`ip` text PRIMARY KEY NOT NULL,
	`tentativi` integer DEFAULT 0 NOT NULL,
	`finestra_start` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ordini_clienti` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cliente_nome` text NOT NULL,
	`stato` text DEFAULT 'confermato' NOT NULL,
	`data_ordine` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ordini_stato_idx` ON `ordini_clienti` (`stato`);--> statement-breakpoint
CREATE TABLE `portainnesti` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`codice` text NOT NULL,
	`descrizione` text,
	`attivo` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portainnesti_codice_uq` ON `portainnesti` (`codice`);--> statement-breakpoint
CREATE TABLE `righe_ordine` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ordine_id` integer NOT NULL,
	`varieta_id` integer NOT NULL,
	`clone_id` integer NOT NULL,
	`portainnesto_id` integer NOT NULL,
	`quantita_ordinata` integer NOT NULL,
	`quantita_spedita` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`ordine_id`) REFERENCES `ordini_clienti`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`varieta_id`) REFERENCES `varieta`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`clone_id`) REFERENCES `cloni`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`portainnesto_id`) REFERENCES `portainnesti`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `righe_ordine_ordine_idx` ON `righe_ordine` (`ordine_id`);--> statement-breakpoint
CREATE INDEX `righe_ordine_combinazione_idx` ON `righe_ordine` (`varieta_id`,`clone_id`,`portainnesto_id`);--> statement-breakpoint
CREATE TABLE `sessioni` (
	`id` text PRIMARY KEY NOT NULL,
	`utente_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`utente_id`) REFERENCES `utenti`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessioni_utente_idx` ON `sessioni` (`utente_id`);--> statement-breakpoint
CREATE TABLE `soci` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`note` text,
	`attivo` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `soci_nome_uq` ON `soci` (`nome`);--> statement-breakpoint
CREATE TABLE `utenti` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`nome` text NOT NULL,
	`password_hash` text NOT NULL,
	`ruolo` text NOT NULL,
	`socio_id` integer,
	`attivo` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`socio_id`) REFERENCES `soci`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `utenti_email_uq` ON `utenti` (`email`);--> statement-breakpoint
CREATE TABLE `varieta` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`attiva` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `varieta_nome_uq` ON `varieta` (`nome`);