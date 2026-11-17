-- Migration 0015: Aggiunta aliquota_iva su ciascuna riga fattura
ALTER TABLE `fatture_righe` ADD COLUMN `aliquota_iva` real NOT NULL DEFAULT 10;
