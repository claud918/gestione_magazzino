-- Migration 0018: data_consegna su ordine_impieghi, note su anagrafica_portainnesto, destinazione e note su anagrafica_vite

ALTER TABLE `ordine_impieghi` ADD COLUMN `data_consegna` text;
--> statement-breakpoint
ALTER TABLE `anagrafica_portainnesto` ADD COLUMN `note` text;
--> statement-breakpoint
ALTER TABLE `anagrafica_vite` ADD COLUMN `destinazione` text CHECK (`destinazione` IS NULL OR `destinazione` IN ('Uva tavola', 'Uva vino'));
--> statement-breakpoint
ALTER TABLE `anagrafica_vite` ADD COLUMN `note` text;
