/**
 * Script di importazione dati da Supabase a Cloudflare D1 (SQLite).
 *
 * Utilizzo:
 *   node scripts/import-from-supabase.mjs <SUPABASE_URL> <SUPABASE_SERVICE_ROLE_KEY> [--remote]
 *
 * Oppure creando un file `.env.supabase` nella cartella `apps/api/`:
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_KEY=eyJhbGciOi...
 * e avviando semplicemente:
 *   node scripts/import-from-supabase.mjs [--remote]
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Carica variabili da .env.supabase se presente
let envUrl = process.env.SUPABASE_URL;
let envKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const envFile = join(process.cwd(), '.env.supabase');
if (existsSync(envFile)) {
  const content = readFileSync(envFile, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [k, ...vParts] = trimmed.split('=');
    const key = k.trim();
    const val = vParts.join('=').trim().replace(/^["']|["']$/g, '');
    if (key === 'SUPABASE_URL') envUrl = val;
    if (key === 'SUPABASE_KEY' || key === 'SUPABASE_SERVICE_ROLE_KEY') envKey = val;
  }
}

const args = process.argv.slice(2);
const isRemote = args.includes('--remote');
const positionalArgs = args.filter((a) => !a.startsWith('--'));

const supabaseUrl = (positionalArgs[0] || envUrl || '').replace(/\/$/, '');
const supabaseKey = positionalArgs[1] || envKey || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('\nErrore: Specificare URL e Chiave di Supabase.');
  console.error('Uso: node scripts/import-from-supabase.mjs <SUPABASE_URL> <SUPABASE_KEY> [--remote]');
  console.error('Oppure definisci SUPABASE_URL e SUPABASE_KEY nel file apps/api/.env.supabase\n');
  process.exit(1);
}

// Ordine delle tabelle rispettando i vincoli di Foreign Key
const TABELLE_IMPORT = [
  'tipi_prodotto',
  'anagrafica_portainnesto',
  'anagrafica_vite',
  'centri_di_costo',
  'attivita_cdc',
  'dettaglio_cdc',
  'clienti',
  'anagrafica_personale',
  'lotti_magazzino',
  'ordine_impieghi',
  'inserimento_costi',
  'inserimento_ore',
];

function sqlVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function runD1Sql(sqlText, isRemoteTarget) {
  const tmpFile = join(process.cwd(), `.tmp-import-${Date.now()}.sql`);
  writeFileSync(tmpFile, sqlText, 'utf8');
  try {
    const wranglerArgs = [
      'wrangler',
      'd1',
      'execute',
      'gestione_magazzino',
      isRemoteTarget ? '--remote' : '--local',
      `--file=${tmpFile}`,
    ];
    execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', wranglerArgs, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {}
  }
}

async function fetchTable(tabella) {
  const url = `${supabaseUrl}/rest/v1/${tabella}?select=*`;
  const res = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 404) {
      console.warn(`[WARN] Tabella '${tabella}' non trovata su Supabase (404), saltata.`);
      return [];
    }
    const errText = await res.text().catch(() => '');
    throw new Error(`Errore fetch '${tabella}' HTTP ${res.status}: ${errText}`);
  }

  return res.json();
}

async function main() {
  console.log(`\nConnessione a Supabase in corso: ${supabaseUrl}`);
  console.log(`Target: Cloudflare D1 (${isRemote ? 'PRODUZIONE REMOTA' : 'LOCALE'})`);

  const sqlStatements = [];
  let recordTotali = 0;

  for (const tabella of TABELLE_IMPORT) {
    process.stdout.write(`Scaricamento tabella '${tabella}'... `);
    try {
      const records = await fetchTable(tabella);
      if (!Array.isArray(records) || records.length === 0) {
        console.log(`0 record trovati.`);
        continue;
      }

      console.log(`${records.length} record scaricati.`);
      recordTotali += records.length;

      for (const riga of records) {
        const chiavi = Object.keys(riga);
        const colonne = chiavi.map((k) => `"${k}"`).join(', ');
        const valori = chiavi.map((k) => sqlVal(riga[k])).join(', ');
        sqlStatements.push(`INSERT OR REPLACE INTO "${tabella}" (${colonne}) VALUES (${valori});`);
      }
    } catch (err) {
      console.error(`\nErrore durante lo scaricamento di '${tabella}':`, err.message);
    }
  }

  if (sqlStatements.length === 0) {
    console.log('\nNessun record da importare.');
    return;
  }

  console.log(`\nImportazione di ${recordTotali} record in Cloudflare D1...`);
  const fullSql = `
    PRAGMA foreign_keys = OFF;
    ${sqlStatements.join('\n')}
    PRAGMA foreign_keys = ON;
  `;

  runD1Sql(fullSql, isRemote);
  console.log(`\nOperazione completata con successo! ${recordTotali} record importati.\n`);
}

main().catch((err) => {
  console.error('\nErrore imprevisto durante la migrazione:', err);
  process.exit(1);
});

