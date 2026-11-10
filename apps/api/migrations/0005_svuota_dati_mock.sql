-- Eliminazione dei dati mock/demo da tutte le tabelle operative e anagrafiche,
-- preservando l'utente amministratore (utenti) e le relative sessioni.

DELETE FROM `ordine_impieghi`;
--> statement-breakpoint
DELETE FROM `lotti_magazzino`;
--> statement-breakpoint
DELETE FROM `inserimento_ore`;
--> statement-breakpoint
DELETE FROM `inserimento_costi`;
--> statement-breakpoint
DELETE FROM `dettaglio_cdc`;
--> statement-breakpoint
DELETE FROM `attivita_cdc`;
--> statement-breakpoint
DELETE FROM `centri_di_costo`;
--> statement-breakpoint
DELETE FROM `clienti`;
--> statement-breakpoint
DELETE FROM `anagrafica_personale`;
--> statement-breakpoint
DELETE FROM `anagrafica_vite`;
--> statement-breakpoint
DELETE FROM `anagrafica_portainnesto`;
--> statement-breakpoint
DELETE FROM `tipi_prodotto`;
--> statement-breakpoint

-- Inserimento / aggiornamento dell'utente amministratore ufficiale
INSERT INTO `utenti` (`email`, `nome`, `password_hash`, `ruolo`, `attivo`)
VALUES ('fedemori.fm@gmail.com', 'Federico Mori', 'pbkdf2:100000:d155c7c07368fbbf3370bd007020ca72:77eacebedc97f52f25549801065d802b7b4e664ef4fe3cfa9683236fe019d309', 'admin', 1)
ON CONFLICT(`email`) DO UPDATE SET
  `password_hash` = excluded.`password_hash`,
  `nome` = excluded.`nome`,
  `ruolo` = 'admin',
  `attivo` = 1;

