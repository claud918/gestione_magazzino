/**
 * Metadati delle tabelle gestite dall'interfaccia CRUD (desktop e smartphone).
 *
 * È l'unica fonte di verità condivisa tra:
 * - API (apps/api): whitelist di tabelle/colonne, validazione, campi calcolati;
 * - Frontend (apps/web): colonne delle tabelle, schede mobile e maschere di inserimento.
 *
 * Regole:
 * - i campi `automatico` (id uuid) non sono mai mostrati nelle maschere né nelle tabelle;
 * - i campi `calcolato` sono derivati lato server (vedi `calcolaCampiDerivati`) e sono in sola lettura.
 */

export const NOMI_TABELLE = [
  'inserimento_costi',
  'inserimento_ore',
  'centri_di_costo',
  'attivita_cdc',
  'dettaglio_cdc',
  'anagrafica_personale',
  'innesti',
  'lotti_magazzino',
  'ordine_impieghi',
  'clienti',
  'anagrafica_vite',
  'anagrafica_portainnesto',
  'tipi_prodotto',
] as const;
export type NomeTabella = (typeof NOMI_TABELLE)[number];

export const CAUSALI_COSTO = ['Acquisto', 'Concimazione', 'Trattamento', 'Manodopera'] as const;
export const PROVENIENZE_LOTTO = ['Prodotto', 'Acquistato'] as const;
export const TIPOLOGIE_PRODOTTO = [
  'Nuova produzione',
  'Seconde',
  'Frigoconservate',
  'Ripiantate',
] as const;

export type TipoCampo =
  | 'testo'
  | 'testo_lungo'
  | 'data'
  | 'numero'
  | 'intero'
  | 'valuta'
  | 'booleano'
  | 'scelta'
  | 'riferimento'
  | 'campagna';

export interface RiferimentoCampo {
  /** Tabella da cui leggere i valori ammessi */
  tabella: NomeTabella;
  /** Colonna della tabella referenziata che contiene il valore */
  colonna: string;
  /**
   * Menu a cascata: le opzioni sono filtrate mostrando solo le righe in cui
   * `rif[colonnaRif] === form[campo]` (es. Clone filtrato per Varietà).
   */
  filtro?: { campo: string; colonnaRif: string };
  /**
   * Selezionando un valore, questi campi del form vengono compilati con i valori
   * della riga referenziata e bloccati (es. Ordine → Lotto).
   */
  compila?: string[];
}

export interface CampoTabella {
  nome: string;
  etichetta: string;
  tipo: TipoCampo;
  obbligatorio?: boolean;
  /** Valori ammessi per i campi `scelta` (CHECK del database) */
  opzioni?: readonly string[];
  riferimento?: RiferimentoCampo;
  /** id uuid generato automaticamente: mai visibile nelle maschere */
  automatico?: boolean;
  /** Valore derivato lato server da altri campi: sola lettura */
  calcolato?: boolean;
  /** Valore iniziale proposto nella maschera di inserimento */
  predefinito?: 'oggi' | 'campagna_corrente' | string | number | boolean;
  /** Valore minimo (inclusivo, salvo `minEsclusivo`) */
  min?: number;
  minEsclusivo?: boolean;
  /** Campo mostrato nel riepilogo della scheda mobile */
  inScheda?: boolean;
  /** Nascosto nella tabella desktop (resta visibile nel dettaglio) */
  nascostoInTabella?: boolean;
  /** Suggerimento mostrato sotto il campo nella maschera */
  aiuto?: string;
}

export interface DefinizioneTabella {
  nome: NomeTabella;
  etichetta: string;
  etichettaSingolare: string;
  gruppo: 'Costi e ore' | 'Magazzino e ordini' | 'Anagrafiche';
  icona: string;
  /** Colonne della chiave primaria */
  chiave: string[];
  campi: CampoTabella[];
  /** Ordinamento predefinito della lista */
  ordinamento: { campo: string; discendente?: boolean }[];
  /** Campo usato come titolo della scheda mobile */
  titoloScheda: string;
}

/** Formato campagna: AAAA/AA (es. 2025/26) */
export const REGEX_CAMPAGNA = /^\d{4}\/\d{2}$/;
export const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Campagna vivaistica corrente: da settembre si passa alla campagna successiva.
 * Es. novembre 2026 → "2026/27", marzo 2027 → "2026/27".
 */
export function campagnaCorrente(oggi: Date = new Date()): string {
  const anno = oggi.getFullYear();
  const inizio = oggi.getMonth() >= 8 ? anno : anno - 1;
  return `${inizio}/${String((inizio + 1) % 100).padStart(2, '0')}`;
}

export function dataOggi(oggi: Date = new Date()): string {
  const m = String(oggi.getMonth() + 1).padStart(2, '0');
  const g = String(oggi.getDate()).padStart(2, '0');
  return `${oggi.getFullYear()}-${m}-${g}`;
}

const ID: CampoTabella = { nome: 'id', etichetta: 'ID', tipo: 'testo', automatico: true };

export const TABELLE: Record<NomeTabella, DefinizioneTabella> = {
  // ---------------------------------------------------------------- Costi e ore
  inserimento_costi: {
    nome: 'inserimento_costi',
    etichetta: 'Inserimento costi',
    etichettaSingolare: 'Costo',
    gruppo: 'Costi e ore',
    icona: '€',
    chiave: ['id'],
    ordinamento: [{ campo: 'data', discendente: true }],
    titoloScheda: 'centro_di_costo',
    campi: [
      ID,
      { nome: 'data', etichetta: 'Data', tipo: 'data', obbligatorio: true, predefinito: 'oggi', inScheda: true },
      {
        nome: 'centro_di_costo',
        etichetta: 'Centro di costo',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: { tabella: 'centri_di_costo', colonna: 'centro_di_costo' },
      },
      {
        nome: 'dettaglio_cdc',
        etichetta: 'Dettaglio CdC',
        tipo: 'riferimento',
        riferimento: {
          tabella: 'dettaglio_cdc',
          colonna: 'campo_varieta',
          filtro: { campo: 'centro_di_costo', colonnaRif: 'centro_di_costo' },
        },
        inScheda: true,
      },
      {
        nome: 'causale',
        etichetta: 'Causale',
        tipo: 'scelta',
        obbligatorio: true,
        opzioni: CAUSALI_COSTO,
        inScheda: true,
      },
      {
        nome: 'campagna',
        etichetta: 'Campagna',
        tipo: 'campagna',
        obbligatorio: true,
        predefinito: 'campagna_corrente',
      },
      {
        nome: 'importo',
        etichetta: 'Importo',
        tipo: 'valuta',
        obbligatorio: true,
        predefinito: 0,
        inScheda: true,
      },
      { nome: 'note', etichetta: 'Note', tipo: 'testo_lungo' },
    ],
  },
  inserimento_ore: {
    nome: 'inserimento_ore',
    etichetta: 'Inserimento ore',
    etichettaSingolare: 'Ore lavorate',
    gruppo: 'Costi e ore',
    icona: '⏱',
    chiave: ['id'],
    ordinamento: [{ campo: 'data_inserimento', discendente: true }],
    titoloScheda: 'dipendente',
    campi: [
      ID,
      {
        nome: 'data_inserimento',
        etichetta: 'Data',
        tipo: 'data',
        obbligatorio: true,
        predefinito: 'oggi',
        inScheda: true,
      },
      {
        nome: 'dipendente',
        etichetta: 'Dipendente (soprannome)',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: { tabella: 'anagrafica_personale', colonna: 'soprannome' },
      },
      {
        nome: 'centro_di_costo',
        etichetta: 'Centro di costo',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: { tabella: 'centri_di_costo', colonna: 'centro_di_costo' },
        inScheda: true,
      },
      {
        nome: 'attivita',
        etichetta: 'Attività',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: {
          tabella: 'attivita_cdc',
          colonna: 'attivita',
          filtro: { campo: 'centro_di_costo', colonnaRif: 'centro_di_costo' },
        },
        inScheda: true,
      },
      {
        nome: 'dettaglio_cdc',
        etichetta: 'Dettaglio CdC',
        tipo: 'riferimento',
        riferimento: {
          tabella: 'dettaglio_cdc',
          colonna: 'campo_varieta',
          filtro: { campo: 'centro_di_costo', colonnaRif: 'centro_di_costo' },
        },
      },
      {
        nome: 'numero_ore',
        etichetta: 'Numero ore',
        tipo: 'numero',
        obbligatorio: true,
        min: 0,
        minEsclusivo: true,
        inScheda: true,
      },
    ],
  },
  centri_di_costo: {
    nome: 'centri_di_costo',
    etichetta: 'Centri di costo',
    etichettaSingolare: 'Centro di costo',
    gruppo: 'Costi e ore',
    icona: '◎',
    chiave: ['centro_di_costo'],
    ordinamento: [{ campo: 'centro_di_costo' }],
    titoloScheda: 'centro_di_costo',
    campi: [
      { nome: 'centro_di_costo', etichetta: 'Centro di costo', tipo: 'testo', obbligatorio: true },
    ],
  },
  attivita_cdc: {
    nome: 'attivita_cdc',
    etichetta: 'Attività per CdC',
    etichettaSingolare: 'Attività',
    gruppo: 'Costi e ore',
    icona: '☰',
    chiave: ['id'],
    ordinamento: [{ campo: 'centro_di_costo' }, { campo: 'attivita' }],
    titoloScheda: 'attivita',
    campi: [
      ID,
      {
        nome: 'centro_di_costo',
        etichetta: 'Centro di costo',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: { tabella: 'centri_di_costo', colonna: 'centro_di_costo' },
        inScheda: true,
      },
      { nome: 'attivita', etichetta: 'Attività', tipo: 'testo', obbligatorio: true },
    ],
  },
  dettaglio_cdc: {
    nome: 'dettaglio_cdc',
    etichetta: 'Dettaglio CdC',
    etichettaSingolare: 'Dettaglio CdC',
    gruppo: 'Costi e ore',
    icona: '⌖',
    chiave: ['id'],
    ordinamento: [{ campo: 'centro_di_costo' }, { campo: 'campo_varieta' }],
    titoloScheda: 'campo_varieta',
    campi: [
      ID,
      {
        nome: 'centro_di_costo',
        etichetta: 'Centro di costo',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: { tabella: 'centri_di_costo', colonna: 'centro_di_costo' },
        inScheda: true,
      },
      { nome: 'campo', etichetta: 'Campo', tipo: 'testo', obbligatorio: true },
      { nome: 'varieta', etichetta: 'Varietà', tipo: 'testo', obbligatorio: true },
      {
        nome: 'campo_varieta',
        etichetta: 'Campo - Varietà',
        tipo: 'testo',
        calcolato: true,
      },
    ],
  },
  anagrafica_personale: {
    nome: 'anagrafica_personale',
    etichetta: 'Anagrafica personale',
    etichettaSingolare: 'Dipendente',
    gruppo: 'Costi e ore',
    icona: '👤',
    chiave: ['soprannome'],
    ordinamento: [{ campo: 'soprannome' }],
    titoloScheda: 'soprannome',
    campi: [
      { nome: 'soprannome', etichetta: 'Soprannome (ID)', tipo: 'testo', obbligatorio: true, inScheda: true },
      { nome: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true, inScheda: true },
      { nome: 'cognome', etichetta: 'Cognome', tipo: 'testo', obbligatorio: true, inScheda: true },
      { nome: 'nome_cognome', etichetta: 'Nome e cognome', tipo: 'testo', calcolato: true },
      { nome: 'data_assunzione', etichetta: 'Data assunzione', tipo: 'data', inScheda: true },
      { nome: 'fine_assunzione', etichetta: 'Fine assunzione', tipo: 'data', inScheda: true },
      { nome: 'data_di_nascita', etichetta: 'Data di nascita', tipo: 'data' },
      { nome: 'data_visita_medica', etichetta: 'Visita medica', tipo: 'data', inScheda: true },
      { nome: 'data_formazione_sicurezza', etichetta: 'Formazione sicurezza', tipo: 'data', inScheda: true },
      { nome: 'data_patentino_muletto', etichetta: 'Patentino muletto', tipo: 'data' },
      { nome: 'data_patentino_trattore', etichetta: 'Patentino trattore', tipo: 'data' },
      { nome: 'data_rspp', etichetta: 'RSPP', tipo: 'data' },
      { nome: 'data_antincendio', etichetta: 'Antincendio', tipo: 'data' },
    ],
  },

  // ---------------------------------------------------------- Magazzino e ordini
  innesti: {
    nome: 'innesti',
    etichetta: 'Innesti',
    etichettaSingolare: 'Innesto',
    gruppo: 'Magazzino e ordini',
    icona: '🌱',
    chiave: ['id'],
    ordinamento: [{ campo: 'data_inserimento', discendente: true }],
    titoloScheda: 'riferimento_lotto_parlante',
    campi: [
      ID,
      {
        nome: 'riferimento_lotto_parlante',
        etichetta: 'Riferimento innesto',
        tipo: 'testo',
        calcolato: true,
      },
      {
        nome: 'data_inserimento',
        etichetta: 'Data inserimento',
        tipo: 'data',
        obbligatorio: true,
        predefinito: 'oggi',
      },
      {
        nome: 'campagna',
        etichetta: 'Campagna',
        tipo: 'campagna',
        obbligatorio: true,
        predefinito: 'campagna_corrente',
      },
      {
        nome: 'cliente',
        etichetta: 'Cliente',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: { tabella: 'clienti', colonna: 'ragione_sociale' },
        inScheda: true,
      },
      {
        nome: 'prodotto',
        etichetta: 'Prodotto',
        tipo: 'riferimento',
        obbligatorio: true,
        predefinito: 'Barbatelle innestate',
        riferimento: { tabella: 'tipi_prodotto', colonna: 'prodotto' },
      },
      {
        nome: 'codice_varieta',
        etichetta: 'Varietà',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: { tabella: 'anagrafica_vite', colonna: 'codice_varieta' },
      },
      {
        nome: 'codice_clone',
        etichetta: 'Clone',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: {
          tabella: 'anagrafica_vite',
          colonna: 'codice_clone',
          filtro: { campo: 'codice_varieta', colonnaRif: 'codice_varieta' },
        },
      },
      {
        nome: 'codice_portainnesto',
        etichetta: 'Portainnesto',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: { tabella: 'anagrafica_portainnesto', colonna: 'codice_portainnesto' },
      },
      {
        nome: 'tipologia',
        etichetta: 'Tipologia',
        tipo: 'scelta',
        obbligatorio: true,
        opzioni: TIPOLOGIE_PRODOTTO,
        predefinito: 'Nuova produzione',
        inScheda: true,
      },
      {
        nome: 'quantita',
        etichetta: 'Quantità',
        tipo: 'intero',
        obbligatorio: true,
        min: 0,
        inScheda: true,
      },
      { nome: 'note', etichetta: 'Note', tipo: 'testo_lungo' },
    ],
  },
  lotti_magazzino: {
    nome: 'lotti_magazzino',
    etichetta: 'Lotti magazzino',
    etichettaSingolare: 'Lotto',
    gruppo: 'Magazzino e ordini',
    icona: '▦',
    chiave: ['id'],
    ordinamento: [{ campo: 'data_inserimento', discendente: true }],
    titoloScheda: 'riferimento_lotto_parlante',
    campi: [
      ID,
      {
        nome: 'riferimento_lotto_parlante',
        etichetta: 'Riferimento lotto',
        tipo: 'testo',
        calcolato: true,
      },
      {
        nome: 'riferimento_innesto',
        etichetta: 'Innesto (facoltativo)',
        tipo: 'riferimento',
        riferimento: {
          tabella: 'innesti',
          colonna: 'riferimento_lotto_parlante',
          compila: [
            'campagna',
            'prodotto',
            'codice_varieta',
            'codice_clone',
            'codice_portainnesto',
            'tipologia',
          ],
        },
        aiuto: 'Se scegli un innesto, campagna, prodotto, varietà, clone, portainnesto e tipologia vengono presi dall\'innesto.',
        nascostoInTabella: true,
      },
      {
        nome: 'data_inserimento',
        etichetta: 'Data inserimento',
        tipo: 'data',
        obbligatorio: true,
        predefinito: 'oggi',
      },
      {
        nome: 'campagna',
        etichetta: 'Campagna',
        tipo: 'campagna',
        obbligatorio: true,
        predefinito: 'campagna_corrente',
      },
      {
        nome: 'prodotto',
        etichetta: 'Prodotto',
        tipo: 'riferimento',
        obbligatorio: true,
        predefinito: 'Barbatelle innestate',
        riferimento: { tabella: 'tipi_prodotto', colonna: 'prodotto' },
      },
      {
        nome: 'codice_varieta',
        etichetta: 'Varietà',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: { tabella: 'anagrafica_vite', colonna: 'codice_varieta' },
      },
      {
        nome: 'codice_clone',
        etichetta: 'Clone',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: {
          tabella: 'anagrafica_vite',
          colonna: 'codice_clone',
          filtro: { campo: 'codice_varieta', colonnaRif: 'codice_varieta' },
        },
      },
      {
        nome: 'codice_portainnesto',
        etichetta: 'Portainnesto',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: { tabella: 'anagrafica_portainnesto', colonna: 'codice_portainnesto' },
      },
      {
        nome: 'tipologia',
        etichetta: 'Tipologia',
        tipo: 'scelta',
        obbligatorio: true,
        opzioni: TIPOLOGIE_PRODOTTO,
        predefinito: 'Nuova produzione',
        inScheda: true,
      },
      {
        nome: 'provenienza',
        etichetta: 'Provenienza',
        tipo: 'scelta',
        obbligatorio: true,
        opzioni: PROVENIENZE_LOTTO,
        predefinito: 'Prodotto',
        inScheda: true,
      },
      {
        nome: 'confezionamento',
        etichetta: 'Confezionamento',
        tipo: 'testo',
        aiuto: 'Facoltativo. Se specificato, concorre all\'univocità del riferimento lotto.',
        inScheda: true,
      },
      {
        nome: 'collocazione',
        etichetta: 'Collocazione',
        tipo: 'testo',
        aiuto: 'Posizione in magazzino o cella frigo',
        inScheda: true,
      },
      {
        nome: 'quantita',
        etichetta: 'Quantità',
        tipo: 'intero',
        obbligatorio: true,
        min: 0,
        inScheda: true,
      },
      { nome: 'note', etichetta: 'Note', tipo: 'testo_lungo' },
    ],
  },
  ordine_impieghi: {
    nome: 'ordine_impieghi',
    etichetta: 'Ordini / impieghi',
    etichettaSingolare: 'Ordine',
    gruppo: 'Magazzino e ordini',
    icona: '⇄',
    chiave: ['id'],
    ordinamento: [{ campo: 'data_inserimento', discendente: true }],
    titoloScheda: 'cliente',
    campi: [
      ID,
      {
        nome: 'data_inserimento',
        etichetta: 'Data inserimento',
        tipo: 'data',
        obbligatorio: true,
        predefinito: 'oggi',
        inScheda: true,
      },
      {
        nome: 'cliente',
        etichetta: 'Cliente',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: { tabella: 'clienti', colonna: 'ragione_sociale' },
      },
      {
        nome: 'riferimento_lotto',
        etichetta: 'Lotto (facoltativo)',
        tipo: 'riferimento',
        riferimento: {
          tabella: 'lotti_magazzino',
          colonna: 'riferimento_lotto_parlante',
          compila: [
            'campagna',
            'prodotto',
            'codice_varieta',
            'codice_clone',
            'codice_portainnesto',
            'tipologia',
          ],
        },
        aiuto: 'Se scegli un lotto, prodotto, varietà, clone, portainnesto, campagna e tipologia vengono presi dal lotto.',
        nascostoInTabella: true,
      },
      {
        nome: 'campagna',
        etichetta: 'Campagna',
        tipo: 'campagna',
        obbligatorio: true,
        predefinito: 'campagna_corrente',
      },
      {
        nome: 'prodotto',
        etichetta: 'Prodotto',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: { tabella: 'tipi_prodotto', colonna: 'prodotto' },
      },
      {
        nome: 'codice_varieta',
        etichetta: 'Varietà',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: { tabella: 'anagrafica_vite', colonna: 'codice_varieta' },
        inScheda: true,
      },
      {
        nome: 'codice_clone',
        etichetta: 'Clone',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: {
          tabella: 'anagrafica_vite',
          colonna: 'codice_clone',
          filtro: { campo: 'codice_varieta', colonnaRif: 'codice_varieta' },
        },
        inScheda: true,
      },
      {
        nome: 'codice_portainnesto',
        etichetta: 'Portainnesto',
        tipo: 'riferimento',
        obbligatorio: true,
        riferimento: { tabella: 'anagrafica_portainnesto', colonna: 'codice_portainnesto' },
        inScheda: true,
      },
      {
        nome: 'tipologia',
        etichetta: 'Tipologia',
        tipo: 'scelta',
        obbligatorio: true,
        opzioni: TIPOLOGIE_PRODOTTO,
        predefinito: 'Nuova produzione',
      },
      {
        nome: 'quantita',
        etichetta: 'Quantità',
        tipo: 'intero',
        obbligatorio: true,
        min: 0,
        minEsclusivo: true,
        inScheda: true,
      },
      {
        nome: 'consegnato',
        etichetta: 'Consegnato',
        tipo: 'booleano',
        obbligatorio: true,
        predefinito: false,
        inScheda: true,
      },
      { nome: 'note', etichetta: 'Note', tipo: 'testo_lungo' },
    ],
  },
  clienti: {
    nome: 'clienti',
    etichetta: 'Clienti',
    etichettaSingolare: 'Cliente',
    gruppo: 'Magazzino e ordini',
    icona: '🏢',
    chiave: ['ragione_sociale'],
    ordinamento: [{ campo: 'ragione_sociale' }],
    titoloScheda: 'ragione_sociale',
    campi: [
      { nome: 'ragione_sociale', etichetta: 'Ragione sociale', tipo: 'testo', obbligatorio: true },
      { nome: 'partita_iva', etichetta: 'Partita IVA', tipo: 'testo' },
      { nome: 'codice_fiscale', etichetta: 'Codice fiscale', tipo: 'testo' },
      { nome: 'citta', etichetta: 'Città', tipo: 'testo', inScheda: true },
      { nome: 'indirizzo', etichetta: 'Indirizzo', tipo: 'testo' },
      { nome: 'numero_telefono', etichetta: 'Telefono', tipo: 'testo', inScheda: true },
    ],
  },

  // ---------------------------------------------------------------- Anagrafiche
  anagrafica_vite: {
    nome: 'anagrafica_vite',
    etichetta: 'Anagrafica vite',
    etichettaSingolare: 'Varietà / clone',
    gruppo: 'Anagrafiche',
    icona: '🍇',
    chiave: ['codice_varieta', 'codice_clone'],
    ordinamento: [{ campo: 'codice_varieta' }, { campo: 'codice_clone' }],
    titoloScheda: 'codice_varieta',
    campi: [
      { nome: 'codice_varieta', etichetta: 'Varietà', tipo: 'testo', obbligatorio: true },
      { nome: 'codice_clone', etichetta: 'Clone', tipo: 'testo', obbligatorio: true, inScheda: true },
    ],
  },
  anagrafica_portainnesto: {
    nome: 'anagrafica_portainnesto',
    etichetta: 'Anagrafica portainnesti',
    etichettaSingolare: 'Portainnesto',
    gruppo: 'Anagrafiche',
    icona: '⟟',
    chiave: ['codice_portainnesto'],
    ordinamento: [{ campo: 'codice_portainnesto' }],
    titoloScheda: 'codice_portainnesto',
    campi: [
      {
        nome: 'codice_portainnesto',
        etichetta: 'Portainnesto',
        tipo: 'testo',
        obbligatorio: true,
      },
    ],
  },
  tipi_prodotto: {
    nome: 'tipi_prodotto',
    etichetta: 'Tipi prodotto',
    etichettaSingolare: 'Tipo prodotto',
    gruppo: 'Anagrafiche',
    icona: '◇',
    chiave: ['prodotto'],
    ordinamento: [{ campo: 'prodotto' }],
    titoloScheda: 'prodotto',
    campi: [{ nome: 'prodotto', etichetta: 'Prodotto', tipo: 'testo', obbligatorio: true }],
  },
};

export function isNomeTabella(nome: string): nome is NomeTabella {
  return (NOMI_TABELLE as readonly string[]).includes(nome);
}

/** Campi visibili e compilabili nella maschera di inserimento/modifica */
export function campiModificabili(def: DefinizioneTabella): CampoTabella[] {
  return def.campi.filter((c) => !c.automatico && !c.calcolato);
}

export type RigaTabella = Record<string, string | number | boolean | null>;

/** Riferimento parlante del lotto (include la tipologia ed eventuale confezionamento per garantire univocità) */
export function riferimentoLottoParlante(r: RigaTabella): string {
  const base = `${r['campagna']} - ${r['prodotto']} - ${r['codice_varieta']} (Cl. ${r['codice_clone']}) - P.I. ${r['codice_portainnesto']} - ${r['tipologia']}`;
  return r['confezionamento'] ? `${base} - ${r['confezionamento']}` : base;
}

/** Riferimento parlante per l'innesto (include il cliente) */
export function riferimentoInnestoParlante(r: RigaTabella): string {
  const base = `${r['campagna']} - ${r['prodotto']} - ${r['codice_varieta']} (Cl. ${r['codice_clone']}) - P.I. ${r['codice_portainnesto']} - ${r['tipologia']}`;
  return r['cliente'] ? `${base} - ${r['cliente']}` : base;
}

/**
 * Calcola i campi derivati di una riga (stessa formula usata dai CHECK del database).
 * Usato dall'API prima di salvare e dal frontend per l'anteprima.
 */
export function calcolaCampiDerivati(tabella: NomeTabella, valori: RigaTabella): RigaTabella {
  const r = { ...valori };
  switch (tabella) {
    case 'anagrafica_personale':
      r['nome_cognome'] = `${r['nome'] ?? ''} ${r['cognome'] ?? ''}`.trim();
      break;
    case 'dettaglio_cdc':
      r['campo_varieta'] = `${r['campo'] ?? ''} - ${r['varieta'] ?? ''}`;
      break;
    case 'lotti_magazzino':
      r['riferimento_lotto_parlante'] = riferimentoLottoParlante(r);
      break;
    case 'innesti':
      r['riferimento_lotto_parlante'] = riferimentoInnestoParlante(r);
      break;
  }
  return r;
}

/** Errore di validazione di un singolo campo */
export interface ErroreCampo {
  campo: string;
  messaggio: string;
}

/**
 * Valida e normalizza i valori di una riga secondo i metadati
 * (stringhe vuote → null, numeri convertiti, date e campagna nel formato corretto).
 */
export function validaRiga(
  def: DefinizioneTabella,
  input: Record<string, unknown>,
): { valori: RigaTabella; errori: ErroreCampo[] } {
  const valori: RigaTabella = {};
  const errori: ErroreCampo[] = [];

  for (const campo of campiModificabili(def)) {
    let v = input[campo.nome];
    if (typeof v === 'string') v = v.trim();
    const vuoto = v === undefined || v === null || v === '';

    if (vuoto) {
      if (campo.tipo === 'booleano') {
        valori[campo.nome] = false;
        continue;
      }
      if (campo.obbligatorio) {
        errori.push({ campo: campo.nome, messaggio: `${campo.etichetta}: campo obbligatorio` });
      }
      valori[campo.nome] = null;
      continue;
    }

    switch (campo.tipo) {
      case 'numero':
      case 'valuta':
      case 'intero': {
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
        if (!Number.isFinite(n)) {
          errori.push({ campo: campo.nome, messaggio: `${campo.etichetta}: numero non valido` });
          break;
        }
        if (campo.tipo === 'intero' && !Number.isInteger(n)) {
          errori.push({ campo: campo.nome, messaggio: `${campo.etichetta}: deve essere un numero intero` });
          break;
        }
        if (campo.min !== undefined) {
          const ko = campo.minEsclusivo ? n <= campo.min : n < campo.min;
          if (ko) {
            errori.push({
              campo: campo.nome,
              messaggio: `${campo.etichetta}: deve essere ${campo.minEsclusivo ? 'maggiore di' : 'almeno'} ${campo.min}`,
            });
            break;
          }
        }
        valori[campo.nome] = campo.tipo === 'valuta' ? Math.round(n * 100) / 100 : n;
        break;
      }
      case 'booleano':
        valori[campo.nome] = v === true || v === 1 || v === 'true' || v === '1';
        break;
      case 'data':
        if (typeof v !== 'string' || !REGEX_DATA.test(v) || Number.isNaN(Date.parse(v))) {
          errori.push({ campo: campo.nome, messaggio: `${campo.etichetta}: data non valida` });
          break;
        }
        valori[campo.nome] = v;
        break;
      case 'campagna':
        if (typeof v !== 'string' || !REGEX_CAMPAGNA.test(v)) {
          errori.push({
            campo: campo.nome,
            messaggio: `${campo.etichetta}: formato AAAA/AA (es. ${campagnaCorrente()})`,
          });
          break;
        }
        valori[campo.nome] = v;
        break;
      case 'scelta':
        if (!campo.opzioni?.includes(String(v))) {
          errori.push({ campo: campo.nome, messaggio: `${campo.etichetta}: valore non ammesso` });
          break;
        }
        valori[campo.nome] = String(v);
        break;
      default:
        valori[campo.nome] = String(v);
    }
  }

  return { valori, errori };
}

