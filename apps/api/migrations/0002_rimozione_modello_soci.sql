-- Sostituzione del vecchio modello (soci/conferimenti/ordini) con il nuovo modello
-- costi/ore/lotti/ordini_impieghi (vedi docs/adr/0007). Ordine: prima le tabelle figlie.
-- Nota: la ricostruzione di `utenti` invalida le sessioni attive (nuovo login richiesto).
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
DROP TABLE `righe_ordine`;--> statement-breakpoint
DROP TABLE `ordini_clienti`;--> statement-breakpoint
DROP TABLE `segnalazioni_soci`;--> statement-breakpoint
DROP TABLE `conferimenti_lotti`;--> statement-breakpoint
DROP TABLE `cloni`;--> statement-breakpoint
DROP TABLE `varieta`;--> statement-breakpoint
DROP TABLE `portainnesti`;--> statement-breakpoint
DROP TABLE `soci`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_utenti` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`nome` text NOT NULL,
	`password_hash` text NOT NULL,
	`ruolo` text NOT NULL,
	`attivo` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_utenti`("id", "email", "nome", "password_hash", "ruolo", "attivo", "created_at") SELECT "id", "email", "nome", "password_hash", "ruolo", "attivo", "created_at" FROM `utenti`;--> statement-breakpoint
DROP TABLE `utenti`;--> statement-breakpoint
ALTER TABLE `__new_utenti` RENAME TO `utenti`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `utenti_email_uq` ON `utenti` (`email`);