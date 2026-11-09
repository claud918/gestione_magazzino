CREATE TABLE `segnalazioni_soci` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`socio_id` integer NOT NULL,
	`varieta_id` integer NOT NULL,
	`clone_id` integer NOT NULL,
	`portainnesto_id` integer NOT NULL,
	`quantita_proposta` integer NOT NULL,
	`stato` text DEFAULT 'aperta' NOT NULL,
	`note` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`socio_id`) REFERENCES `soci`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`varieta_id`) REFERENCES `varieta`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`clone_id`) REFERENCES `cloni`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`portainnesto_id`) REFERENCES `portainnesti`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `segnalazioni_stato_idx` ON `segnalazioni_soci` (`stato`);--> statement-breakpoint
CREATE INDEX `segnalazioni_socio_idx` ON `segnalazioni_soci` (`socio_id`);