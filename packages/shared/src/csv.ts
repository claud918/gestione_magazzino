import {
  TABELLE,
  campiModificabili,
  validaRiga,
  calcolaCampiDerivati,
  dataOggi,
  campagnaCorrente,
  type DefinizioneTabella,
  type CampoTabella,
  type RigaTabella,
  type NomeTabella,
} from './tabelle.js';

/**
 * Colonne con vincolo univoco usate come bersaglio per l'UPSERT (ON CONFLICT) in SQLite/D1.
 */
export const CONFLITTO_TABELLA: Partial<Record<NomeTabella, string[]>> = {
  anagrafica_vite: ['codice_varieta', 'codice_clone'],
  anagrafica_portainnesto: ['codice_portainnesto'],
  tipi_prodotto: ['prodotto'],
  clienti: ['ragione_sociale'],
  anagrafica_personale: ['soprannome'],
  centri_di_costo: ['centro_di_costo'],
  attivita_cdc: ['centro_di_costo', 'attivita'],
  dettaglio_cdc: ['campo_varieta'],
  innesti: ['riferimento_lotto_parlante'],
  lotti_magazzino: ['riferimento_lotto_parlante'],
};

/**
 * Normalizza una stringa eliminando accenti, punteggiatura e spazi
 * per facilitare il confronto flessibile dei nomi di colonna.
 */
export function normalizzaNomeColonna(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Sinonimi e alias comuni per le intestazioni CSV in lingua italiana/tecnica.
 */
const ALIAS_CAMPI: Record<string, string[]> = {
  codice_varieta: ['varieta', 'codicevarieta', 'nomevarieta', 'cultivar'],
  codice_clone: ['clone', 'codiceclone', 'nomeclone', 'cl'],
  codice_portainnesto: ['portainnesto', 'codiceportainnesto', 'pi', 'portainnesti'],
  tipologia: ['tipologia', 'tipologiaprodotto', 'tipo'],
  provenienza: ['provenienza', 'origine'],
  quantita: ['quantita', 'qta', 'quantita', 'pz', 'pezzi', 'numero', 'quantitaordinata'],
  data_inserimento: ['datainserimento', 'data', 'dataordine', 'dataregistrazione'],
  data: ['data', 'datacosto'],
  consegnato: ['consegnato', 'evaso', 'spedito', 'statoevasione'],
  riferimento_lotto: ['lotto', 'riferimentolotto', 'lottoriferimento', 'lottoparlante'],
  riferimento_innesto: ['innesto', 'riferimentoinnesto', 'lottoinnesto'],
  confezionamento: ['confezionamento', 'imballo', 'confezione', 'pacco', 'imballaggio'],
  collocazione: ['collocazione', 'posizione', 'ubicazione', 'cella', 'settore', 'scaffale'],
  ragione_sociale: ['ragionesociale', 'cliente', 'nomecliente', 'azienda', 'denominazione', 'fornitore'],
  cliente: ['cliente', 'ragionesociale', 'committente', 'destinatario'],
  partita_iva: ['partitaiva', 'piva', 'iva'],
  codice_fiscale: ['codicefiscale', 'cf'],
  citta: ['citta', 'comune', 'localita', 'luogo'],
  indirizzo: ['indirizzo', 'via', 'sede'],
  numero_telefono: ['telefono', 'numerotelefono', 'cellulare', 'tel', 'recapito'],
  prodotto: ['prodotto', 'tipoprodotto', 'nomeprodotto'],
  soprannome: ['soprannome', 'nickname', 'alias', 'sigla', 'id'],
  nome: ['nome'],
  cognome: ['cognome'],
  data_di_nascita: ['datadinascita', 'nascita', 'datanascita'],
  data_assunzione: ['dataassunzione', 'assunzione', 'dataassunto', 'inizioassunzione'],
  fine_assunzione: ['fineassunzione', 'datafineassunzione', 'finecontratto', 'dimissioni', 'scadenzacontratto'],
  data_visita_medica: ['visitamedica', 'datavisitamedica'],
  data_formazione_sicurezza: ['formazionesicurezza', 'dataformazionesicurezza', 'sicurezza'],
  data_patentino_muletto: ['patentinomuletto', 'datapatentinomuletto', 'muletto'],
  data_patentino_trattore: ['patentinotrattore', 'datapatentinotrattore', 'trattore'],
  data_rspp: ['rspp', 'datarspp'],
  data_antincendio: ['antincendio', 'dataantincendio'],
  centro_di_costo: ['centrodicosto', 'cdc', 'costcenter'],
  attivita: ['attivita', 'lavorazione', 'mansione'],
  dettaglio_cdc: ['dettagliocdc', 'dettaglio', 'campovarieta'],
  campo: ['campo', 'appezzamento'],
  importo: ['importo', 'costo', 'valore', 'prezzo', 'euro', 'spesa'],
  numero_ore: ['numeroore', 'ore', 'oreeffettive', 'h'],
  dipendente: ['dipendente', 'operatore', 'lavoratore', 'personale'],
  causale: ['causale', 'motivazione'],
  campagna: ['campagna', 'annata', 'stagione'],
  note: ['note', 'nota', 'osservazioni', 'descrizione'],
};

/**
 * Parser CSV robusto conforme a RFC 4180 con:
 * - Rimozione automatica del BOM (\uFEFF)
 * - Auto-rilevamento del delimitatore (';', ',', '\t')
 * - Supporto per celle multiriga e caratteri di escape ("")
 */
export function parseCsv(text: string, sep?: string): string[][] {
  let input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  // Auto-rilevamento del separatore dalla prima riga
  if (!sep) {
    const firstLine = input.split(/\r\n|\r|\n/)[0] || '';
    const semicolons = (firstLine.match(/;/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;
    if (tabs > semicolons && tabs > commas) {
      sep = '\t';
    } else if (semicolons >= commas) {
      sep = ';';
    } else {
      sep = ',';
    }
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const nextChar = input[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentCell += '"';
          i++;
        } else {
          insideQuotes = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === sep) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c !== '')) rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else if (char === '\n') {
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c !== '')) rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c !== '')) rows.push(currentRow);
  }

  return rows;
}

/**
 * Associa ogni colonna dell'intestazione CSV al rispettivo CampoTabella.
 */
export function mappaColonneCsv(
  headers: string[],
  def: DefinizioneTabella,
): {
  mappa: Record<number, CampoTabella>;
  nonMappate: string[];
  mancantiObbligatori: CampoTabella[];
} {
  const campi = campiModificabili(def);
  const mappa: Record<number, CampoTabella> = {};
  const campiAssegnati = new Set<string>();
  const nonMappate: string[] = [];

  headers.forEach((h, index) => {
    const normH = normalizzaNomeColonna(h);
    if (!normH) return;

    // 1. Corrispondenza esatta con il nome tecnico del campo o l'etichetta
    let matched = campi.find(
      (c) => normalizzaNomeColonna(c.nome) === normH || normalizzaNomeColonna(c.etichetta) === normH,
    );

    // 2. Corrispondenza tramite alias
    if (!matched) {
      for (const campo of campi) {
        const aliases = ALIAS_CAMPI[campo.nome];
        if (aliases && aliases.some((a) => normalizzaNomeColonna(a) === normH)) {
          matched = campo;
          break;
        }
      }
    }

    if (matched && !campiAssegnati.has(matched.nome)) {
      mappa[index] = matched;
      campiAssegnati.add(matched.nome);
    } else {
      nonMappate.push(h);
    }
  });

  // Campi obbligatori mancanti (che non hanno valore predefinito automatico)
  const mancantiObbligatori = campi.filter(
    (c) =>
      c.obbligatorio &&
      !campiAssegnati.has(c.nome) &&
      c.predefinito !== 'oggi' &&
      c.predefinito !== 'campagna_corrente' &&
      c.predefinito === undefined,
  );

  return { mappa, nonMappate, mancantiObbligatori };
}

/**
 * Converte il valore grezzo testuale della cella CSV nel tipo previsto dal CampoTabella.
 */
export function convertiCellaCsv(campo: CampoTabella, cellaGrezza: string): unknown {
  const v = cellaGrezza.trim();
  if (!v) {
    if (campo.predefinito === 'oggi') return dataOggi();
    if (campo.predefinito === 'campagna_corrente') return campagnaCorrente();
    if (campo.predefinito !== undefined) return campo.predefinito;
    if (campo.tipo === 'booleano') return false;
    return null;
  }

  switch (campo.tipo) {
    case 'booleano': {
      const lower = v.toLowerCase();
      if (['si', 'sì', 'true', '1', 'yes', 'y', 'vero', 'ok'].includes(lower)) return true;
      if (['no', 'false', '0', 'falso'].includes(lower)) return false;
      return Boolean(v);
    }
    case 'data': {
      // Converte date italiane tipo DD/MM/YYYY, DD-MM-YYYY o DD.MM.YYYY in YYYY-MM-DD
      const itMatch = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
      if (itMatch) {
        const [, g, m, a] = itMatch;
        return `${a}-${m.padStart(2, '0')}-${g.padStart(2, '0')}`;
      }
      return v;
    }
    case 'numero':
    case 'valuta':
    case 'intero': {
      let pulito = v.replace(/\s+/g, '');
      // Gestisce separatore migliaia col punto e decimale con virgola (es. 1.250,50 -> 1250.50)
      if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(pulito)) {
        pulito = pulito.replace(/\./g, '').replace(',', '.');
      } else if (pulito.includes(',')) {
        pulito = pulito.replace(',', '.');
      }
      const n = Number(pulito);
      return Number.isFinite(n) ? n : pulito;
    }
    default:
      return v;
  }
}

export interface RisultatoParsingCsv {
  totaleLette: number;
  righeValide: RigaTabella[];
  erroriRighe: { riga: number; messaggio: string }[];
  colonneRiconosciute: string[];
  colonneNonRiconosciute: string[];
  campiMancanti: string[];
}

/**
 * Elabora il testo completo del CSV per una tabella specifica, eseguendo
 * mapping, conversione dei tipi, applicazione dei default e validazione.
 */
export function processaCsvPerTabella(text: string, def: DefinizioneTabella): RisultatoParsingCsv {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return {
      totaleLette: 0,
      righeValide: [],
      erroriRighe: [{ riga: 0, messaggio: 'Il file CSV è vuoto' }],
      colonneRiconosciute: [],
      colonneNonRiconosciute: [],
      campiMancanti: [],
    };
  }

  const [headerRow, ...dataRows] = rows;
  const { mappa, nonMappate, mancantiObbligatori } = mappaColonneCsv(headerRow, def);

  const campiMancantiNomi = mancantiObbligatori.map((c) => c.etichetta);
  const colonneRiconosciute = Object.values(mappa).map((c) => c.etichetta);

  if (mancantiObbligatori.length > 0) {
    return {
      totaleLette: dataRows.length,
      righeValide: [],
      erroriRighe: [
        {
          riga: 1,
          messaggio: `Intestazione incompleta: mancano le colonne obbligatorie [${campiMancantiNomi.join(', ')}]`,
        },
      ],
      colonneRiconosciute,
      colonneNonRiconosciute: nonMappate,
      campiMancanti: campiMancantiNomi,
    };
  }

  const righeValide: RigaTabella[] = [];
  const erroriRighe: { riga: number; messaggio: string }[] = [];
  const campiMod = campiModificabili(def);

  dataRows.forEach((rowCells, idx) => {
    const numRiga = idx + 2; // +1 per 0-index, +1 per riga intestazione

    // Costruisce l'oggetto input combinando le colonne mappate e i valori predefiniti
    const inputRiga: Record<string, unknown> = {};

    // Prima applica i predefiniti
    for (const c of campiMod) {
      if (c.predefinito === 'oggi') inputRiga[c.nome] = dataOggi();
      else if (c.predefinito === 'campagna_corrente') inputRiga[c.nome] = campagnaCorrente();
      else if (c.predefinito !== undefined) inputRiga[c.nome] = c.predefinito;
    }

    // Poi sovrascrive con i valori del CSV
    rowCells.forEach((cella, colIndex) => {
      const campo = mappa[colIndex];
      if (campo) {
        inputRiga[campo.nome] = convertiCellaCsv(campo, cella);
      }
    });

    const { valori, errori } = validaRiga(def, inputRiga);
    if (errori.length > 0) {
      erroriRighe.push({
        riga: numRiga,
        messaggio: errori.map((e) => e.messaggio).join('; '),
      });
    } else {
      const rigaCompleta = calcolaCampiDerivati(def.nome, valori);
      righeValide.push(rigaCompleta);
    }
  });

  return {
    totaleLette: dataRows.length,
    righeValide,
    erroriRighe,
    colonneRiconosciute,
    colonneNonRiconosciute: nonMappate,
    campiMancanti: campiMancantiNomi,
  };
}

/**
 * Genera un file modello CSV (formato Excel con delimitatore ';') per la tabella indicata,
 * includendo l'intestazione e una riga di esempio realistica.
 */
export function generaTemplateCsv(def: DefinizioneTabella): string {
  const campi = campiModificabili(def);
  const intestazioni = campi.map((c) => `"${c.etichetta}"`).join(';');

  const valoriEsempio: Record<string, string> = {
    // Vite e portainnesti
    codice_varieta: 'GLERA',
    codice_clone: 'VCR1',
    codice_portainnesto: 'K5BB',
    prodotto: 'Gestionale Mori',
    // Lotti e ordini
    campagna: campagnaCorrente(),
    tipologia: 'Nuova produzione',
    provenienza: 'Prodotto',
    quantita: '1000',
    data_inserimento: dataOggi(),
    cliente: 'Azienda Agricola Rossi Srl',
    riferimento_lotto: '',
    consegnato: 'No',
    note: 'Esempio importazione',
    // Clienti
    ragione_sociale: 'Azienda Agricola Rossi Srl',
    partita_iva: '01234567890',
    codice_fiscale: 'RSSMRA80A01H501Z',
    citta: 'Conegliano',
    indirizzo: 'Via Roma 10',
    numero_telefono: '0438123456',
    // Personale
    nome: 'Mario',
    cognome: 'Rossi',
    data_di_nascita: '1985-05-15',
    data_visita_medica: '2026-03-10',
    data_formazione_sicurezza: '2025-11-20',
    data_patentino_muletto: '2024-06-15',
    data_patentino_trattore: '2024-06-15',
    data_rspp: '',
    data_antincendio: '',
    // Costi
    data: dataOggi(),
    centro_di_costo: 'Vivaio 1',
    dettaglio_cdc: '',
    causale: 'Acquisto',
    importo: '150.00',
    numero_ore: '8',
    dipendente: 'Mario Rossi',
    attivita: 'Potatura',
    campo: 'Appezzamento A',
    varieta: 'GLERA',
  };

  const rigaEsempio = campi
    .map((c) => {
      const val = valoriEsempio[c.nome] ?? '';
      return `"${val.replace(/"/g, '""')}"`;
    })
    .join(';');

  return `\uFEFF${intestazioni}\r\n${rigaEsempio}\r\n`;
}
