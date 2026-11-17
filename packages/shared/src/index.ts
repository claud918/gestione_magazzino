/**
 * Schemi Zod e tipi condivisi tra frontend (apps/web) e API (apps/api)
 * per la Gestionale Mori (REQUISITI.md e GLOSSARY.md).
 */
import { z } from 'zod';

export * from './tabelle.js';
export * from './csv.js';

// --- Healthcheck ---

export const HealthResponse = z.object({
  status: z.literal('ok'),
  db: z.boolean(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

// --- Ruoli e Autenticazione (Uso interno: solo admin) ---

export const RuoloUtente = z.enum(['admin']);
export type RuoloUtente = z.infer<typeof RuoloUtente>;

export const UtenteProfilo = z.object({
  id: z.number().int().positive(),
  email: z.string().email(),
  nome: z.string().min(1),
  ruolo: RuoloUtente,
  attivo: z.boolean(),
});
export type UtenteProfilo = z.infer<typeof UtenteProfilo>;

export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email('Email non valida'),
  password: z.string().min(1, 'Password obbligatoria'),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const CambioPasswordInput = z.object({
  passwordAttuale: z.string().min(1),
  nuovaPassword: z.string().min(12, 'La nuova password deve avere almeno 12 caratteri'),
});
export type CambioPasswordInput = z.infer<typeof CambioPasswordInput>;

export const CreaUtenteInput = z.object({
  email: z.string().trim().toLowerCase().email('Email non valida'),
  nome: z.string().trim().min(1, 'Nome obbligatorio'),
  password: z.string().min(12, 'La password deve avere almeno 12 caratteri'),
  ruolo: RuoloUtente,
});
export type CreaUtenteInput = z.infer<typeof CreaUtenteInput>;

// --- Vista disponibilità (raggruppata per prodotto + varietà + clone + portainnesto + campagna + tipologia) ---

export interface RigaDisponibilita {
  campagna: string;
  prodotto: string;
  codice_varieta: string;
  codice_clone: string;
  codice_portainnesto: string;
  tipologia: string;
  /** Σ quantità dei lotti */
  prodotto_qta: number;
  /** Σ quantità degli ordini */
  ordinato: number;
  /** Σ quantità degli ordini consegnati */
  consegnato: number;
  /** Prodotto − Ordinato (negativo = scoperto) */
  disponibile: number;
  /** Prodotto − Consegnato */
  giacenza_fisica: number;
  /** max(0, Ordinato − Prodotto) */
  scoperto: number;
  /** Disponibilità netta per ripiantate a parità di varietà/clone/PI/prodotto/campagna */
  disponibile_ripiantato?: number;
  /** Disponibilità netta per frigoconservate a parità di varietà/clone/PI/prodotto/campagna */
  disponibile_frigo_conservato?: number;
  /** Disponibilità netta per seconde a parità di varietà/clone/PI/prodotto/campagna */
  disponibile_seconde?: number;
}

// --- Vista rese (raggruppata per campagna + prodotto + varietà + clone + portainnesto + tipologia) ---

export interface RigaResa {
  campagna: string;
  prodotto: string;
  codice_varieta: string;
  codice_clone: string;
  codice_portainnesto: string;
  tipologia: string;
  /** Σ quantità innestata (tabella innesti) */
  innestato: number;
  /** Σ quantità prodotta (tabella lotti_magazzino) */
  prodotto_qta: number;
  /** Resa percentuale (prodotto_qta / innestato * 100) */
  resa: number;
}

// --- Risposte API CRUD ---

export interface ErroreApi {
  error: string;
  errori?: { campo: string; messaggio: string }[];
}

// --- Archivio Bolle di Trasporto ---

export interface BollaRigaItem {
  id?: string;
  bollaId?: string;
  ordineId?: string | null;
  prodotto: string;
  codiceVarieta: string;
  codiceClone: string;
  codicePortainnesto: string;
  quantita: number;
}

export interface BollaTrasportoSommario {
  id: string;
  numeroBolla: string;
  anno: number;
  progressivo: number;
  dataBolla: string;
  cliente: string;
  cessionarioIndirizzo?: string | null;
  luogoDestinazione: string;
  causaleTrasporto: string;
  trasportoACuraDi: string;
  vettore?: string | null;
  aspettoBeni?: string | null;
  numeroColli?: string | null;
  dataOraInizioTrasporto?: string | null;
  note?: string | null;
  corpoLibero?: string | null;
  createdAt: string;
  totaleQuantita: number;
  numeroRighe: number;
}

export interface BollaTrasportoDettaglio extends BollaTrasportoSommario {
  righe: BollaRigaItem[];
}

export interface SalvaBollaPayload {
  numeroBolla?: string;
  dataBolla: string;
  cliente: string;
  cessionarioIndirizzo?: string;
  luogoDestinazione: string;
  causaleTrasporto?: string;
  trasportoACuraDi?: string;
  vettore?: string;
  aspettoBeni?: string;
  numeroColli?: string;
  dataOraInizioTrasporto?: string;
  note?: string;
  corpoLibero?: string;
  righe?: Array<{
    ordineId?: string | null;
    prodotto: string;
    codiceVarieta: string;
    codiceClone: string;
    codicePortainnesto: string;
    quantita: number;
  }>;
}

export interface ProssimoNumeroBollaResponse {
  anno: number;
  progressivo: number;
  numeroBolla: string;
}

// --- Archivio Fatture di Vendita ---

export const MODALITA_PAGAMENTO_PREDEFINITA =
  "bonifico bancario 60 gg f.m. - banca d'appoggio BANCA INTESA  ag Cascina PI iban  IT30Q0306970951100000004529";
export const ALIQUOTA_IVA_PREDEFINITA = 10;

export interface FatturaRigaItem {
  id?: string;
  fatturaId?: string;
  ordineId?: string | null;
  prodotto: string;
  codiceVarieta: string;
  codiceClone: string;
  codicePortainnesto: string;
  quantita: number;
  prezzoUnitario: number;
  aliquotaIva?: number;
  importo: number;
}

export interface FatturaSommario {
  id: string;
  numeroFattura: string;
  anno: number;
  progressivo: number;
  dataFattura: string;
  cliente: string;
  partitaIva?: string | null;
  codiceFiscale?: string | null;
  cessionarioIndirizzo?: string | null;
  modalitaPagamento: string;
  aliquotaIva: number;
  totaleMerce: number;
  totaleIva: number;
  totaleFattura: number;
  note?: string | null;
  corpoLibero?: string | null;
  createdAt: string;
  totaleQuantita: number;
  numeroRighe: number;
}

export interface FatturaDettaglio extends FatturaSommario {
  righe: FatturaRigaItem[];
}

export interface SalvaFatturaPayload {
  numeroFattura?: string;
  dataFattura: string;
  cliente: string;
  partitaIva?: string;
  codiceFiscale?: string;
  cessionarioIndirizzo?: string;
  modalitaPagamento?: string;
  aliquotaIva?: number;
  totaleMerce?: number;
  totaleIva?: number;
  totaleFattura?: number;
  note?: string;
  corpoLibero?: string;
  righe?: Array<{
    ordineId?: string | null;
    prodotto: string;
    codiceVarieta: string;
    codiceClone: string;
    codicePortainnesto: string;
    quantita: number;
    prezzoUnitario: number;
    aliquotaIva?: number;
    importo: number;
  }>;
}

export interface ProssimoNumeroFatturaResponse {
  anno: number;
  progressivo: number;
  numeroFattura: string;
}

