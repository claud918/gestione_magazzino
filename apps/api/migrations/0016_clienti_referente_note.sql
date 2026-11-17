-- Aggiunta campi referente e note all'anagrafica clienti
ALTER TABLE `clienti` ADD COLUMN `referente` text;
ALTER TABLE `clienti` ADD COLUMN `note` text;
