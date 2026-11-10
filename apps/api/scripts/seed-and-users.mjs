/**
 * Script CLI per:
 * 1) Creare o reimpostare la password di un account nominativo (`admin`, `commerciale`, `produttore`)
 * 2) Popolare il database D1 con il catalogo iniziale e record di prova per le 12 tabelle.
 *
 * Uso:
 *   node scripts/seed-and-users.mjs seed [--remote]
 *   node scripts/seed-and-users.mjs user <email> <password> <ruolo> "<nome>" [--remote]
 */
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPassword(password) {
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const enc = new TextEncoder();
  const keyMaterial = await webcrypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await webcrypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: ITERATIONS,
    },
    keyMaterial,
    KEY_BYTES * 8,
  );
  return `pbkdf2:${ITERATIONS}:${toHex(salt)}:${toHex(new Uint8Array(bits))}`;
}

function sqlString(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function runD1Sql(sqlText, isRemote) {
  const tmpFile = join(process.cwd(), `.tmp-d1-${Date.now()}.sql`);
  writeFileSync(tmpFile, sqlText, 'utf8');
  try {
    const args = [
      'wrangler',
      'd1',
      'execute',
      'gestione_magazzino',
      isRemote ? '--remote' : '--local',
      `--file=${tmpFile}`,
    ];
    execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {}
  }
}

const args = process.argv.slice(2);
const command = args[0];
const isRemote = args.includes('--remote');

if (command === 'user') {
  const [email, password, rawRuolo, rawNome] = args.slice(1).filter((a) => a !== '--remote');
  // Se il ruolo non è passato esplicitamente o è diverso da admin, usiamo admin
  const ruolo = rawRuolo === 'admin' ? 'admin' : (rawNome ? rawRuolo : 'admin');
  const nome = rawNome ?? (rawRuolo && rawRuolo !== 'admin' ? rawRuolo : 'Amministratore');

  if (!email || !password) {
    console.error('Uso: node scripts/seed-and-users.mjs user <email> <password> ["<nome>"] [--remote]');
    process.exit(1);
  }
  const hash = await hashPassword(password);
  const sql = `
    INSERT INTO utenti (email, nome, password_hash, ruolo, attivo)
    VALUES (${sqlString(email.toLowerCase())}, ${sqlString(nome)}, ${sqlString(hash)}, 'admin', 1)
    ON CONFLICT(email) DO UPDATE SET
      nome = excluded.nome,
      password_hash = excluded.password_hash,
      ruolo = 'admin',
      attivo = 1;
  `;
  runD1Sql(sql, isRemote);
  console.log(`Utente '${email}' (admin) creato o aggiornato con successo.`);
} else if (command === 'seed') {
  const adminHash = await hashPassword('AdminBarbatelle2026!');

  const sql = `
    -- Utente amministratore ad uso interno
    INSERT INTO utenti (id, email, nome, password_hash, ruolo, attivo) VALUES
      (1, 'admin@cooperativa.it', 'Federico Mori (Amministrazione)', ${sqlString(adminHash)}, 'admin', 1)
    ON CONFLICT(email) DO UPDATE SET
      password_hash = excluded.password_hash,
      ruolo = 'admin',
      nome = excluded.nome;

    -- Rimuovi eventuali utenti di altri ruoli se presenti
    DELETE FROM utenti WHERE email IN ('commerciale@cooperativa.it', 'rossi@cooperativa.it');

    -- Tipi prodotto
    INSERT OR IGNORE INTO tipi_prodotto (prodotto) VALUES
      ('Barbatella'),
      ('Portainnesto'),
      ('Gemma');

    -- Anagrafica Portainnesto
    INSERT OR IGNORE INTO anagrafica_portainnesto (codice_portainnesto) VALUES
      ('1103P'),
      ('SO4'),
      ('K5BB'),
      ('420A'),
      ('140Ru');

    -- Anagrafica Vite (varietà + cloni)
    INSERT OR IGNORE INTO anagrafica_vite (codice_varieta, codice_clone) VALUES
      ('Sangiovese', 'F9'),
      ('Sangiovese', 'R24'),
      ('Sangiovese', 'VCR 4'),
      ('Vermentino', 'VCR 1'),
      ('Vermentino', 'ICV 20'),
      ('Trebbiano', 'TR 3T'),
      ('Chardonnay', 'R8'),
      ('Merlot', 'R3');

    -- Centri di costo
    INSERT OR IGNORE INTO centri_di_costo (centro_di_costo) VALUES
      ('Vivaio Campo 1'),
      ('Vivaio Campo 2'),
      ('Serra Innesti'),
      ('Magazzino Frigo');

    -- Attività CdC
    INSERT OR IGNORE INTO attivita_cdc (id, centro_di_costo, attivita) VALUES
      ('att-1', 'Vivaio Campo 1', 'Lavorazione terreno'),
      ('att-2', 'Vivaio Campo 1', 'Trattamento antiparassitario'),
      ('att-3', 'Vivaio Campo 1', 'Estirpo barbatelle'),
      ('att-4', 'Serra Innesti', 'Innestatura a macchina'),
      ('att-5', 'Serra Innesti', 'Stratificazione a caldo'),
      ('att-6', 'Magazzino Frigo', 'Confezionamento e legatura');

    -- Dettaglio CdC
    INSERT OR IGNORE INTO dettaglio_cdc (id, centro_di_costo, campo, varieta, campo_varieta) VALUES
      ('det-1', 'Vivaio Campo 1', 'Settore A', 'Sangiovese', 'Settore A - Sangiovese'),
      ('det-2', 'Vivaio Campo 1', 'Settore B', 'Vermentino', 'Settore B - Vermentino'),
      ('det-3', 'Serra Innesti', 'Bancale 1', 'Chardonnay', 'Bancale 1 - Chardonnay');

    -- Clienti
    INSERT OR IGNORE INTO clienti (ragione_sociale, partita_iva, codice_fiscale, citta, indirizzo, numero_telefono) VALUES
      ('Tenuta Colli Romagnoli', '01234567890', '01234567890', 'Faenza', 'Via Roma 12', '0546 123456'),
      ('Cantina Sociale Val di Lamone', '02345678901', '02345678901', 'Brisighella', 'Via Firenze 45', '0546 987654'),
      ('Podere San Martino', '03456789012', '03456789012', 'Lugo', 'Via Emilia 88', '0545 443322');

    -- Anagrafica Personale
    INSERT OR IGNORE INTO anagrafica_personale (nome_cognome, nome, cognome, data_di_nascita, data_visita_medica, data_formazione_sicurezza, data_patentino_muletto, data_patentino_trattore, data_rspp, data_antincendio) VALUES
      ('Mario Rossi', 'Mario', 'Rossi', '1980-05-12', '2026-03-10', '2025-11-20', '2024-05-15', '2023-04-10', NULL, '2025-06-12'),
      ('Luigi Bianchi', 'Luigi', 'Bianchi', '1985-08-22', '2026-04-15', '2025-11-20', NULL, '2023-04-10', NULL, NULL),
      ('Anna Verdi', 'Anna', 'Verdi', '1992-11-03', '2026-02-18', '2025-11-20', '2025-01-15', NULL, NULL, NULL);

    -- Lotti Magazzino
    INSERT OR REPLACE INTO lotti_magazzino (id, data_inserimento, prodotto, codice_varieta, codice_clone, codice_portainnesto, campagna, quantita, note, provenienza, tipologia, riferimento_lotto_parlante) VALUES
      ('lot-1', '2026-10-15', 'Barbatella', 'Sangiovese', 'F9', '1103P', '2026/27', 8000, 'Primo innesto autunno', 'Prodotto', 'Nuova produzione', '2026/27 - Barbatella - Sangiovese (Cl. F9) - P.I. 1103P - Nuova produzione'),
      ('lot-2', '2026-10-20', 'Barbatella', 'Vermentino', 'VCR 1', '1103P', '2026/27', 5000, 'Lotto da selezione vivaio', 'Prodotto', 'Nuova produzione', '2026/27 - Barbatella - Vermentino (Cl. VCR 1) - P.I. 1103P - Nuova produzione'),
      ('lot-3', '2026-10-22', 'Barbatella', 'Trebbiano', 'TR 3T', 'K5BB', '2026/27', 3000, 'Innesto Kober', 'Prodotto', 'Nuova produzione', '2026/27 - Barbatella - Trebbiano (Cl. TR 3T) - P.I. K5BB - Nuova produzione'),
      ('lot-4', '2026-10-25', 'Barbatella', 'Chardonnay', 'R8', 'SO4', '2026/27', 1500, 'Lotto parziale', 'Prodotto', 'Nuova produzione', '2026/27 - Barbatella - Chardonnay (Cl. R8) - P.I. SO4 - Nuova produzione');

    -- Ordine Impieghi
    INSERT OR REPLACE INTO ordine_impieghi (id, riferimento_lotto, data_inserimento, prodotto, codice_varieta, codice_clone, codice_portainnesto, campagna, quantita, note, consegnato, cliente, tipologia) VALUES
      ('ord-1', '2026/27 - Barbatella - Sangiovese (Cl. F9) - P.I. 1103P - Nuova produzione', '2026-10-26', 'Barbatella', 'Sangiovese', 'F9', '1103P', '2026/27', 3500, 'Consegna prima tranche', 1, 'Tenuta Colli Romagnoli', 'Nuova produzione'),
      ('ord-2', '2026/27 - Barbatella - Sangiovese (Cl. F9) - P.I. 1103P - Nuova produzione', '2026-10-28', 'Barbatella', 'Sangiovese', 'F9', '1103P', '2026/27', 2000, 'Da consegnare entro dicembre', 0, 'Cantina Sociale Val di Lamone', 'Nuova produzione'),
      ('ord-3', '2026/27 - Barbatella - Chardonnay (Cl. R8) - P.I. SO4 - Nuova produzione', '2026-10-29', 'Barbatella', 'Chardonnay', 'R8', 'SO4', '2026/27', 4000, 'Richiesta urgente con scoperto', 0, 'Podere San Martino', 'Nuova produzione'),
      ('ord-4', NULL, '2026-10-30', 'Barbatella', 'Merlot', 'R3', '1103P', '2026/27', 1800, 'Ordine senza lotto coperto', 0, 'Podere San Martino', 'Nuova produzione');

    -- Inserimento Costi
    INSERT OR REPLACE INTO inserimento_costi (id, data, centro_di_costo, dettaglio_cdc, causale, note, campagna, importo) VALUES
      ('cos-1', '2026-10-10', 'Vivaio Campo 1', 'Settore A - Sangiovese', 'Concimazione', 'Concime organico azotato', '2026/27', 450.00),
      ('cos-2', '2026-10-18', 'Vivaio Campo 1', 'Settore A - Sangiovese', 'Trattamento', 'Trattamento rame e zolfo', '2026/27', 280.50),
      ('cos-3', '2026-10-24', 'Serra Innesti', 'Bancale 1 - Chardonnay', 'Acquisto', 'Materiale legacci biodegradabili', '2026/27', 120.00);

    -- Inserimento Ore
    INSERT OR REPLACE INTO inserimento_ore (id, dipendente, centro_di_costo, attivita, dettaglio_cdc, numero_ore, data_inserimento) VALUES
      ('ore-1', 'Mario Rossi', 'Vivaio Campo 1', 'Lavorazione terreno', 'Settore A - Sangiovese', 8, '2026-10-10'),
      ('ore-2', 'Luigi Bianchi', 'Vivaio Campo 1', 'Trattamento antiparassitario', 'Settore A - Sangiovese', 6.5, '2026-10-18'),
      ('ore-3', 'Anna Verdi', 'Serra Innesti', 'Innestatura a macchina', 'Bancale 1 - Chardonnay', 7.5, '2026-10-24');
  `;

  runD1Sql(sql, isRemote);
  console.log('Seed delle 12 tabelle completato con successo!');
} else {
  console.error('Comando non riconosciuto. Usa "seed" oppure "user".');
  process.exit(1);
}
