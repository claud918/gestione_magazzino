/**
 * Script CLI per:
 * 1) Creare o reimpostare la password di un account nominativo (`admin`, `commerciale`, `produttore`)
 * 2) Popolare il database D1 con il catalogo iniziale e record di prova per le 12 tabelle.
 *
 * Uso:
 *   node scripts/seed-and-users.mjs seed [--remote]
 *   node scripts/seed-and-users.mjs user <email> <password> <ruolo> "<nome>" [--remote]
 */
import { execFileSync, execSync } from 'node:child_process';
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
    const remoteFlag = isRemote ? '--remote' : '--local';
    const cmd = `npx.cmd wrangler d1 execute gestione_magazzino ${remoteFlag} --file="${tmpFile}"`;
    if (process.platform === 'win32') {
      execSync(cmd, { stdio: 'inherit' });
    } else {
      execSync(`npx wrangler d1 execute gestione_magazzino ${remoteFlag} --file="${tmpFile}"`, { stdio: 'inherit' });
    }
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
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!seedPassword || seedPassword.length < 12) {
    console.error('Imposta la variabile SEED_ADMIN_PASSWORD (min. 12 caratteri) prima di eseguire il seed.');
    process.exit(1);
  }
  const adminHash = await hashPassword(seedPassword);

  const sql = `
    -- Utente amministratore ad uso interno
    INSERT INTO utenti (id, email, nome, password_hash, ruolo, attivo) VALUES
      (1, 'fedemori.fm@gmail.com', 'Federico Mori', ${sqlString(adminHash)}, 'admin', 1)
    ON CONFLICT(email) DO UPDATE SET
      password_hash = excluded.password_hash,
      ruolo = 'admin',
      nome = excluded.nome;

    -- Rimuovi eventuali utenti di altri ruoli se presenti
    DELETE FROM utenti WHERE email IN ('commerciale@cooperativa.it', 'rossi@cooperativa.it');

    -- Tipi prodotto
    INSERT OR IGNORE INTO tipi_prodotto (prodotto) VALUES
      ('Barbatelle innestate'),
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
    INSERT OR IGNORE INTO anagrafica_personale (soprannome, nome, cognome, nome_cognome, data_assunzione, fine_assunzione, data_di_nascita, data_visita_medica, data_formazione_sicurezza, data_patentino_muletto, data_patentino_trattore, data_rspp, data_antincendio) VALUES
      ('Mario', 'Mario', 'Rossi', 'Mario Rossi', '2020-03-01', NULL, '1980-05-12', '2026-03-10', '2025-11-20', '2024-05-15', '2023-04-10', NULL, '2025-06-12'),
      ('Luigi', 'Luigi', 'Bianchi', 'Luigi Bianchi', '2022-04-15', NULL, '1985-08-22', '2026-04-15', '2025-11-20', NULL, '2023-04-10', NULL, NULL),
      ('Anna', 'Anna', 'Verdi', 'Anna Verdi', '2024-01-10', NULL, '1992-11-03', '2026-02-18', '2025-11-20', '2025-01-15', NULL, NULL, NULL);

    -- Innesti
    INSERT OR REPLACE INTO innesti (id, data_inserimento, prodotto, codice_varieta, codice_clone, codice_portainnesto, campagna, quantita, note, cliente, tipologia, riferimento_lotto_parlante) VALUES
      ('inn-1', '2026-10-10', 'Barbatelle innestate', 'Sangiovese', 'F9', '1103P', '2026/27', 10000, 'Innesto su ordinazione Tenuta Colli', 'Tenuta Colli Romagnoli', 'Nuova produzione', '2026/27 - Barbatelle innestate - Sangiovese (Cl. F9) - P.I. 1103P - Nuova produzione - Tenuta Colli Romagnoli'),
      ('inn-2', '2026-10-12', 'Barbatelle innestate', 'Vermentino', 'VCR 1', '1103P', '2026/27', 6000, 'Innesto Cantina Val di Lamone', 'Cantina Sociale Val di Lamone', 'Nuova produzione', '2026/27 - Barbatelle innestate - Vermentino (Cl. VCR 1) - P.I. 1103P - Nuova produzione - Cantina Sociale Val di Lamone');

    -- Lotti Magazzino
    INSERT OR REPLACE INTO lotti_magazzino (id, riferimento_innesto, data_inserimento, prodotto, codice_varieta, codice_clone, codice_portainnesto, campagna, quantita, confezionamento, collocazione, note, provenienza, tipologia, riferimento_lotto_parlante) VALUES
      ('lot-1', '2026/27 - Barbatelle innestate - Sangiovese (Cl. F9) - P.I. 1103P - Nuova produzione - Tenuta Colli Romagnoli', '2026-10-15', 'Barbatelle innestate', 'Sangiovese', 'F9', '1103P', '2026/27', 8000, 'Cassa 500', 'Cella A-1', 'Primo innesto autunno', 'Prodotto', 'Nuova produzione', '2026/27 - Barbatelle innestate - Sangiovese (Cl. F9) - P.I. 1103P - Nuova produzione - Cassa 500'),
      ('lot-2', '2026/27 - Barbatelle innestate - Vermentino (Cl. VCR 1) - P.I. 1103P - Nuova produzione - Cantina Sociale Val di Lamone', '2026-10-20', 'Barbatelle innestate', 'Vermentino', 'VCR 1', '1103P', '2026/27', 5000, 'Cassa 250', 'Cella A-2', 'Lotto da selezione vivaio', 'Prodotto', 'Nuova produzione', '2026/27 - Barbatelle innestate - Vermentino (Cl. VCR 1) - P.I. 1103P - Nuova produzione - Cassa 250'),
      ('lot-3', NULL, '2026-10-22', 'Barbatelle innestate', 'Trebbiano', 'TR 3T', 'K5BB', '2026/27', 3000, 'Mazzi da 25', 'Cella B-1', 'Innesto Kober', 'Prodotto', 'Nuova produzione', '2026/27 - Barbatelle innestate - Trebbiano (Cl. TR 3T) - P.I. K5BB - Nuova produzione - Mazzi da 25'),
      ('lot-4', NULL, '2026-10-25', 'Barbatelle innestate', 'Chardonnay', 'R8', 'SO4', '2026/27', 1500, 'Sfuso', 'Cella B-3', 'Lotto parziale', 'Prodotto', 'Nuova produzione', '2026/27 - Barbatelle innestate - Chardonnay (Cl. R8) - P.I. SO4 - Nuova produzione - Sfuso');

    -- Ordine Impieghi
    INSERT OR REPLACE INTO ordine_impieghi (id, riferimento_lotto, data_inserimento, prodotto, codice_varieta, codice_clone, codice_portainnesto, campagna, quantita, note, consegnato, cliente, tipologia) VALUES
      ('ord-1', '2026/27 - Barbatelle innestate - Sangiovese (Cl. F9) - P.I. 1103P - Nuova produzione - Cassa 500', '2026-10-26', 'Barbatelle innestate', 'Sangiovese', 'F9', '1103P', '2026/27', 3500, 'Consegna prima tranche', 1, 'Tenuta Colli Romagnoli', 'Nuova produzione'),
      ('ord-2', '2026/27 - Barbatelle innestate - Sangiovese (Cl. F9) - P.I. 1103P - Nuova produzione - Cassa 500', '2026-10-28', 'Barbatelle innestate', 'Sangiovese', 'F9', '1103P', '2026/27', 2000, 'Da consegnare entro dicembre', 0, 'Cantina Sociale Val di Lamone', 'Nuova produzione'),
      ('ord-3', '2026/27 - Barbatelle innestate - Chardonnay (Cl. R8) - P.I. SO4 - Nuova produzione - Sfuso', '2026-10-29', 'Barbatelle innestate', 'Chardonnay', 'R8', 'SO4', '2026/27', 4000, 'Richiesta urgente con scoperto', 0, 'Podere San Martino', 'Nuova produzione'),
      ('ord-4', NULL, '2026-10-30', 'Barbatelle innestate', 'Merlot', 'R3', '1103P', '2026/27', 1800, 'Ordine senza lotto coperto', 0, 'Podere San Martino', 'Nuova produzione');

    -- Inserimento Costi
    INSERT OR REPLACE INTO inserimento_costi (id, data, centro_di_costo, dettaglio_cdc, causale, note, campagna, importo) VALUES
      ('cos-1', '2026-10-10', 'Vivaio Campo 1', 'Settore A - Sangiovese', 'Concimazione', 'Concime organico azotato', '2026/27', 450.00),
      ('cos-2', '2026-10-18', 'Vivaio Campo 1', 'Settore A - Sangiovese', 'Trattamento', 'Trattamento rame e zolfo', '2026/27', 280.50),
      ('cos-3', '2026-10-24', 'Serra Innesti', 'Bancale 1 - Chardonnay', 'Acquisto', 'Materiale legacci biodegradabili', '2026/27', 120.00);

    -- Inserimento Ore
    INSERT OR REPLACE INTO inserimento_ore (id, dipendente, centro_di_costo, attivita, dettaglio_cdc, numero_ore, data_inserimento) VALUES
      ('ore-1', 'Mario', 'Vivaio Campo 1', 'Lavorazione terreno', 'Settore A - Sangiovese', 8, '2026-10-10'),
      ('ore-2', 'Luigi', 'Vivaio Campo 1', 'Trattamento antiparassitario', 'Settore A - Sangiovese', 6.5, '2026-10-18'),
      ('ore-3', 'Anna', 'Serra Innesti', 'Innestatura a macchina', 'Bancale 1 - Chardonnay', 7.5, '2026-10-24');
  `;

  runD1Sql(sql, isRemote);
  console.log('Seed delle 12 tabelle completato con successo!');
} else if (command === 'clean' || command === 'svuota') {
  const sql = `
    DELETE FROM ordine_impieghi;
    DELETE FROM lotti_magazzino;
    DELETE FROM innesti;
    DELETE FROM inserimento_ore;
    DELETE FROM inserimento_costi;
    DELETE FROM dettaglio_cdc;
    DELETE FROM attivita_cdc;
    DELETE FROM centri_di_costo;
    DELETE FROM clienti;
    DELETE FROM anagrafica_personale;
    DELETE FROM anagrafica_vite;
    DELETE FROM anagrafica_portainnesto;
    DELETE FROM tipi_prodotto;
  `;
  runD1Sql(sql, isRemote);
  console.log('Dati mockati eliminati con successo (utente amministratore preservato)!');
} else {
  console.error('Comando non riconosciuto. Usa "seed", "clean" oppure "user".');
  process.exit(1);
}
