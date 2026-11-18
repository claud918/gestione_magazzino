import { Component, computed, HostListener, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { StickyScrollbarDirective } from './sticky-scrollbar.directive';
import { forkJoin } from 'rxjs';
import {
  TABELLE,
  NOMI_TABELLE,
  campiModificabili,
  validaRiga,
  dataOggi,
  campagnaCorrente,
  processaCsvPerTabella,
  generaTemplateCsv,
  TIPOLOGIE_PRODOTTO,
  isProdottoSenzaVarietaClone,
  isProdottoSoloPortainnestoInScheda,
  isProdottoVincoloTipologiaECampoVarieta,
  type NomeTabella,
  type DefinizioneTabella,
  type CampoTabella,
  type RigaTabella,
  type RigaDisponibilita,
  type RigaResa,
  type UtenteProfilo,
  type RisultatoParsingCsv,
  type BollaTrasportoSommario,
  type BollaTrasportoDettaglio,
  type BollaRigaItem,
  type SalvaBollaPayload,
  type ProssimoNumeroBollaResponse,
  type FatturaSommario,
  type FatturaDettaglio,
  type FatturaRigaItem,
  type SalvaFatturaPayload,
  type ProssimoNumeroFatturaResponse,
  MODALITA_PAGAMENTO_PREDEFINITA,
  ALIQUOTA_IVA_PREDEFINITA,
} from '@magazzino/shared';

type SezioneAttiva = 'disponibilita' | 'rese' | 'bolle' | 'fatture' | 'tabella' | 'resoconto_ore';

interface BollaTrasportoForm {
  numeroBolla: string;
  dataBolla: string;
  cessionarioRagioneSociale: string;
  cessionarioIndirizzo: string;
  luogoDestinazione: string;
  causaleTrasporto: string;
  trasportoACuraDi: 'Cedente' | 'Cessionario' | 'Vettore';
  vettore: string;
  aspettoBeni: string;
  numeroColli: string;
  dataOraInizioTrasporto: string;
  noteBolla: string;
  corpoLibero: string;
}

interface BollaRigaArticolo {
  ordine_id?: string | null;
  prodotto: string;
  codice_varieta: string;
  codice_clone: string;
  codice_portainnesto: string;
  quantita: number;
}

interface FatturaForm {
  numeroFattura: string;
  dataFattura: string;
  cliente: string;
  partitaIva: string;
  codiceFiscale: string;
  cessionarioIndirizzo: string;
  modalitaPagamento: string;
  aliquotaIva: number;
  totaleMerce: number;
  totaleIva: number;
  totaleFattura: number;
  noteFattura: string;
  corpoLibero: string;
}

interface FatturaRigaForm {
  ordine_id?: string | null;
  prodotto: string;
  codice_varieta: string;
  codice_clone: string;
  codice_portainnesto: string;
  quantita: number;
  prezzo_unitario: number;
  aliquota_iva: number;
  importo: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, StickyScrollbarDirective],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly http = inject(HttpClient);

  // Costanti tabelle
  protected readonly nomiTabelle = NOMI_TABELLE;
  protected readonly tabelleMap = TABELLE;

  // Stato Autenticazione
  protected readonly caricamentoIniziale = signal(true);
  protected readonly utente = signal<UtenteProfilo | null>(null);
  protected readonly loginEmail = signal('');
  protected readonly loginPassword = signal('');
  protected readonly loginErrore = signal<string | null>(null);
  protected readonly inInvio = signal(false);

  // Navigazione & Layout
  protected readonly sezioneAttiva = signal<SezioneAttiva>('disponibilita');
  protected readonly tabellaSelezionata = signal<NomeTabella>('lotti_magazzino');
  protected readonly modalitaVista = signal<'tabella' | 'schede'>('tabella'); // desktop default tabella, mobile toggle
  protected readonly menuMobileAperto = signal(false);
  protected readonly sidebarChiusaDesktop = signal(false);

  // Messaggi feedback
  protected readonly messaggioOk = signal<string | null>(null);
  protected readonly messaggioErrore = signal<string | null>(null);

  // Dati CRUD
  protected readonly caricamentoDati = signal(false);
  protected readonly righeTabella = signal<RigaTabella[]>([]);
  protected readonly opzioniRiferimento = signal<Record<string, any[]>>({});
  protected readonly ricercaTesto = signal('');

  // Ricerca testuale per filtrare le voci nei campi di selezione (riferimento FK)
  protected readonly ricercaOpzioniPerCampo = signal<Record<string, string>>({});

  protected impostaRicercaOpzioni(campoNome: string, testo: string): void {
    const curr = { ...this.ricercaOpzioniPerCampo() };
    curr[campoNome] = testo;
    this.ricercaOpzioniPerCampo.set(curr);
  }

  protected getRicercaOpzioni(campoNome: string): string {
    return this.ricercaOpzioniPerCampo()[campoNome] || '';
  }
  protected readonly modalAperto = signal(false);
  protected readonly modalModo = signal<'nuovo' | 'modifica'>('nuovo');
  protected readonly modalValori = signal<Record<string, any>>({});
  protected readonly modalErrori = signal<Record<string, string>>({});
  protected readonly rigaInModifica = signal<RigaTabella | null>(null);
  protected readonly rigaSelezionata = signal<RigaTabella | null>(null);
  protected readonly righeSelezionate = signal<RigaTabella[]>([]);

  // Bolla di Trasporto (DDT)
  private static readonly STORAGE_BOLLA_NUM_KEY = 'magazzino_ultimo_numero_bolla_v1';
  protected readonly datiCedente = {
    ragioneSociale: 'Azienda agricola Mori Marco',
    indirizzo: 'Via del fosso Vecchio, 18 - 56121 - Ospedaletto (Pisa)',
    contattiFiscali: 'Tel. 3493461031 - P.IVA 01567690506 - C.F. MROMRC62B17G702B',
    autorizzazioni: 'Cod.Ruop 09-3214 - Matricola. 037 TC',
  };
  protected readonly bollaModalAperto = signal(false);
  protected readonly bollaOrdini = signal<RigaTabella[]>([]);
  protected readonly bollaIndirizziConflitto = signal(false);
  protected readonly bollaOpzioniDestinazione = signal<{ label: string; value: string }[]>([]);
  protected readonly bollaForm = signal<BollaTrasportoForm>({
    numeroBolla: '',
    dataBolla: '',
    cessionarioRagioneSociale: '',
    cessionarioIndirizzo: '',
    luogoDestinazione: '',
    causaleTrasporto: 'Vendita',
    trasportoACuraDi: 'Cedente',
    vettore: '',
    aspettoBeni: '',
    numeroColli: '',
    dataOraInizioTrasporto: '',
    noteBolla: '',
    corpoLibero: '',
  });

  // Stato Archivio Bolle
  protected readonly bolleArchivio = signal<BollaTrasportoSommario[]>([]);
  protected readonly caricamentoBolle = signal(false);
  protected readonly erroreBolle = signal<string | null>(null);
  protected readonly filtroTestoBolle = signal('');
  protected readonly filtroAnnoBolle = signal<string>('TUTTI');
  protected readonly filtroClienteBolle = signal<string>('TUTTI');
  protected readonly bollaDettaglioSelezionata = signal<BollaTrasportoDettaglio | null>(null);
  protected readonly caricamentoDettaglioBolla = signal(false);
  protected readonly salvataggioBollaInCorso = signal(false);

  // Fattura di Vendita
  private static readonly STORAGE_FATTURA_NUM_KEY = 'magazzino_ultimo_numero_fattura_v1';
  protected readonly fatturaModalAperto = signal(false);
  protected readonly fatturaOrdini = signal<RigaTabella[]>([]);
  protected readonly fatturaRighe = signal<FatturaRigaForm[]>([]);
  protected readonly fatturaForm = signal<FatturaForm>({
    numeroFattura: '',
    dataFattura: '',
    cliente: '',
    partitaIva: '',
    codiceFiscale: '',
    cessionarioIndirizzo: '',
    modalitaPagamento: MODALITA_PAGAMENTO_PREDEFINITA,
    aliquotaIva: ALIQUOTA_IVA_PREDEFINITA,
    totaleMerce: 0,
    totaleIva: 0,
    totaleFattura: 0,
    noteFattura: '',
    corpoLibero: '',
  });

  // Stato Archivio Fatture
  protected readonly fattureArchivio = signal<FatturaSommario[]>([]);
  protected readonly caricamentoFatture = signal(false);
  protected readonly erroreFatture = signal<string | null>(null);
  protected readonly filtroTestoFatture = signal('');
  protected readonly filtroAnnoFatture = signal<string>('TUTTI');
  protected readonly filtroClienteFatture = signal<string>('TUTTI');
  protected readonly fatturaDettaglioSelezionata = signal<FatturaDettaglio | null>(null);
  protected readonly caricamentoDettaglioFattura = signal(false);
  protected readonly salvataggioFatturaInCorso = signal(false);

  // Conferma Eliminazione
  protected readonly deleteConfirmAperto = signal(false);
  protected readonly rigaDaEliminare = signal<RigaTabella | null>(null);

  // Modale Import CSV
  protected readonly importModalAperto = signal(false);
  protected readonly importInCorso = signal(false);
  protected readonly importModalita = signal<'upsert' | 'ignora' | 'errore'>('upsert');
  protected readonly importNomeFile = signal('');
  protected readonly importRisultato = signal<RisultatoParsingCsv | null>(null);
  protected readonly importErrore = signal<string | null>(null);
  protected readonly importDettaglioErroriAperto = signal(false);

  // Dati Report Disponibilità
  protected readonly caricamentoDisponibilita = signal(false);
  protected readonly listaDisponibilita = signal<RigaDisponibilita[]>([]);
  protected readonly vistaDisponibilitaModalita = signal<'schede' | 'tabellare'>('schede');
  protected readonly filtroDispCampagna = signal<string>(campagnaCorrente());
  protected readonly filtroDispProdotto = signal<string>('Barbatelle innestate certificate');
  protected readonly filtroDispTipologia = signal<string>('Nuova produzione');
  protected readonly mostraUlterioriDisponibilita = signal<boolean>(false);
  protected readonly filtroDispSoloDisponibili = signal(false);
  protected readonly filtroDispSoloScoperti = signal(false);
  protected readonly filtroDispRicerca = signal('');
  protected readonly listaTipologie = TIPOLOGIE_PRODOTTO;

  // Dati Report Rese
  protected readonly caricamentoRese = signal(false);
  protected readonly listaRese = signal<RigaResa[]>([]);
  protected readonly vistaReseModalita = signal<'schede' | 'tabellare'>('tabellare');
  protected readonly filtroReseCampagna = signal<string>(campagnaCorrente());
  protected readonly filtroReseProdotto = signal<string>('Barbatelle innestate certificate');
  protected readonly filtroReseRicerca = signal('');

  // Dati Resoconto Ore
  protected readonly meseResoconto = signal<number>(new Date().getMonth() + 1);
  protected readonly annoResoconto = signal<number>(new Date().getFullYear());
  protected readonly caricamentoResoconto = signal<boolean>(false);
  protected readonly erroreResoconto = signal<string | null>(null);
  protected readonly datiOre = signal<RigaTabella[]>([]);
  protected readonly datiPersonale = signal<RigaTabella[]>([]);

  // Inserimento Ore Multi-Dipendenti
  protected readonly dipendentiSelezionatiMultipli = signal<string[]>([]);
  protected readonly filtroRicercaDipendenti = signal<string>('');

  // Computed per datalist dinamiche dei filtri
  protected readonly listaCampagneDisponibili = computed<string[]>(() => {
    const set = new Set<string>();
    set.add(campagnaCorrente());
    for (const r of this.listaDisponibilita()) {
      if (r.campagna) set.add(r.campagna);
    }
    for (const r of this.listaRese()) {
      if (r.campagna) set.add(r.campagna);
    }
    return Array.from(set).sort().reverse();
  });

  protected readonly listaTipiProdotto = computed<string[]>(() => {
    const set = new Set<string>();
    set.add('Barbatelle innestate certificate');
    set.add('Barbatelle franche');
    set.add('Talee portainnesto 68/70');
    set.add('Talee portainnesto');
    set.add('Maglioli (qli)');
    set.add('Marze certificate');
    for (const r of this.listaDisponibilita()) {
      if (r.prodotto) set.add(r.prodotto);
    }
    for (const r of this.listaRese()) {
      if (r.prodotto) set.add(r.prodotto);
    }
    const opz = this.opzioniRiferimento()['prodotto'] || [];
    for (const o of opz) {
      const p = typeof o === 'string' ? o : o['prodotto'];
      if (p) set.add(p);
    }
    return Array.from(set);
  });

  protected isProdottoSoloPortainnesto(prodotto: unknown): boolean {
    return isProdottoSoloPortainnestoInScheda(prodotto);
  }

  // Computed: definizione della tabella attiva
  protected readonly defTabella = computed<DefinizioneTabella>(() => {
    return this.tabelleMap[this.tabellaSelezionata()];
  });

  // Computed: campi compilabili della tabella attiva
  protected readonly campiForm = computed<CampoTabella[]>(() => {
    return campiModificabili(this.defTabella());
  });

  // --- Personalizzazione Colonne Tabelle (Persistenza in localStorage) ---
  private static readonly STORAGE_COLONNE_KEY = 'magazzino_colonne_personalizzate_v1';
  private static readonly STORAGE_ORDINE_COLONNE_KEY = 'magazzino_ordine_colonne_v1';

  private static readonly COLONNE_DISPONIBILITA: CampoTabella[] = [
    { nome: 'codice_varieta', etichetta: 'Varietà', tipo: 'testo' },
    { nome: 'codice_clone', etichetta: 'Clone', tipo: 'testo' },
    { nome: 'codice_portainnesto', etichetta: 'Portainnesto', tipo: 'testo' },
    { nome: 'prodotto_qta', etichetta: 'Prodotto (Q.tà)', tipo: 'intero' },
    { nome: 'ordinato', etichetta: 'Ordinato', tipo: 'intero' },
    { nome: 'consegnato', etichetta: 'Consegnato', tipo: 'intero' },
    { nome: 'disponibile', etichetta: 'Disponibile', tipo: 'intero' },
    { nome: 'giacenza_fisica', etichetta: 'Giacenza fisica', tipo: 'intero' },
    { nome: 'scoperto', etichetta: 'Scoperto', tipo: 'intero' },
    { nome: 'disponibile_ripiantato', etichetta: 'Disp. Ripiantate', tipo: 'intero', nascostoInTabella: true },
    { nome: 'disponibile_frigo_conservato', etichetta: 'Disp. Frigoconservate', tipo: 'intero', nascostoInTabella: true },
    { nome: 'disponibile_seconde', etichetta: 'Disp. Seconde', tipo: 'intero', nascostoInTabella: true },
  ];

  private static readonly COLONNE_RESE: CampoTabella[] = [
    { nome: 'codice_varieta', etichetta: 'Varietà', tipo: 'testo' },
    { nome: 'codice_clone', etichetta: 'Clone', tipo: 'testo' },
    { nome: 'codice_portainnesto', etichetta: 'Portainnesto', tipo: 'testo' },
    { nome: 'tipologia', etichetta: 'Tipologia', tipo: 'testo' },
    { nome: 'innestato', etichetta: 'Innestato', tipo: 'intero' },
    { nome: 'prodotto_qta', etichetta: 'Prodotto', tipo: 'intero' },
    { nome: 'resa', etichetta: 'Resa', tipo: 'numero' },
  ];

  private static readonly COLONNE_EXTRA_DISP = [
    'disponibile_ripiantato',
    'disponibile_frigo_conservato',
    'disponibile_seconde',
  ];

  private static readonly COLONNE_MULTISELECT = new Set([
    'codice_varieta',
    'codice_clone',
    'codice_portainnesto',
    'tipologia',
    'prodotto',
    'campagna',
    'causale',
    'centro_di_costo',
    'dettaglio_cdc',
    'attivita',
    'dipendente',
    'cliente',
    'riferimento_innesto',
    'riferimento_lotto',
    'collocazione',
    'confezionamento',
    'citta',
    'campo',
    'varieta',
  ]);

  protected readonly menuColonneAperto = signal(false);
  protected readonly preferenzeColonne = signal<Record<string, string[]>>(
    this.caricaPreferenzeColonneDaStorage(),
  );
  protected readonly ordineColonne = signal<Record<string, string[]>>(
    this.caricaOrdineColonneDaStorage(),
  );
  protected readonly colonnaInTrascinamento = signal<string | null>(null);
  protected readonly filtriColonne = signal<Record<string, Record<string, string>>>({});
  protected readonly filtriMultiColonne = signal<Record<string, Record<string, string[]>>>({});
  protected readonly filtriDataColonne = signal<
    Record<string, Record<string, { da?: string; a?: string }>>
  >({});
  protected readonly ordinamentoColonna = signal<
    Record<string, { campo: string; direzione: 'asc' | 'desc' } | null>
  >({});
  protected readonly colonnaFiltroAperta = signal<CampoTabella | null>(null);
  protected readonly filtroPopoverPos = signal<{ top: number; left: number }>({ top: 0, left: 0 });
  protected readonly ricercaFiltroPopover = signal<string>('');

  protected readonly haFiltriColonnaAttivi = computed<boolean>(() => {
    const chiave = this.chiaveTabellaAttiva();
    const filtri = this.filtriColonne()[chiave];
    const hasSingoli = !!filtri && Object.values(filtri).some((v) => v.trim() !== '');
    const multi = this.filtriMultiColonne()[chiave];
    const hasMulti = !!multi && Object.values(multi).some((arr) => arr.length > 0);
    const date = this.filtriDataColonne()[chiave];
    const hasDate = !!date && Object.values(date).some((r) => !!(r?.da || r?.a));
    return hasSingoli || hasMulti || hasDate;
  });

  protected readonly haOrdinamentoColonnaAttivo = computed<boolean>(() => {
    const chiave = this.chiaveTabellaAttiva();
    return !!this.ordinamentoColonna()[chiave];
  });

  protected readonly opzioniColonnaFiltroAperta = computed<string[]>(() => {
    const campo = this.colonnaFiltroAperta();
    if (!campo) return [];

    const tipoFiltro = this.getTipoFiltroColonna(campo);
    if (tipoFiltro === 'testo' || tipoFiltro === 'data') return [];
    if (campo.tipo === 'booleano') return ['Sì', 'No'];
    if (tipoFiltro === 'select' && campo.opzioni && campo.opzioni.length > 0) {
      return [...campo.opzioni];
    }

    const chiave = this.chiaveTabellaAttiva();
    let righeSorgente: Record<string, any>[] = [];
    if (chiave === '__disp') {
      righeSorgente = this.listaDisponibilita();
    } else if (chiave === '__rese') {
      righeSorgente = this.listaRese();
    } else {
      righeSorgente = this.righeTabella();
    }

    const set = new Set<string>();
    if (campo.opzioni) {
      for (const opt of campo.opzioni) {
        if (opt) set.add(opt);
      }
    }
    for (const riga of righeSorgente) {
      const val = riga[campo.nome];
      if (val !== null && val !== undefined) {
        const str = String(val).trim();
        if (str !== '') {
          set.add(str);
        }
      }
    }

    const ordinate = Array.from(set).sort((a, b) =>
      a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' }),
    );
    const q = this.ricercaFiltroPopover().trim().toLowerCase();
    if (!q) return ordinate;
    return ordinate.filter((opt) => opt.toLowerCase().includes(q));
  });

  protected readonly chiaveTabellaAttiva = computed<string>(() => {
    const sez = this.sezioneAttiva();
    if (sez === 'disponibilita') return '__disp';
    if (sez === 'rese') return '__rese';
    if (sez === 'bolle') return '__bolle';
    if (sez === 'fatture') return '__fatture';
    return this.tabellaSelezionata();
  });

  // Computed per Archivio Bolle
  protected readonly anniDisponibiliBolle = computed<number[]>(() => {
    const set = new Set<number>();
    for (const b of this.bolleArchivio()) {
      if (b.anno) set.add(b.anno);
    }
    const annoCorrente = new Date().getFullYear();
    set.add(annoCorrente);
    return Array.from(set).sort((a, b) => b - a);
  });

  protected readonly clientiDisponibiliBolle = computed<string[]>(() => {
    const set = new Set<string>();
    for (const b of this.bolleArchivio()) {
      if (b.cliente?.trim()) set.add(b.cliente.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
  });

  protected readonly bolleFiltrate = computed<BollaTrasportoSommario[]>(() => {
    const list = this.bolleArchivio();
    const anno = this.filtroAnnoBolle();
    const cliente = this.filtroClienteBolle();
    const q = this.filtroTestoBolle().trim().toLowerCase();

    return list.filter((b) => {
      if (anno !== 'TUTTI' && String(b.anno) !== anno) return false;
      if (cliente !== 'TUTTI' && b.cliente !== cliente) return false;
      if (q) {
        const haystack = [
          b.numeroBolla,
          b.cliente,
          b.luogoDestinazione,
          b.cessionarioIndirizzo,
          b.vettore,
          b.causaleTrasporto,
          b.dataBolla,
          b.note,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  });

  // Computed per Archivio Fatture
  protected readonly anniDisponibiliFatture = computed<number[]>(() => {
    const set = new Set<number>();
    for (const f of this.fattureArchivio()) {
      if (f.anno) set.add(f.anno);
    }
    const annoCorrente = new Date().getFullYear();
    set.add(annoCorrente);
    return Array.from(set).sort((a, b) => b - a);
  });

  protected readonly clientiDisponibiliFatture = computed<string[]>(() => {
    const set = new Set<string>();
    for (const f of this.fattureArchivio()) {
      if (f.cliente?.trim()) set.add(f.cliente.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
  });

  protected readonly fattureFiltrate = computed<FatturaSommario[]>(() => {
    const list = this.fattureArchivio();
    const anno = this.filtroAnnoFatture();
    const cliente = this.filtroClienteFatture();
    const q = this.filtroTestoFatture().trim().toLowerCase();

    return list.filter((f) => {
      if (anno !== 'TUTTI' && String(f.anno) !== anno) return false;
      if (cliente !== 'TUTTI' && f.cliente !== cliente) return false;
      if (q) {
        const haystack = [
          f.numeroFattura,
          f.cliente,
          f.partitaIva,
          f.codiceFiscale,
          f.cessionarioIndirizzo,
          f.modalitaPagamento,
          f.dataFattura,
          f.note,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  });

  // Computed: elenco base predefinito dei campi configurabili per la vista o tabella attiva
  protected readonly campiConfigurabiliBase = computed<CampoTabella[]>(() => {
    const chiave = this.chiaveTabellaAttiva();
    if (chiave === '__disp') return App.COLONNE_DISPONIBILITA;
    if (chiave === '__rese') return App.COLONNE_RESE;
    return this.defTabella().campi.filter((c) => !c.automatico);
  });

  // Computed: tutti i campi configurabili nell'ordine scelto dall'utente (o predefinito)
  protected readonly campiConfigurabili = computed<CampoTabella[]>(() => {
    const chiave = this.chiaveTabellaAttiva();
    const base = this.campiConfigurabiliBase();
    const ordine = this.ordineColonne()[chiave];

    if (!Array.isArray(ordine) || ordine.length === 0) {
      return base;
    }

    const mappa = new Map(base.map((c) => [c.nome, c]));
    const ordinati: CampoTabella[] = [];
    for (const nome of ordine) {
      const campo = mappa.get(nome);
      if (campo) {
        ordinati.push(campo);
        mappa.delete(nome);
      }
    }
    // Aggiunge in coda eventuali nuovi campi non presenti nell'ordine salvato
    for (const resto of mappa.values()) {
      ordinati.push(resto);
    }
    return ordinati;
  });

  // Computed: colonne attualmente visibili nella vista o tabella attiva (già ordinate)
  protected readonly campiTabellaVisibili = computed<CampoTabella[]>(() => {
    const chiave = this.chiaveTabellaAttiva();
    const tutti = this.campiConfigurabili();
    const salvati = this.preferenzeColonne()[chiave];

    if (Array.isArray(salvati) && salvati.length > 0) {
      const visibili = tutti.filter((c) => salvati.includes(c.nome));
      if (visibili.length > 0) {
        return visibili;
      }
    }

    if (chiave === '__disp' && this.mostraUlterioriDisponibilita()) {
      return tutti;
    }

    // Default: quelli che non hanno nascostoInTabella
    return tutti.filter((c) => !c.nascostoInTabella);
  });

  private caricaMappaDaStorage(chiaveStorage: string): Record<string, string[]> {
    try {
      if (typeof localStorage === 'undefined') return {};
      const raw = localStorage.getItem(chiaveStorage);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn(`Impossibile leggere ${chiaveStorage} da localStorage`, e);
      return {};
    }
  }

  private salvaMappaSuStorage(chiaveStorage: string, dati: Record<string, string[]>): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(chiaveStorage, JSON.stringify(dati));
    } catch (e) {
      console.warn(`Impossibile salvare ${chiaveStorage} in localStorage`, e);
    }
  }

  private caricaPreferenzeColonneDaStorage(): Record<string, string[]> {
    return this.caricaMappaDaStorage(App.STORAGE_COLONNE_KEY);
  }

  private salvaPreferenzeColonneSuStorage(pref: Record<string, string[]>): void {
    this.salvaMappaSuStorage(App.STORAGE_COLONNE_KEY, pref);
  }

  private caricaOrdineColonneDaStorage(): Record<string, string[]> {
    return this.caricaMappaDaStorage(App.STORAGE_ORDINE_COLONNE_KEY);
  }

  private salvaOrdineColonneSuStorage(ordine: Record<string, string[]>): void {
    this.salvaMappaSuStorage(App.STORAGE_ORDINE_COLONNE_KEY, ordine);
  }

  protected isColonnaVisibile(nomeCampo: string): boolean {
    return this.campiTabellaVisibili().some((c) => c.nome === nomeCampo);
  }

  protected isUltimaColonna(nomeCampo: string): boolean {
    const vis = this.campiTabellaVisibili();
    return vis.length === 1 && vis[0].nome === nomeCampo;
  }

  protected haPersonalizzazioniColonne(): boolean {
    const chiave = this.chiaveTabellaAttiva();
    return !!this.preferenzeColonne()[chiave] || !!this.ordineColonne()[chiave];
  }

  protected toggleMenuColonne(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.menuColonneAperto.update((v) => !v);
  }

  protected toggleUlterioriDisponibilita(): void {
    const nuovoStato = !this.mostraUlterioriDisponibilita();
    this.mostraUlterioriDisponibilita.set(nuovoStato);

    const salvati = this.preferenzeColonne()['__disp'];
    if (Array.isArray(salvati)) {
      const tuttiNomi = this.campiConfigurabili().map((c) => c.nome);
      const nuoveColonne = nuovoStato
        ? tuttiNomi.filter((n) => salvati.includes(n) || App.COLONNE_EXTRA_DISP.includes(n))
        : salvati.filter((n) => !App.COLONNE_EXTRA_DISP.includes(n));
      if (nuoveColonne.length > 0) {
        const nuovePref = { ...this.preferenzeColonne(), __disp: nuoveColonne };
        this.preferenzeColonne.set(nuovePref);
        this.salvaPreferenzeColonneSuStorage(nuovePref);
      }
    }
  }

  protected toggleVisibilitaColonna(nomeCampo: string): void {
    const chiave = this.chiaveTabellaAttiva();
    const visibiliAttuali = this.campiTabellaVisibili().map((c) => c.nome);
    let nuoveColonne: string[];

    if (visibiliAttuali.includes(nomeCampo)) {
      if (visibiliAttuali.length <= 1) {
        return; // Non permettere di nascondere tutte le colonne
      }
      nuoveColonne = visibiliAttuali.filter((n) => n !== nomeCampo);
    } else {
      // Aggiungi mantenendo l'ordine attuale dei campi configurabili
      const tuttiNomi = this.campiConfigurabili().map((c) => c.nome);
      nuoveColonne = tuttiNomi.filter((n) => visibiliAttuali.includes(n) || n === nomeCampo);
    }

    const nuovePreferenze = {
      ...this.preferenzeColonne(),
      [chiave]: nuoveColonne,
    };
    this.preferenzeColonne.set(nuovePreferenze);
    this.salvaPreferenzeColonneSuStorage(nuovePreferenze);
  }

  protected spostaColonna(nomeCampo: string, direzione: -1 | 1, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const nomi = this.campiConfigurabili().map((c) => c.nome);
    const idx = nomi.indexOf(nomeCampo);
    const nuovoIdx = idx + direzione;
    if (idx < 0 || nuovoIdx < 0 || nuovoIdx >= nomi.length) return;

    const nuovoOrdine = [...nomi];
    [nuovoOrdine[idx], nuovoOrdine[nuovoIdx]] = [nuovoOrdine[nuovoIdx], nuovoOrdine[idx]];
    this.aggiornaOrdineColonne(nuovoOrdine);
  }

  private aggiornaOrdineColonne(nuovoOrdine: string[]): void {
    const chiave = this.chiaveTabellaAttiva();
    const nuoviOrdini = {
      ...this.ordineColonne(),
      [chiave]: nuovoOrdine,
    };
    this.ordineColonne.set(nuoviOrdini);
    this.salvaOrdineColonneSuStorage(nuoviOrdini);
  }

  protected onColDragStart(nomeCampo: string, event: DragEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.btn-th-filter-trigger')) {
      event.preventDefault();
      return;
    }
    this.colonnaInTrascinamento.set(nomeCampo);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', nomeCampo);
    }
  }

  protected getTipoFiltroColonna(
    campo: CampoTabella,
  ): 'select' | 'multiselect' | 'data' | 'testo' {
    if (campo.tipo === 'data') return 'data';
    if (campo.tipo === 'booleano') return 'select';
    if (campo.tipo === 'scelta' && (campo.opzioni?.length ?? 0) <= 2) return 'select';
    if (
      campo.tipo === 'scelta' ||
      campo.tipo === 'riferimento' ||
      campo.tipo === 'campagna' ||
      App.COLONNE_MULTISELECT.has(campo.nome)
    ) {
      return 'multiselect';
    }
    return 'testo';
  }

  protected toggleMenuFiltroColonna(campo: CampoTabella, event: MouseEvent): void {
    event.stopPropagation();
    this.menuColonneAperto.set(false);
    if (this.colonnaFiltroAperta()?.nome === campo.nome) {
      this.colonnaFiltroAperta.set(null);
      return;
    }
    const triggerEl = event.currentTarget as HTMLElement | null;
    if (triggerEl && typeof window !== 'undefined') {
      const rect = triggerEl.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 250));
      const top = rect.bottom + 6;
      this.filtroPopoverPos.set({ top, left });
    }
    this.ricercaFiltroPopover.set('');
    this.colonnaFiltroAperta.set(campo);
  }

  protected getFiltroColonna(nomeCampo: string): string {
    const chiave = this.chiaveTabellaAttiva();
    return this.filtriColonne()[chiave]?.[nomeCampo] ?? '';
  }

  protected setFiltroColonna(nomeCampo: string, valore: string): void {
    const chiave = this.chiaveTabellaAttiva();
    const filtriAttuali = this.filtriColonne();
    const mappaChiave = { ...(filtriAttuali[chiave] || {}) };
    if (valore) {
      mappaChiave[nomeCampo] = valore;
    } else {
      delete mappaChiave[nomeCampo];
    }
    this.filtriColonne.set({
      ...filtriAttuali,
      [chiave]: mappaChiave,
    });
  }

  protected selezionaOpzioneSelectColonna(nomeCampo: string, opzione: string): void {
    const attuale = this.getFiltroColonna(nomeCampo);
    this.setFiltroColonna(nomeCampo, attuale === opzione ? '' : opzione);
  }

  protected isOpzioneMultiSelezionata(nomeCampo: string, opzione: string): boolean {
    const chiave = this.chiaveTabellaAttiva();
    const lista = this.filtriMultiColonne()[chiave]?.[nomeCampo];
    return !!lista && lista.includes(opzione);
  }

  protected toggleOpzioneMultiColonna(nomeCampo: string, opzione: string): void {
    const chiave = this.chiaveTabellaAttiva();
    const tutti = this.filtriMultiColonne();
    const mappaChiave = { ...(tutti[chiave] || {}) };
    const attuali = mappaChiave[nomeCampo] || [];
    const nuovi = attuali.includes(opzione)
      ? attuali.filter((v) => v !== opzione)
      : [...attuali, opzione];

    if (nuovi.length > 0) {
      mappaChiave[nomeCampo] = nuovi;
    } else {
      delete mappaChiave[nomeCampo];
    }
    this.filtriMultiColonne.set({
      ...tutti,
      [chiave]: mappaChiave,
    });
  }

  protected getFiltroDataDa(nomeCampo: string): string {
    const chiave = this.chiaveTabellaAttiva();
    return this.filtriDataColonne()[chiave]?.[nomeCampo]?.da ?? '';
  }

  protected getFiltroDataA(nomeCampo: string): string {
    const chiave = this.chiaveTabellaAttiva();
    return this.filtriDataColonne()[chiave]?.[nomeCampo]?.a ?? '';
  }

  protected setFiltroDataColonna(nomeCampo: string, lato: 'da' | 'a', valore: string): void {
    const chiave = this.chiaveTabellaAttiva();
    const tutti = this.filtriDataColonne();
    const mappaChiave = { ...(tutti[chiave] || {}) };
    const attuale = { ...(mappaChiave[nomeCampo] || {}) };
    if (valore) {
      attuale[lato] = valore;
    } else {
      delete attuale[lato];
    }
    if (attuale.da || attuale.a) {
      mappaChiave[nomeCampo] = attuale;
    } else {
      delete mappaChiave[nomeCampo];
    }
    this.filtriDataColonne.set({
      ...tutti,
      [chiave]: mappaChiave,
    });
  }

  protected isColonnaFiltrata(nomeCampo: string): boolean {
    const chiave = this.chiaveTabellaAttiva();
    const singolo = (this.filtriColonne()[chiave]?.[nomeCampo] ?? '').trim();
    const multi = this.filtriMultiColonne()[chiave]?.[nomeCampo];
    const dataRange = this.filtriDataColonne()[chiave]?.[nomeCampo];
    const hasData = !!(dataRange?.da || dataRange?.a);
    return singolo !== '' || (!!multi && multi.length > 0) || hasData;
  }

  protected azzeraFiltroSingolaColonna(nomeCampo: string): void {
    this.setFiltroColonna(nomeCampo, '');
    const chiave = this.chiaveTabellaAttiva();
    const tutti = this.filtriMultiColonne();
    if (tutti[chiave]?.[nomeCampo]) {
      const mappaChiave = { ...tutti[chiave] };
      delete mappaChiave[nomeCampo];
      this.filtriMultiColonne.set({
        ...tutti,
        [chiave]: mappaChiave,
      });
    }
    const tutteDate = this.filtriDataColonne();
    if (tutteDate[chiave]?.[nomeCampo]) {
      const mappaChiaveDate = { ...tutteDate[chiave] };
      delete mappaChiaveDate[nomeCampo];
      this.filtriDataColonne.set({
        ...tutteDate,
        [chiave]: mappaChiaveDate,
      });
    }
  }

  protected getDirezioneOrdinamento(nomeCampo: string): 'asc' | 'desc' | null {
    const chiave = this.chiaveTabellaAttiva();
    const ord = this.ordinamentoColonna()[chiave];
    return ord && ord.campo === nomeCampo ? ord.direzione : null;
  }

  protected toggleOrdinamentoColonna(nomeCampo: string, event?: Event): void {
    const target = event?.target as HTMLElement | null;
    if (target?.closest('.btn-th-filter-trigger') || target?.closest('.th-filter-popover')) {
      return;
    }
    const chiave = this.chiaveTabellaAttiva();
    const ordAttuale = this.ordinamentoColonna()[chiave];
    let prossimo: { campo: string; direzione: 'asc' | 'desc' } | null;

    if (!ordAttuale || ordAttuale.campo !== nomeCampo) {
      prossimo = { campo: nomeCampo, direzione: 'asc' };
    } else if (ordAttuale.direzione === 'asc') {
      prossimo = { campo: nomeCampo, direzione: 'desc' };
    } else {
      prossimo = null;
    }

    this.ordinamentoColonna.set({
      ...this.ordinamentoColonna(),
      [chiave]: prossimo,
    });
  }

  protected azzeraFiltriEOrdinamentoColonne(): void {
    const chiave = this.chiaveTabellaAttiva();
    const nuoviFiltri = { ...this.filtriColonne() };
    delete nuoviFiltri[chiave];
    this.filtriColonne.set(nuoviFiltri);

    const nuoviMulti = { ...this.filtriMultiColonne() };
    delete nuoviMulti[chiave];
    this.filtriMultiColonne.set(nuoviMulti);

    const nuoveDate = { ...this.filtriDataColonne() };
    delete nuoveDate[chiave];
    this.filtriDataColonne.set(nuoveDate);

    const nuoviOrd = { ...this.ordinamentoColonna() };
    delete nuoviOrd[chiave];
    this.ordinamentoColonna.set(nuoviOrd);
  }

  private verificaFiltroColonna(campo: CampoTabella, valoreRiga: any, filtroRaw: string): boolean {
    const trimmed = filtroRaw.trim();
    if (!trimmed) return true;

    if (campo.tipo === 'booleano') {
      const f = trimmed.toLowerCase();
      const b = Boolean(valoreRiga);
      if (f === 'si' || f === 'sì' || f === 'true' || f === '1') return b;
      if (f === 'no' || f === 'false' || f === '0') return !b;
    }

    if (this.getTipoFiltroColonna(campo) === 'select') {
      const rawStr =
        valoreRiga === null || valoreRiga === undefined ? '' : String(valoreRiga).trim().toLowerCase();
      return rawStr === trimmed.toLowerCase();
    }

    const isNumerico =
      campo.tipo === 'intero' || campo.tipo === 'numero' || campo.tipo === 'valuta';

    if (isNumerico) {
      const rangeMatch = trimmed.match(/^(-?\d+(?:[.,]\d+)?)\s*\.\.\s*(-?\d+(?:[.,]\d+)?)$/);
      if (rangeMatch) {
        if (valoreRiga === null || valoreRiga === undefined || valoreRiga === '') return false;
        const num = Number(valoreRiga);
        if (Number.isNaN(num)) return false;
        const min = Number(rangeMatch[1].replace(',', '.'));
        const max = Number(rangeMatch[2].replace(',', '.'));
        return num >= min && num <= max;
      }

      const opMatch = trimmed.match(/^(>=|<=|!=|<>|>|<|=)\s*(-?\d+(?:[.,]\d+)?)$/);
      if (opMatch) {
        if (valoreRiga === null || valoreRiga === undefined || valoreRiga === '') return false;
        const num = Number(valoreRiga);
        if (Number.isNaN(num)) return false;
        const target = Number(opMatch[2].replace(',', '.'));
        switch (opMatch[1]) {
          case '>=':
            return num >= target;
          case '<=':
            return num <= target;
          case '!=':
          case '<>':
            return num !== target;
          case '>':
            return num > target;
          case '<':
            return num < target;
          case '=':
            return num === target;
        }
      }
    }

    const q = trimmed.toLowerCase();
    const rawStr =
      valoreRiga === null || valoreRiga === undefined ? '' : String(valoreRiga).toLowerCase();
    const fmtStr = this.formattaValoreTabella(campo, valoreRiga).toLowerCase();
    return rawStr.includes(q) || fmtStr.includes(q);
  }

  private normalizzaDataIso(val: any): string | null {
    if (val === null || val === undefined) return null;
    const str = String(val).trim();
    if (!str) return null;
    const mIso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (mIso) return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
    const mIt = str.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
    if (mIt) return `${mIt[3]}-${mIt[2]}-${mIt[1]}`;
    return null;
  }

  private applicaFiltriEOrdinamentoColonne<T extends Record<string, any>>(
    righe: T[],
    campi: CampoTabella[],
    chiave: string,
    ordinamentoDefault?: (a: T, b: T) => number,
  ): T[] {
    const filtri = this.filtriColonne()[chiave];
    const filtriMulti = this.filtriMultiColonne()[chiave];
    const filtriData = this.filtriDataColonne()[chiave];
    const mappaCampi = new Map(campi.map((c) => [c.nome, c]));

    const attiviSingoli = filtri
      ? Object.entries(filtri).filter(([, val]) => val.trim() !== '')
      : [];
    const attiviMulti = filtriMulti
      ? Object.entries(filtriMulti).filter(([, arr]) => arr.length > 0)
      : [];
    const attiviData = filtriData
      ? Object.entries(filtriData).filter(([, range]) => !!(range?.da || range?.a))
      : [];

    let risultato = righe;
    if (attiviSingoli.length > 0 || attiviMulti.length > 0 || attiviData.length > 0) {
      risultato = righe.filter((riga) => {
        const okSingoli = attiviSingoli.every(([nomeCampo, valFiltro]) => {
          const campo = mappaCampi.get(nomeCampo);
          if (!campo) return true;
          return this.verificaFiltroColonna(campo, riga[nomeCampo], valFiltro);
        });
        if (!okSingoli) return false;

        const okMulti = attiviMulti.every(([nomeCampo, valoriAmmessi]) => {
          const valStr =
            riga[nomeCampo] === null || riga[nomeCampo] === undefined
              ? ''
              : String(riga[nomeCampo]).trim();
          return valoriAmmessi.includes(valStr);
        });
        if (!okMulti) return false;

        return attiviData.every(([nomeCampo, range]) => {
          const isoRiga = this.normalizzaDataIso(riga[nomeCampo]);
          if (!isoRiga) return false;
          if (range.da && isoRiga < range.da) return false;
          if (range.a && isoRiga > range.a) return false;
          return true;
        });
      });
    }

    const ord = this.ordinamentoColonna()[chiave];
    if (ord) {
      const campoOrd = mappaCampi.get(ord.campo);
      const dir = ord.direzione === 'asc' ? 1 : -1;
      const isNum =
        campoOrd?.tipo === 'intero' ||
        campoOrd?.tipo === 'numero' ||
        campoOrd?.tipo === 'valuta';
      const isBool = campoOrd?.tipo === 'booleano';

      return [...risultato].sort((a, b) => {
        const aVal = a[ord.campo];
        const bVal = b[ord.campo];
        const aEmpty = aVal === null || aVal === undefined || aVal === '';
        const bEmpty = bVal === null || bVal === undefined || bVal === '';
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;

        let cmp = 0;
        if (isNum) {
          cmp = Number(aVal) - Number(bVal);
        } else if (isBool) {
          cmp = (aVal ? 1 : 0) - (bVal ? 1 : 0);
        } else {
          cmp = String(aVal).localeCompare(String(bVal), 'it', {
            numeric: true,
            sensitivity: 'base',
          });
        }
        return cmp * dir;
      });
    }

    if (ordinamentoDefault) {
      return [...risultato].sort(ordinamentoDefault);
    }

    return risultato;
  }

  protected onColDragOver(event: DragEvent): void {
    if (this.colonnaInTrascinamento()) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
    }
  }

  protected onColDrop(nomeTarget: string, event: DragEvent): void {
    event.preventDefault();
    const sorgente = this.colonnaInTrascinamento() || event.dataTransfer?.getData('text/plain');
    this.colonnaInTrascinamento.set(null);
    if (!sorgente || sorgente === nomeTarget) return;

    const nomi = this.campiConfigurabili().map((c) => c.nome);
    const fromIdx = nomi.indexOf(sorgente);
    const toIdx = nomi.indexOf(nomeTarget);
    if (fromIdx < 0 || toIdx < 0) return;

    const nuovoOrdine = [...nomi];
    const [spostato] = nuovoOrdine.splice(fromIdx, 1);
    nuovoOrdine.splice(toIdx, 0, spostato);
    this.aggiornaOrdineColonne(nuovoOrdine);
  }

  protected onColDragEnd(): void {
    this.colonnaInTrascinamento.set(null);
  }

  protected mostraTutteLeColonne(): void {
    const chiave = this.chiaveTabellaAttiva();
    const tuttiNomi = this.campiConfigurabili().map((c) => c.nome);
    const nuovePreferenze = {
      ...this.preferenzeColonne(),
      [chiave]: tuttiNomi,
    };
    this.preferenzeColonne.set(nuovePreferenze);
    this.salvaPreferenzeColonneSuStorage(nuovePreferenze);
  }

  protected ripristinaColonnePredefinite(): void {
    const chiave = this.chiaveTabellaAttiva();
    if (chiave === '__disp') {
      this.mostraUlterioriDisponibilita.set(false);
    }
    const nuovePreferenze = { ...this.preferenzeColonne() };
    delete nuovePreferenze[chiave];
    this.preferenzeColonne.set(nuovePreferenze);
    this.salvaPreferenzeColonneSuStorage(nuovePreferenze);

    const nuoviOrdini = { ...this.ordineColonne() };
    delete nuoviOrdini[chiave];
    this.ordineColonne.set(nuoviOrdini);
    this.salvaOrdineColonneSuStorage(nuoviOrdini);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.menuColonneAperto() && !target.closest('.col-customizer-wrap')) {
      this.menuColonneAperto.set(false);
    }
    if (
      this.colonnaFiltroAperta() &&
      !target.closest('.th-filter-popover') &&
      !target.closest('.btn-th-filter-trigger')
    ) {
      this.colonnaFiltroAperta.set(null);
    }
  }

  // Computed: promemoria disponibilità residua per inserimento/modifica ordini
  protected readonly disponibilitaPromemoria = computed(() => {
    if (this.tabellaSelezionata() !== 'ordine_impieghi') return null;
    const val = this.modalValori();
    const { campagna, prodotto, codice_varieta, codice_clone, codice_portainnesto, tipologia } = val;
    if (!codice_varieta || !codice_clone || !codice_portainnesto) return null;

    const quantitaRichiesta = Number(val['quantita']) || 0;
    const match = this.listaDisponibilita().find(
      (d) =>
        d.campagna === (campagna || campagnaCorrente()) &&
        d.prodotto === (prodotto || 'Barbatelle innestate certificate') &&
        d.codice_varieta === codice_varieta &&
        d.codice_clone === codice_clone &&
        d.codice_portainnesto === codice_portainnesto &&
        d.tipologia === (tipologia || 'Nuova produzione'),
    );

    if (match) {
      const qtaEsistenteOrdine =
        this.modalModo() === 'modifica' ? Number(this.rigaInModifica()?.['quantita']) || 0 : 0;
      const disponibileEffettivo = match.disponibile + qtaEsistenteOrdine;
      const residuo = disponibileEffettivo - quantitaRichiesta;
      return {
        trovato: true,
        campagna: match.campagna,
        prodotto: match.prodotto,
        varieta: match.codice_varieta,
        clone: match.codice_clone,
        pi: match.codice_portainnesto,
        tipologia: match.tipologia,
        prodotto_qta: match.prodotto_qta,
        ordinato: match.ordinato - qtaEsistenteOrdine,
        disponibile: disponibileEffettivo,
        quantitaRichiesta,
        residuo,
      };
    }

    return {
      trovato: false,
      campagna: campagna || campagnaCorrente(),
      prodotto: prodotto || 'Barbatelle innestate certificate',
      varieta: codice_varieta,
      clone: codice_clone,
      pi: codice_portainnesto,
      tipologia: tipologia || 'Nuova produzione',
      prodotto_qta: 0,
      ordinato: 0,
      disponibile: 0,
      quantitaRichiesta,
      residuo: -quantitaRichiesta,
    };
  });

  // Computed: righe filtrate della tabella corrente
  protected readonly righeFiltrate = computed<RigaTabella[]>(() => {
    const q = this.ricercaTesto().trim().toLowerCase();
    const righe = this.righeTabella();
    const filtrateTesto = !q
      ? righe
      : righe.filter((riga) => {
          return Object.values(riga).some((val) => {
            if (val === null || val === undefined) return false;
            return String(val).toLowerCase().includes(q);
          });
        });

    return this.applicaFiltriEOrdinamentoColonne(
      filtrateTesto,
      this.defTabella().campi.filter((c) => !c.automatico),
      this.tabellaSelezionata(),
    );
  });

  // Computed: disponibilità filtrata
  protected readonly disponibilitaFiltrata = computed<RigaDisponibilita[]>(() => {
    const righe = this.listaDisponibilita();
    const q = this.filtroDispRicerca().trim().toLowerCase();
    const soloDisp = this.filtroDispSoloDisponibili();
    const soloScop = this.filtroDispSoloScoperti();
    const fCampagna = this.filtroDispCampagna().trim();
    const fProdotto = this.filtroDispProdotto().trim();
    const fTipologia = this.filtroDispTipologia().trim();

    // Mappa per calcolare le disponibilità delle altre tipologie a parità di combinazione
    // Chiave: "campagna|prodotto|varieta|clone|pi|tipologia"
    const mappaDispPerTipo = new Map<string, number>();
    for (const r of righe) {
      const k = `${r.campagna}|${r.prodotto}|${r.codice_varieta}|${r.codice_clone}|${r.codice_portainnesto}|${r.tipologia}`;
      mappaDispPerTipo.set(k, r.disponibile);
    }

    const filtrate = righe.filter((r) => {
      if (fCampagna && r.campagna !== fCampagna) return false;
      if (fProdotto && r.prodotto !== fProdotto) return false;
      if (fTipologia && r.tipologia !== fTipologia) return false;
      if (soloDisp && r.disponibile <= 0) return false;
      if (soloScop && r.scoperto <= 0) return false;
      if (q) {
        const full = `${r.codice_varieta} ${r.codice_clone} ${r.codice_portainnesto} ${r.tipologia}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });

    // Assegna a ciascuna riga i valori di disponibile per le tipologie Ripiantate, Frigoconservate e Seconde
    const arricchite = filtrate.map((r) => {
      const prefisso = `${r.campagna}|${r.prodotto}|${r.codice_varieta}|${r.codice_clone}|${r.codice_portainnesto}`;
      return {
        ...r,
        disponibile_ripiantato: mappaDispPerTipo.get(`${prefisso}|Ripiantate`) ?? 0,
        disponibile_frigo_conservato: mappaDispPerTipo.get(`${prefisso}|Frigoconservate`) ?? 0,
        disponibile_seconde: mappaDispPerTipo.get(`${prefisso}|Seconde`) ?? 0,
      };
    });

    // Requisito: Ordinamento predefinito per varietà, clone, portainnesto
    return this.applicaFiltriEOrdinamentoColonne(
      arricchite,
      App.COLONNE_DISPONIBILITA,
      '__disp',
      (a, b) => {
        const varCmp = (a.codice_varieta || '').localeCompare(b.codice_varieta || '');
        if (varCmp !== 0) return varCmp;
        const cloneCmp = (a.codice_clone || '').localeCompare(b.codice_clone || '');
        if (cloneCmp !== 0) return cloneCmp;
        return (a.codice_portainnesto || '').localeCompare(b.codice_portainnesto || '');
      },
    );
  });

  // Computed: KPI Disponibilità
  protected readonly kpiDisponibilita = computed(() => {
    const list = this.disponibilitaFiltrata();
    let totProdotto = 0;
    let totOrdinato = 0;
    let totConsegnato = 0;
    let totDisponibile = 0;
    let totScoperto = 0;
    let combinazioniScoperte = 0;

    for (const item of list) {
      totProdotto += item.prodotto_qta;
      totOrdinato += item.ordinato;
      totConsegnato += item.consegnato;
      totDisponibile += item.disponibile;
      if (item.scoperto > 0) {
        totScoperto += item.scoperto;
        combinazioniScoperte++;
      }
    }
    return {
      totProdotto,
      totOrdinato,
      totConsegnato,
      totDisponibile,
      totScoperto,
      combinazioniScoperte,
      totaleCombinazioni: list.length,
    };
  });

  // Computed: totali ulteriori disponibilità per la riga di totale in tabella
  protected readonly totUlterioriDisponibilita = computed(() => {
    const list = this.disponibilitaFiltrata();
    let totRipiantato = 0;
    let totFrigo = 0;
    let totSeconde = 0;
    for (const item of list) {
      totRipiantato += item.disponibile_ripiantato || 0;
      totFrigo += item.disponibile_frigo_conservato || 0;
      totSeconde += item.disponibile_seconde || 0;
    }
    return { totRipiantato, totFrigo, totSeconde };
  });

  // Computed: rese filtrate
  protected readonly reseFiltrate = computed<RigaResa[]>(() => {
    const righe = this.listaRese();
    const q = this.filtroReseRicerca().trim().toLowerCase();
    const fCampagna = this.filtroReseCampagna().trim();
    const fProdotto = this.filtroReseProdotto().trim();

    const filtrate = righe.filter((r) => {
      // Requisito: nel report rese si mostri solo i record che hanno una produzione (prodotto_qta <> 0) e tipologia = Nuova produzione
      if (!r.prodotto_qta || r.prodotto_qta === 0) return false;
      if (r.tipologia !== 'Nuova produzione') return false;
      if (fCampagna && r.campagna !== fCampagna) return false;
      if (fProdotto && r.prodotto !== fProdotto) return false;
      if (q) {
        const full = `${r.codice_varieta} ${r.codice_clone} ${r.codice_portainnesto} ${r.tipologia}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });

    // Requisito: Ordinamento predefinito per varietà, clone, portainnesto
    return this.applicaFiltriEOrdinamentoColonne(
      filtrate,
      App.COLONNE_RESE,
      '__rese',
      (a, b) => {
        const varCmp = (a.codice_varieta || '').localeCompare(b.codice_varieta || '');
        if (varCmp !== 0) return varCmp;
        const cloneCmp = (a.codice_clone || '').localeCompare(b.codice_clone || '');
        if (cloneCmp !== 0) return cloneCmp;
        return (a.codice_portainnesto || '').localeCompare(b.codice_portainnesto || '');
      },
    );
  });

  // Computed: KPI Rese
  protected readonly kpiRese = computed(() => {
    const list = this.reseFiltrate();
    let totInnestato = 0;
    let totProdotto = 0;

    for (const item of list) {
      totInnestato += item.innestato;
      totProdotto += item.prodotto_qta;
    }
    const resaMedia = totInnestato > 0 ? (totProdotto / totInnestato) * 100 : 0;
    return {
      totInnestato,
      totProdotto,
      resaMedia,
      totaleCombinazioni: list.length,
    };
  });

  ngOnInit(): void {
    if (typeof window !== 'undefined' && 'scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      this.modalitaVista.set('schede');
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const salvato = localStorage.getItem('sidebar_chiusa_desktop');
        if (salvato === 'true') {
          this.sidebarChiusaDesktop.set(true);
        }
      }
    } catch {}
    this.verificaSessione();
  }

  protected toggleSidebar(): void {
    if (typeof window !== 'undefined' && window.innerWidth <= 850) {
      this.menuMobileAperto.set(!this.menuMobileAperto());
    } else {
      const nuovoStato = !this.sidebarChiusaDesktop();
      this.sidebarChiusaDesktop.set(nuovoStato);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('sidebar_chiusa_desktop', String(nuovoStato));
        }
      } catch {}
    }
  }

  // --- Auth ---
  protected verificaSessione(): void {
    this.caricamentoIniziale.set(true);
    this.http.get<{ utente: UtenteProfilo }>('/api/auth/me').subscribe({
      next: (res) => {
        this.utente.set(res.utente);
        this.caricamentoIniziale.set(false);
        this.inizializzaDati();
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            window.scrollTo(0, 0);
          }, 0);
        }
      },
      error: () => {
        this.utente.set(null);
        this.caricamentoIniziale.set(false);
      },
    });
  }

  protected eseguiLogin(event?: Event): void {
    if (event) {
      event.preventDefault();
    }
    // Recupera i valori direttamente dal DOM per supportare browser autofill / password manager
    const emailElem = document.getElementById('email') as HTMLInputElement | null;
    const passElem = document.getElementById('password') as HTMLInputElement | null;

    const email = (emailElem?.value || this.loginEmail()).trim();
    const password = passElem?.value || this.loginPassword();

    // Sincronizza i signal Angular se l'autofill è avvenuto senza emettere eventi DOM
    if (email) this.loginEmail.set(email);
    if (password) this.loginPassword.set(password);

    if (!email || !password) {
      this.loginErrore.set('Inserisci email e password');
      return;
    }

    this.inInvio.set(true);
    this.loginErrore.set(null);
    this.http
      .post<{ utente: UtenteProfilo }>('/api/auth/login', {
        email,
        password,
      })
      .subscribe({
        next: (res) => {
          this.utente.set(res.utente);
          this.inInvio.set(false);
          this.inizializzaDati();
          if (typeof window !== 'undefined') {
            setTimeout(() => {
              window.scrollTo(0, 0);
            }, 0);
          }
        },
        error: (err) => {
          this.inInvio.set(false);
          this.loginErrore.set(err.error?.error || 'Credenziali non valide');
        },
      });
  }

  // --- Cambio password ---
  protected readonly cambioPasswordAperto = signal(false);
  protected readonly cambioPasswordErrore = signal<string | null>(null);
  protected readonly pwdAttuale = signal('');
  protected readonly pwdNuova = signal('');
  protected readonly pwdConferma = signal('');

  protected apriCambioPassword(): void {
    this.pwdAttuale.set('');
    this.pwdNuova.set('');
    this.pwdConferma.set('');
    this.cambioPasswordErrore.set(null);
    this.cambioPasswordAperto.set(true);
  }

  protected chiudiCambioPassword(): void {
    this.cambioPasswordAperto.set(false);
  }

  protected eseguiCambioPassword(): void {
    if (this.pwdNuova().length < 12) {
      this.cambioPasswordErrore.set('La nuova password deve avere almeno 12 caratteri');
      return;
    }
    if (this.pwdNuova() !== this.pwdConferma()) {
      this.cambioPasswordErrore.set('Le due password non coincidono');
      return;
    }
    this.inInvio.set(true);
    this.cambioPasswordErrore.set(null);
    this.http
      .post('/api/auth/change-password', {
        passwordAttuale: this.pwdAttuale(),
        nuovaPassword: this.pwdNuova(),
      })
      .subscribe({
        next: () => {
          this.inInvio.set(false);
          this.cambioPasswordAperto.set(false);
          this.mostraOk('Password aggiornata');
        },
        error: (err) => {
          this.inInvio.set(false);
          this.cambioPasswordErrore.set(
            err.error?.error || err.error?.details?.fieldErrors?.nuovaPassword?.[0] || 'Errore nel cambio password',
          );
        },
      });
  }

  protected eseguiLogout(): void {
    this.http.post('/api/auth/logout', {}).subscribe(() => {
      this.utente.set(null);
      this.loginErrore.set(null);
      this.loginPassword.set('');
    });
  }

  // --- Inizializzazione ---
  private inizializzaDati(): void {
    this.caricaDisponibilita();
    this.caricaRese();
    this.caricaDatiTabella(this.tabellaSelezionata());
  }

  protected aggiornaVistaAttiva(): void {
    const sez = this.sezioneAttiva();
    if (sez === 'disponibilita') {
      this.caricaDisponibilita();
    } else if (sez === 'rese') {
      this.caricaRese();
    } else if (sez === 'bolle') {
      this.caricaBolle();
    } else if (sez === 'fatture') {
      this.caricaFatture();
    } else if (sez === 'resoconto_ore') {
      this.caricaResocontoOre();
    } else {
      this.caricaDatiTabella(this.tabellaSelezionata());
    }
  }

  protected selezionaSezione(sez: SezioneAttiva): void {
    this.sezioneAttiva.set(sez);
    this.menuMobileAperto.set(false);
    this.menuColonneAperto.set(false);
    this.colonnaFiltroAperta.set(null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    if (sez === 'disponibilita') {
      this.caricaDisponibilita();
    } else if (sez === 'rese') {
      this.caricaRese();
    } else if (sez === 'bolle') {
      this.caricaBolle();
    } else if (sez === 'fatture') {
      this.caricaFatture();
    } else if (sez === 'resoconto_ore') {
      this.caricaResocontoOre();
    } else {
      this.caricaDatiTabella(this.tabellaSelezionata());
    }
  }

  protected selezionaTabella(tab: NomeTabella): void {
    this.tabellaSelezionata.set(tab);
    this.sezioneAttiva.set('tabella');
    this.menuMobileAperto.set(false);
    this.menuColonneAperto.set(false);
    this.colonnaFiltroAperta.set(null);
    this.ricercaTesto.set('');
    this.rigaSelezionata.set(null);
    this.righeSelezionate.set([]);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    this.caricaDatiTabella(tab);
  }

  // --- CRUD API ---
  protected caricaDatiTabella(nome: NomeTabella): void {
    this.caricamentoDati.set(true);
    this.rigaSelezionata.set(null);
    this.righeSelezionate.set([]);
    this.http.get<{ righe: RigaTabella[] }>(`/api/crud/${nome}`).subscribe({
      next: (res) => {
        this.righeTabella.set(res.righe);
        this.caricamentoDati.set(false);
      },
      error: (err) => {
        this.caricamentoDati.set(false);
        this.mostraErrore(err.error?.error || 'Errore nel caricamento della tabella');
      },
    });

    // Carica opzioni FK
    this.http.get<{ opzioni: Record<string, any[]> }>(`/api/crud/${nome}/opzioni`).subscribe({
      next: (res) => {
        this.opzioniRiferimento.set(res.opzioni);
      },
    });
  }

  // --- Report Disponibilità ---
  protected caricaDisponibilita(): void {
    this.caricamentoDisponibilita.set(true);
    let params: any = {};
    if (this.filtroDispCampagna()) params['campagna'] = this.filtroDispCampagna();
    if (this.filtroDispProdotto()) params['prodotto'] = this.filtroDispProdotto();

    this.http
      .get<{ disponibilita: RigaDisponibilita[] }>('/api/disponibilita', { params })
      .subscribe({
        next: (res) => {
          this.listaDisponibilita.set(res.disponibilita);
          this.caricamentoDisponibilita.set(false);
        },
        error: (err) => {
          this.caricamentoDisponibilita.set(false);
          this.mostraErrore(err.error?.error || 'Errore nel calcolo disponibilità');
        },
      });
  }

  // --- Report Rese ---
  protected caricaRese(): void {
    this.caricamentoRese.set(true);
    let params: any = {};
    if (this.filtroReseCampagna()) params['campagna'] = this.filtroReseCampagna();
    if (this.filtroReseProdotto()) params['prodotto'] = this.filtroReseProdotto();

    this.http
      .get<{ rese: RigaResa[] }>('/api/rese', { params })
      .subscribe({
        next: (res) => {
          this.listaRese.set(res.rese);
          this.caricamentoRese.set(false);
        },
        error: (err) => {
          this.caricamentoRese.set(false);
          this.mostraErrore(err.error?.error || 'Errore nel calcolo rese');
        },
      });
  }

  private applicaRegoleProdotto(val: Record<string, any>): void {
    const prod = String(val['prodotto'] || '').trim();
    if (isProdottoSenzaVarietaClone(prod)) {
      val['codice_varieta'] = 'NC';
      val['codice_clone'] = 'NC';
    }
    if (prod === 'Marze' || prod === 'Marze certificate') {
      val['codice_portainnesto'] = 'NC';
    }
    if (this.tabellaSelezionata() === 'lotti_magazzino') {
      const isSpeciale = isProdottoVincoloTipologiaECampoVarieta(prod);
      if (isSpeciale) {
        val['tipologia'] = 'Nuova produzione';
        val['riferimento_innesto'] = '';
        if (val['campo_varieta'] === 'NC') {
          val['campo_varieta'] = '';
        }
      } else {
        val['campo_varieta'] = 'NC';
      }
      if (val['provenienza'] !== 'Acquistato') {
        val['prezzo_acquisto'] = null;
      }
    }
  }

  // --- Modale Form Inserimento / Modifica ---
  protected apriModalNuovo(): void {
    this.ricercaOpzioniPerCampo.set({});
    this.dipendentiSelezionatiMultipli.set([]);
    this.filtroRicercaDipendenti.set('');
    if (this.tabellaSelezionata() === 'ordine_impieghi') {
      this.caricaDisponibilita();
    }
    const val: Record<string, any> = {};
    for (const c of this.campiForm()) {
      if (c.predefinito === 'oggi') {
        val[c.nome] = dataOggi();
      } else if (c.predefinito === 'campagna_corrente') {
        // Default campagna: valore dell'ultimo salvataggio se presente in localStorage, altrimenti campagnaCorrente()
        const ultimaCampagna = typeof localStorage !== 'undefined' ? localStorage.getItem('ultima_campagna_salvata') : null;
        val[c.nome] = ultimaCampagna || campagnaCorrente();
      } else if (c.predefinito !== undefined) {
        val[c.nome] = c.predefinito;
      } else if (c.tipo === 'booleano') {
        val[c.nome] = false;
      } else {
        val[c.nome] = '';
      }
    }
    this.applicaRegoleProdotto(val);
    this.modalValori.set(val);
    this.modalErrori.set({});
    this.modalModo.set('nuovo');
    this.rigaInModifica.set(null);
    this.modalAperto.set(true);
  }

  protected apriModalModifica(riga: RigaTabella): void {
    this.ricercaOpzioniPerCampo.set({});
    this.dipendentiSelezionatiMultipli.set([]);
    this.filtroRicercaDipendenti.set('');
    if (this.tabellaSelezionata() === 'ordine_impieghi') {
      this.caricaDisponibilita();
    }
    const val: Record<string, any> = { ...riga };
    this.applicaRegoleProdotto(val);
    this.modalValori.set(val);
    this.modalErrori.set({});
    this.modalModo.set('modifica');
    this.rigaInModifica.set(riga);
    this.modalAperto.set(true);
  }

  protected readonly clienteOrdiniSelezionati = computed<string | null>(() => {
    const sel = this.righeSelezionate();
    if (this.tabellaSelezionata() !== 'ordine_impieghi' || sel.length === 0) return null;
    return String(sel[0]['cliente'] || '').trim() || null;
  });

  protected readonly puoSelezionareTuttiOrdiniVisibili = computed<boolean>(() => {
    if (this.tabellaSelezionata() !== 'ordine_impieghi') return false;
    const righe = this.righeFiltrate();
    if (righe.length === 0) return false;
    const clienteSel = this.clienteOrdiniSelezionati();
    if (clienteSel) {
      return righe.some((r) => String(r['cliente'] || '').trim() === clienteSel);
    }
    const clientiDistinti = new Set(righe.map((r) => String(r['cliente'] || '').trim()));
    return clientiDistinti.size <= 1;
  });

  protected readonly tutteLeRigheFiltrateSelezionate = computed<boolean>(() => {
    if (!this.puoSelezionareTuttiOrdiniVisibili()) return false;
    const clienteSel = this.clienteOrdiniSelezionati();
    const righe = clienteSel
      ? this.righeFiltrate().filter((r) => String(r['cliente'] || '').trim() === clienteSel)
      : this.righeFiltrate();
    if (righe.length === 0) return false;
    const sel = this.righeSelezionate();
    return righe.every((r) => sel.includes(r));
  });

  protected isRigaDisabilitataSelezione(riga: RigaTabella): boolean {
    if (this.tabellaSelezionata() !== 'ordine_impieghi') return false;
    const clienteSel = this.clienteOrdiniSelezionati();
    if (!clienteSel) return false;
    return String(riga['cliente'] || '').trim() !== clienteSel;
  }

  protected isRigaSelezionata(riga: RigaTabella): boolean {
    if (this.tabellaSelezionata() === 'ordine_impieghi') {
      return this.righeSelezionate().includes(riga);
    }
    return this.rigaSelezionata() === riga;
  }

  protected selezionaRiga(riga: RigaTabella): void {
    if (this.tabellaSelezionata() === 'ordine_impieghi') {
      this.toggleSelezioneRiga(riga);
      return;
    }
    if (this.rigaSelezionata() === riga) {
      this.rigaSelezionata.set(null);
      this.righeSelezionate.set([]);
    } else {
      this.rigaSelezionata.set(riga);
      this.righeSelezionate.set([riga]);
    }
  }

  protected toggleSelezioneRiga(riga: RigaTabella, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (this.isRigaDisabilitataSelezione(riga)) {
      return;
    }
    const curr = this.righeSelezionate();
    const nuove = curr.includes(riga) ? curr.filter((r) => r !== riga) : [...curr, riga];
    this.righeSelezionate.set(nuove);
    this.rigaSelezionata.set(nuove.length === 1 ? nuove[0] : null);
  }

  protected toggleSelezionaTuttiOrdiniVisibili(): void {
    if (!this.puoSelezionareTuttiOrdiniVisibili()) return;
    const clienteSel = this.clienteOrdiniSelezionati();
    const targetRighe = clienteSel
      ? this.righeFiltrate().filter((r) => String(r['cliente'] || '').trim() === clienteSel)
      : this.righeFiltrate();
    if (targetRighe.length === 0) return;

    const curr = this.righeSelezionate();
    let nuove: RigaTabella[];
    if (this.tutteLeRigheFiltrateSelezionate()) {
      const targetSet = new Set(targetRighe);
      nuove = curr.filter((r) => !targetSet.has(r));
    } else {
      const aggiunte = targetRighe.filter((r) => !curr.includes(r));
      nuove = [...curr, ...aggiunte];
    }
    this.righeSelezionate.set(nuove);
    this.rigaSelezionata.set(nuove.length === 1 ? nuove[0] : null);
  }

  protected deselezionaTutteLeRighe(): void {
    this.righeSelezionate.set([]);
    this.rigaSelezionata.set(null);
  }

  protected duplicaRiga(riga: RigaTabella): void {
    if (this.tabellaSelezionata() === 'ordine_impieghi') {
      this.caricaDisponibilita();
    }
    const val: Record<string, any> = { ...riga };
    // Rimuovi identificativi automatici e campi derivati dal server
    delete val['id'];
    delete val['riferimento_lotto_parlante'];
    delete val['campo_varieta'];
    delete val['nome_cognome'];

    // Se stiamo duplicando personale, proponi un soprannome univoco
    if (this.tabellaSelezionata() === 'anagrafica_personale' && val['soprannome']) {
      val['soprannome'] = `${val['soprannome']} (copia)`;
    }

    this.modalValori.set(val);
    this.modalErrori.set({});
    this.modalModo.set('nuovo');
    this.rigaInModifica.set(null);
    this.modalAperto.set(true);
  }

  protected duplicaRigaSelezionata(): void {
    const riga = this.rigaSelezionata();
    if (riga) {
      this.duplicaRiga(riga);
    }
  }

  protected chiudiModal(): void {
    this.modalAperto.set(false);
    this.modalErrori.set({});
    this.rigaInModifica.set(null);
  }

  /** Gestione menu a cascata e auto-compilazione */
  protected onCampoChange(campo: CampoTabella): void {
    const val = this.modalValori();

    // Regole speciali Pezzoni/Maglioli e Marze
    if (campo.nome === 'prodotto') {
      this.applicaRegoleProdotto(val);
    }

    if (this.tabellaSelezionata() === 'lotti_magazzino' && campo.nome === 'provenienza') {
      if (val['provenienza'] !== 'Acquistato') {
        val['prezzo_acquisto'] = null;
      }
    }

    // Se il campo referenziato ha un'istruzione di auto-compilazione (es. Ordine -> Innesto)
    if (campo.riferimento?.compila && val[campo.nome]) {
      const opzioni = this.opzioniRiferimento()[campo.nome] || [];
      const lottoSelezionato = opzioni.find(
        (o: any) => o[campo.riferimento!.colonna] === val[campo.nome],
      );
      if (lottoSelezionato) {
        for (const targetCol of campo.riferimento.compila) {
          if (lottoSelezionato[targetCol] !== undefined) {
            val[targetCol] = lottoSelezionato[targetCol];
          }
        }
        // Riapplica regole speciali se il prodotto è stato compilato dall'innesto
        this.applicaRegoleProdotto(val);
        this.modalValori.set({ ...val });
      }
    }

    // Se modifico un campo genitore (o compila modifica valori), resetto i figli dipendenti non più validi
    for (const c of this.campiForm()) {
      if (c.riferimento?.filtro) {
        const campoGenitore = c.riferimento.filtro.campo;
        if (campo.nome === campoGenitore || campo.riferimento?.compila?.includes(campoGenitore)) {
          const opzFiglio = this.getOpzioniPerCampo(c);
          const esiste = opzFiglio.some((o: any) => o[c.riferimento!.colonna] === val[c.nome]);
          if (!esiste) {
            val[c.nome] = '';
          }
        }
      }
    }
    this.modalValori.set({ ...val });
  }

  /** Ottiene le opzioni filtrate e distinte (SELECT DISTINCT) per un campo con riferimento FK */
  protected getOpzioniPerCampo(campo: CampoTabella): any[] {
    const tutte = this.opzioniRiferimento()[campo.nome] || [];
    let filtrate = tutte;

    if (campo.riferimento?.filtro) {
      const { campo: campoGenitore, colonnaRif } = campo.riferimento.filtro;
      const valoreGenitore = this.modalValori()[campoGenitore];
      if (!valoreGenitore || valoreGenitore === 'NC') return [];
      const vGenNorm = String(valoreGenitore).trim().toLowerCase();
      filtrate = tutte.filter((item: any) => {
        const itemVal = String(item[colonnaRif] ?? '').trim().toLowerCase();
        return itemVal === vGenNorm;
      });
    }

    if (!campo.riferimento?.colonna) return filtrate;

    // Deduplica le opzioni in base al valore della colonna di riferimento (SELECT DISTINCT)
    const visti = new Set<string>();
    const deduplicate = filtrate.filter((item: any) => {
      const val = item[campo.riferimento!.colonna];
      if (val === null || val === undefined || val === '') return false;
      const chiave = String(val).trim();
      if (visti.has(chiave)) return false;
      visti.add(chiave);
      return true;
    });

    // Filtra ulteriormente le opzioni mostrate nel dropdown in base al testo di ricerca digitato
    const query = (this.ricercaOpzioniPerCampo()[campo.nome] || '').trim().toLowerCase();
    if (!query) {
      return deduplicate;
    }

    return deduplicate.filter((item: any) => {
      const val = String(item[campo.riferimento!.colonna] || '').toLowerCase();
      // Includi anche l'opzione attualmente già selezionata nel record per non deselezionarla
      const valAttuale = String(this.modalValori()[campo.nome] || '').toLowerCase();
      return val.includes(query) || (valAttuale && val === valAttuale);
    });
  }

  protected isCampoDisabilitato(campo: CampoTabella): boolean {
    const val = this.modalValori();
    const prod = String(val['prodotto'] || '').trim();

    // Pezzoni e Maglioli: varietà e clone non devono essere alimentati
    if (
      isProdottoSenzaVarietaClone(prod) &&
      (campo.nome === 'codice_varieta' || campo.nome === 'codice_clone')
    ) {
      return true;
    }

    // Marze: portainnesto non deve essere alimentato
    if ((prod === 'Marze' || prod === 'Marze certificate') && campo.nome === 'codice_portainnesto') {
      return true;
    }

    // Se siamo in lotti_magazzino e c'è un riferimento_innesto selezionato, i campi presi dall'innesto sono bloccati
    if (this.tabellaSelezionata() === 'lotti_magazzino') {
      const innesto = val['riferimento_innesto'];
      const campiDerivatiDaInnesto = [
        'campagna',
        'prodotto',
        'codice_varieta',
        'codice_clone',
        'codice_portainnesto',
        'tipologia',
      ];
      if (innesto && campiDerivatiDaInnesto.includes(campo.nome)) {
        return true;
      }

      // Regole speciali lotti: tipologia bloccata a "Nuova produzione" per i 5 prodotti speciali,
      // riferimento_innesto bloccato e vuoto per i 5 prodotti speciali,
      // campo_varieta aperto SOLO per i 5 prodotti speciali (e richiede un portainnesto valido),
      // prezzo_acquisto editabile solo se Acquistato
      const isSpeciale = isProdottoVincoloTipologiaECampoVarieta(prod);
      if (campo.nome === 'riferimento_innesto' && isSpeciale) {
        return true;
      }
      if (campo.nome === 'tipologia' && isSpeciale) {
        return true;
      }
      if (campo.nome === 'campo_varieta') {
        if (!isSpeciale) return true;
        if (!val['codice_portainnesto'] || val['codice_portainnesto'] === 'NC') return true;
      }
      if (campo.nome === 'prezzo_acquisto' && val['provenienza'] !== 'Acquistato') {
        return true;
      }
    }

    // In modifica, le chiavi primarie testuali (se non uuid) non si modificano tranne il soprannome in anagrafica_personale, ragione_sociale in clienti e causale in causali_costo che devono essere editabili
    if (this.modalModo() === 'modifica' && this.defTabella().chiave.includes(campo.nome)) {
      if (
        (this.defTabella().nome === 'anagrafica_personale' && campo.nome === 'soprannome') ||
        (this.defTabella().nome === 'clienti' && campo.nome === 'ragione_sociale') ||
        (this.defTabella().nome === 'causali_costo' && campo.nome === 'causale')
      ) {
        return false;
      }
      return true;
    }

    // Requisito 6: riferimento innesto nella tabella degli ordini NON è vincolato dal lotto ed è sempre editabile
    return false;
  }

  protected salvaRiga(): void {
    const def = this.defTabella();

    // Inserimento multiplo dipendenti per inserimento_ore
    if (
      def.nome === 'inserimento_ore' &&
      this.modalModo() === 'nuovo' &&
      this.dipendentiSelezionatiMultipli().length > 1
    ) {
      const dips = this.dipendentiSelezionatiMultipli();
      // Valida con il primo dipendente per verificare tutti i campi obbligatori
      const { valori: baseValori, errori } = validaRiga(def, { ...this.modalValori(), dipendente: dips[0] });
      if (errori.length > 0) {
        const errMap: Record<string, string> = {};
        for (const e of errori) {
          errMap[e.campo] = e.messaggio;
        }
        this.modalErrori.set(errMap);
        return;
      }

      this.inInvio.set(true);
      const richieste = dips.map((dip) => {
        const rigaPayload = { ...baseValori, dipendente: dip };
        return this.http.post<{ riga: RigaTabella }>(`/api/crud/${def.nome}`, rigaPayload);
      });

      forkJoin(richieste).subscribe({
        next: () => {
          this.inInvio.set(false);
          this.chiudiModal();
          this.mostraOk(`${dips.length} record ore inseriti con successo`);
          this.caricaDatiTabella(def.nome);
        },
        error: (err) => {
          this.inInvio.set(false);
          this.mostraErrore(err.error?.error || 'Errore durante l\'inserimento multiplo delle ore');
        },
      });
      return;
    }

    const { valori, errori } = validaRiga(def, this.modalValori());

    if (errori.length > 0) {
      const errMap: Record<string, string> = {};
      for (const e of errori) {
        errMap[e.campo] = e.messaggio;
      }
      this.modalErrori.set(errMap);
      return;
    }

    this.inInvio.set(true);

    if (this.modalModo() === 'nuovo') {
      this.http.post<{ riga: RigaTabella }>(`/api/crud/${def.nome}`, valori).subscribe({
        next: () => {
          this.inInvio.set(false);
          // Memorizza l'ultima campagna salvata per riproporla come default nei successivi inserimenti
          if (valori['campagna'] && typeof localStorage !== 'undefined') {
            localStorage.setItem('ultima_campagna_salvata', String(valori['campagna']));
          }
          this.chiudiModal();
          this.mostraOk('Elemento inserito con successo');
          this.caricaDatiTabella(def.nome);
          if (
            def.nome === 'lotti_magazzino' ||
            def.nome === 'innesti' ||
            def.nome === 'ordine_impieghi'
          ) {
            this.caricaDisponibilita();
            this.caricaRese();
          }
        },
        error: (err) => {
          this.inInvio.set(false);
          this.mostraErrore(err.error?.error || 'Errore durante il salvataggio');
        },
      });
    } else {
      // Modifica: passa la chiave come query params
      const rigaOriginale = this.rigaInModifica()!;
      const params: Record<string, string> = {};
      for (const k of def.chiave) {
        params[k] = String(rigaOriginale[k]);
      }

      this.http.put<{ riga: RigaTabella }>(`/api/crud/${def.nome}`, valori, { params }).subscribe({
        next: () => {
          this.inInvio.set(false);
          if (valori['campagna'] && typeof localStorage !== 'undefined') {
            localStorage.setItem('ultima_campagna_salvata', String(valori['campagna']));
          }
          this.chiudiModal();
          this.mostraOk('Elemento modificato con successo');
          this.caricaDatiTabella(def.nome);
          if (
            def.nome === 'lotti_magazzino' ||
            def.nome === 'innesti' ||
            def.nome === 'ordine_impieghi'
          ) {
            this.caricaDisponibilita();
            this.caricaRese();
          }
        },
        error: (err) => {
          this.inInvio.set(false);
          this.mostraErrore(err.error?.error || 'Errore durante la modifica');
        },
      });
    }
  }

  // --- Eliminazione ---
  protected apriConfermaElimina(riga: RigaTabella): void {
    this.rigaDaEliminare.set(riga);
    this.deleteConfirmAperto.set(true);
  }

  protected annullaElimina(): void {
    this.deleteConfirmAperto.set(false);
    this.rigaDaEliminare.set(null);
  }

  protected eseguiElimina(): void {
    const riga = this.rigaDaEliminare();
    if (!riga) return;
    const def = this.defTabella();

    const params: Record<string, string> = {};
    for (const k of def.chiave) {
      params[k] = String(riga[k]);
    }

    this.http.delete(`/api/crud/${def.nome}`, { params }).subscribe({
      next: () => {
        this.annullaElimina();
        this.mostraOk('Elemento eliminato con successo');
        this.caricaDatiTabella(def.nome);
        if (
          def.nome === 'lotti_magazzino' ||
          def.nome === 'innesti' ||
          def.nome === 'ordine_impieghi'
        ) {
          this.caricaDisponibilita();
          this.caricaRese();
        }
      },
      error: (err) => {
        this.annullaElimina();
        this.mostraErrore(err.error?.error || "Errore durante l'eliminazione");
      },
    });
  }

  // --- Utility grafiche ---
  protected mostraOk(testo: string): void {
    this.messaggioOk.set(testo);
    setTimeout(() => this.messaggioOk.set(null), 4000);
  }

  protected mostraErrore(testo: string): void {
    this.messaggioErrore.set(testo);
    setTimeout(() => this.messaggioErrore.set(null), 6000);
  }

  protected formattaDataIt(val: unknown): string {
    if (val === null || val === undefined || val === '') return '';
    const str = String(val).trim();
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return `${m[3]}-${m[2]}-${m[1]}`;
    }
    return str;
  }

  protected formattaValoreTabella(campo: CampoTabella, val: any): string {
    if (val === null || val === undefined || val === '') return '—';
    if (campo.tipo === 'data') {
      return this.formattaDataIt(val);
    }
    if (campo.tipo === 'valuta') {
      return Number(val).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
    }
    if (campo.tipo === 'booleano') {
      return val ? 'Sì' : 'No';
    }
    return String(val);
  }

  // --- Esportazione CSV per Excel ---
  private scaricaCsv(nomeFile: string, righe: string[][]): void {
    const csvContent =
      '\uFEFF' +
      righe
        .map((r) =>
          r
            .map((val) => {
              const str = val === null || val === undefined ? '' : String(val);
              return `"${str.replace(/"/g, '""')}"`;
            })
            .join(';'),
        )
        .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeFile;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected esportaDisponibilitaCsv(): void {
    const items = this.disponibilitaFiltrata();
    const intestazioni = [
      'Campagna',
      'Prodotto',
      'Varietà',
      'Clone',
      'Portainnesto',
      'Tipologia',
      'Prodotto (Q.tà)',
      'Ordinato',
      'Consegnato',
      'Disponibile',
      'Giacenza fisica',
      'Scoperto',
      'Disp. Ripiantate',
      'Disp. Frigoconservate',
      'Disp. Seconde',
    ];
    const righe = items.map((it) => [
      it.campagna,
      it.prodotto,
      it.codice_varieta,
      it.codice_clone,
      it.codice_portainnesto,
      it.tipologia,
      String(it.prodotto_qta),
      String(it.ordinato),
      String(it.consegnato),
      String(it.disponibile),
      String(it.giacenza_fisica),
      String(it.scoperto),
      String(it.disponibile_ripiantato ?? 0),
      String(it.disponibile_frigo_conservato ?? 0),
      String(it.disponibile_seconde ?? 0),
    ]);
    const dataStr = new Date().toISOString().slice(0, 10);
    this.scaricaCsv(`disponibilita_magazzino_${dataStr}.csv`, [intestazioni, ...righe]);
    this.mostraOk('Report disponibilità scaricato in formato CSV');
  }

  protected esportaReseCsv(): void {
    const items = this.reseFiltrate();
    const intestazioni = [
      'Campagna',
      'Prodotto',
      'Varietà',
      'Clone',
      'Portainnesto',
      'Tipologia',
      'Innestato',
      'Prodotto',
      'Resa (%)',
    ];
    const righe = items.map((it) => [
      it.campagna,
      it.prodotto,
      it.codice_varieta,
      it.codice_clone,
      it.codice_portainnesto,
      it.tipologia,
      String(it.innestato),
      String(it.prodotto_qta),
      `${it.resa.toFixed(2)}%`,
    ]);
    const dataStr = new Date().toISOString().slice(0, 10);
    this.scaricaCsv(`report_rese_${dataStr}.csv`, [intestazioni, ...righe]);
    this.mostraOk('Report rese scaricato in formato CSV');
  }

  protected esportaTabellaCsv(): void {
    const def = this.defTabella();
    const righe = this.righeFiltrate();
    const campiVisibili = def.campi.filter((c) => !c.automatico);
    const intestazioni = campiVisibili.map((c) => c.etichetta);
    const dati = righe.map((r) =>
      campiVisibili.map((c) => {
        const val = r[c.nome];
        if (val === null || val === undefined) return '';
        if (c.tipo === 'booleano') return val ? 'Sì' : 'No';
        return String(val);
      }),
    );
    const dataStr = new Date().toISOString().slice(0, 10);
    this.scaricaCsv(`export_${def.nome}_${dataStr}.csv`, [intestazioni, ...dati]);
    this.mostraOk(`Tabella "${def.etichetta}" scaricata in formato CSV`);
  }

  // --- Inserimento Multiplo Dipendenti per Inserimento Ore ---
  protected toggleDipendenteMultiplo(soprannome: string): void {
    const attuali = this.dipendentiSelezionatiMultipli();
    if (attuali.includes(soprannome)) {
      const nuovi = attuali.filter((s) => s !== soprannome);
      this.dipendentiSelezionatiMultipli.set(nuovi);
      this.modalValori()['dipendente'] = nuovi.length > 0 ? nuovi[0] : '';
    } else {
      const nuovi = [...attuali, soprannome];
      this.dipendentiSelezionatiMultipli.set(nuovi);
      this.modalValori()['dipendente'] = nuovi[0];
    }
  }

  protected selezionaTuttiDipendenti(opzioni: any[]): void {
    const tutti = opzioni.map((o) => o['soprannome']).filter(Boolean);
    this.dipendentiSelezionatiMultipli.set(tutti);
    if (tutti.length > 0) {
      this.modalValori()['dipendente'] = tutti[0];
    }
  }

  protected deselezionaTuttiDipendenti(): void {
    this.dipendentiSelezionatiMultipli.set([]);
    this.modalValori()['dipendente'] = '';
  }

  protected isDipendenteSelezionato(soprannome: string): boolean {
    return this.dipendentiSelezionatiMultipli().includes(soprannome);
  }

  protected getDipendentiFiltratiPerInserimento(campo: CampoTabella): any[] {
    const list = this.getOpzioniPerCampo(campo);
    const q = this.filtroRicercaDipendenti().trim().toLowerCase();
    if (!q) return list;
    return list.filter((item: any) => {
      const s = String(item['soprannome'] || '').toLowerCase();
      const n = String(item['nome'] || '').toLowerCase();
      const c = String(item['cognome'] || '').toLowerCase();
      const nc = String(item['nome_cognome'] || '').toLowerCase();
      return s.includes(q) || n.includes(q) || c.includes(q) || nc.includes(q);
    });
  }

  // --- Resoconto Ore Mensile e Export Excel ---
  protected readonly nomiMesi = [
    'Gennaio',
    'Febbraio',
    'Marzo',
    'Aprile',
    'Maggio',
    'Giugno',
    'Luglio',
    'Agosto',
    'Settembre',
    'Ottobre',
    'Novembre',
    'Dicembre',
  ];

  protected readonly anniDisponibiliResoconto = computed<number[]>(() => {
    const annoCorrente = new Date().getFullYear();
    const anni: number[] = [];
    for (let a = annoCorrente - 3; a <= annoCorrente + 2; a++) {
      anni.push(a);
    }
    return anni;
  });

  protected readonly giorniNelMeseResoconto = computed<number>(() => {
    return new Date(this.annoResoconto(), this.meseResoconto(), 0).getDate();
  });

  protected readonly listaGiorniResoconto = computed<
    Array<{ giorno: number; nomeGiorno: string; isWeekend: boolean }>
  >(() => {
    const anno = this.annoResoconto();
    const mese = this.meseResoconto();
    const totalGiorni = this.giorniNelMeseResoconto();
    const nomiGiorni = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    const res: Array<{ giorno: number; nomeGiorno: string; isWeekend: boolean }> = [];
    for (let g = 1; g <= totalGiorni; g++) {
      const d = new Date(anno, mese - 1, g);
      const dayOfWeek = d.getDay();
      res.push({
        giorno: g,
        nomeGiorno: nomiGiorni[dayOfWeek],
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      });
    }
    return res;
  });

  protected readonly reportOreMatrice = computed(() => {
    const anno = this.annoResoconto();
    const mese = this.meseResoconto();
    const prefissoData = `${anno}-${String(mese).padStart(2, '0')}`;
    const totalGiorni = this.giorniNelMeseResoconto();

    const oreFiltrate = this.datiOre().filter((o) => {
      const d = String(o['data_inserimento'] || '');
      return d.startsWith(prefissoData);
    });

    const mappaPersonale = new Map<string, { nome: string; cognome: string; etichetta: string }>();
    for (const p of this.datiPersonale()) {
      const sop = String(p['soprannome'] || '');
      const nome = String(p['nome'] || '');
      const cognome = String(p['cognome'] || '');
      const etichetta = `${cognome} ${nome}`.trim() || sop;
      mappaPersonale.set(sop, { nome, cognome, etichetta });
    }

    const dipendentiSet = new Set<string>();
    for (const p of this.datiPersonale()) {
      const sop = String(p['soprannome'] || '');
      if (sop) dipendentiSet.add(sop);
    }
    for (const o of oreFiltrate) {
      const dip = String(o['dipendente'] || '');
      if (dip) dipendentiSet.add(dip);
    }

    const righe: Array<{
      soprannome: string;
      nome: string;
      cognome: string;
      dipendenteNome: string;
      oreGiorno: Record<number, number>;
      totaleOre: number;
    }> = [];

    const totaliGiornalieri: Record<number, number> = {};
    for (let g = 1; g <= totalGiorni; g++) {
      totaliGiornalieri[g] = 0;
    }
    let totaleGenerale = 0;

    for (const sop of dipendentiSet) {
      const info = mappaPersonale.get(sop) || { nome: '', cognome: '', etichetta: sop };
      const oreGiorno: Record<number, number> = {};
      let totDip = 0;

      for (let g = 1; g <= totalGiorni; g++) {
        oreGiorno[g] = 0;
      }

      const oreDip = oreFiltrate.filter((o) => String(o['dipendente'] || '') === sop);
      for (const item of oreDip) {
        const dStr = String(item['data_inserimento'] || '');
        const dayNum = parseInt(dStr.slice(8, 10), 10);
        const ore = Number(item['numero_ore']) || 0;
        if (dayNum >= 1 && dayNum <= totalGiorni) {
          oreGiorno[dayNum] = Math.round((oreGiorno[dayNum] + ore) * 100) / 100;
          totDip = Math.round((totDip + ore) * 100) / 100;
          totaliGiornalieri[dayNum] = Math.round((totaliGiornalieri[dayNum] + ore) * 100) / 100;
          totaleGenerale = Math.round((totaleGenerale + ore) * 100) / 100;
        }
      }

      righe.push({
        soprannome: sop,
        nome: info.nome,
        cognome: info.cognome,
        dipendenteNome: info.etichetta,
        oreGiorno,
        totaleOre: totDip,
      });
    }

    righe.sort((a, b) => a.dipendenteNome.localeCompare(b.dipendenteNome));

    return {
      righe,
      totaliGiornalieri,
      totaleGenerale,
    };
  });

  protected caricaResocontoOre(): void {
    this.caricamentoResoconto.set(true);
    this.erroreResoconto.set(null);
    forkJoin({
      ore: this.http.get<{ righe: RigaTabella[] }>('/api/crud/inserimento_ore'),
      personale: this.http.get<{ righe: RigaTabella[] }>('/api/crud/anagrafica_personale'),
    }).subscribe({
      next: (res) => {
        this.datiOre.set(res.ore.righe || []);
        this.datiPersonale.set(res.personale.righe || []);
        this.caricamentoResoconto.set(false);
      },
      error: (err) => {
        this.caricamentoResoconto.set(false);
        this.erroreResoconto.set(
          err.error?.error || 'Errore durante il caricamento dei dati del resoconto ore',
        );
      },
    });
  }

  protected cambiaMeseResoconto(delta: number): void {
    let m = this.meseResoconto() + delta;
    let a = this.annoResoconto();
    if (m < 1) {
      m = 12;
      a -= 1;
    } else if (m > 12) {
      m = 1;
      a += 1;
    }
    this.meseResoconto.set(m);
    this.annoResoconto.set(a);
  }

  protected esportaResocontoOreExcel(): void {
    const anno = this.annoResoconto();
    const mese = this.meseResoconto();
    const totalGiorni = this.giorniNelMeseResoconto();
    const data = this.reportOreMatrice();

    const intestazioni: string[] = ['Dipendente'];
    for (let g = 1; g <= totalGiorni; g++) {
      intestazioni.push(String(g));
    }
    intestazioni.push('Totale');

    const righeCsv: string[][] = [intestazioni];

    for (const r of data.righe) {
      const riga: string[] = [r.dipendenteNome];
      for (let g = 1; g <= totalGiorni; g++) {
        const ore = r.oreGiorno[g];
        riga.push(ore > 0 ? String(ore) : '');
      }
      riga.push(r.totaleOre > 0 ? String(r.totaleOre) : '0');
      righeCsv.push(riga);
    }

    const rigaTotali: string[] = ['TOTALE GIORNALIERO'];
    for (let g = 1; g <= totalGiorni; g++) {
      const totGiorno = data.totaliGiornalieri[g];
      rigaTotali.push(totGiorno > 0 ? String(totGiorno) : '');
    }
    rigaTotali.push(String(data.totaleGenerale));
    righeCsv.push(rigaTotali);

    const nomeMese = this.nomiMesi[mese - 1].toLowerCase();
    this.scaricaCsv(`report_ore_${anno}_${String(mese).padStart(2, '0')}_${nomeMese}.csv`, righeCsv);
    this.mostraOk(`Report ore di ${this.nomiMesi[mese - 1]} ${anno} esportato con successo`);
  }

  // --- Importazione CSV per Anagrafiche, Magazzino e Ordini ---
  protected apriModalImport(): void {
    this.importModalAperto.set(true);
    this.importInCorso.set(false);
    this.importModalita.set('upsert');
    this.importNomeFile.set('');
    this.importRisultato.set(null);
    this.importErrore.set(null);
    this.importDettaglioErroriAperto.set(false);
  }

  protected chiudiModalImport(): void {
    this.importModalAperto.set(false);
    this.importRisultato.set(null);
    this.importErrore.set(null);
  }

  protected scaricaTemplateCsv(): void {
    const def = this.defTabella();
    const csvContent = generaTemplateCsv(def);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modello_import_${def.nome}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.mostraOk(`Modello CSV per "${def.etichetta}" scaricato`);
  }

  protected onCsvFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.importNomeFile.set(file.name);
    this.importErrore.set(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        this.importErrore.set('Il file selezionato è vuoto.');
        this.importRisultato.set(null);
        return;
      }

      try {
        const res = processaCsvPerTabella(text, this.defTabella());
        this.importRisultato.set(res);
        if (res.erroriRighe.length > 0 && res.righeValide.length === 0) {
          this.importErrore.set(
            res.erroriRighe[0]?.messaggio || 'Nessuna riga valida trovata nel file CSV.',
          );
        }
      } catch (err: any) {
        this.importErrore.set(`Errore durante la lettura del file: ${err.message}`);
        this.importRisultato.set(null);
      }
    };
    reader.onerror = () => {
      this.importErrore.set('Impossibile leggere il file selezionato.');
      this.importRisultato.set(null);
    };

    reader.readAsText(file, 'UTF-8');
    input.value = '';
  }

  protected eseguiImportCsv(): void {
    const res = this.importRisultato();
    if (!res || res.righeValide.length === 0) {
      this.importErrore.set('Nessuna riga valida da importare.');
      return;
    }

    this.importInCorso.set(true);
    this.importErrore.set(null);

    const payload = {
      righe: res.righeValide,
      modalita: this.importModalita(),
    };

    this.http
      .post<{ successo: boolean; totale: number; modifiche: number; messaggio: string }>(
        `/api/crud/${this.tabellaSelezionata()}/import`,
        payload,
      )
      .subscribe({
        next: (resp) => {
          this.importInCorso.set(false);
          this.chiudiModalImport();
          this.mostraOk(
            resp.messaggio ||
              `Importati ${res.righeValide.length} record in "${this.defTabella().etichetta}"!`,
          );
          this.caricaDatiTabella(this.tabellaSelezionata());
          if (
            this.tabellaSelezionata() === 'lotti_magazzino' ||
            this.tabellaSelezionata() === 'innesti' ||
            this.tabellaSelezionata() === 'ordine_impieghi'
          ) {
            this.caricaDisponibilita();
            this.caricaRese();
          }
        },
        error: (err) => {
          this.importInCorso.set(false);
          const msg =
            err.error?.error ||
            err.error?.message ||
            'Errore durante il salvataggio dei dati sul server.';
          this.importErrore.set(msg);
        },
      });
  }

  // --- Bolla di Trasporto (DDT) & Archivio Bolle ---
  protected readonly bollaRighe = computed<BollaRigaArticolo[]>(() => {
    return this.bollaOrdini().map((r) => ({
      ordine_id: String(r['id'] ?? ''),
      prodotto: String(r['prodotto'] ?? ''),
      codice_varieta: String(r['codice_varieta'] ?? ''),
      codice_clone: String(r['codice_clone'] ?? ''),
      codice_portainnesto: String(r['codice_portainnesto'] ?? ''),
      quantita: Number(r['quantita']) || 0,
    }));
  });

  protected readonly bollaTotaleQuantita = computed<number>(() => {
    return this.bollaRighe().reduce((acc, r) => acc + r.quantita, 0);
  });

  private proponiNumeroBolla(): string {
    const anno = String(new Date().getFullYear());
    try {
      if (typeof localStorage === 'undefined') return `1/${anno}`;
      const raw = localStorage.getItem(App.STORAGE_BOLLA_NUM_KEY);
      if (!raw) return `1/${anno}`;
      const m = raw.trim().match(/^(\d+)(?:\/(\d{4}))?$/);
      if (!m) return `1/${anno}`;
      if (m[2] && m[2] !== anno) return `1/${anno}`;
      const prossimo = Number(m[1]) + 1;
      return m[2] ? `${prossimo}/${m[2]}` : String(prossimo);
    } catch {
      return `1/${anno}`;
    }
  }

  private salvaUltimoNumeroBolla(numero: string): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const trimmed = numero.trim();
      if (/^\d+(?:\/\d{4})?$/.test(trimmed)) {
        localStorage.setItem(App.STORAGE_BOLLA_NUM_KEY, trimmed);
      }
    } catch {}
  }

  // --- Archivio Bolle di Trasporto (chiamate API e logica) ---

  protected caricaBolle(): void {
    this.caricamentoBolle.set(true);
    this.erroreBolle.set(null);
    this.http.get<{ bolle: BollaTrasportoSommario[] }>('/api/bolle').subscribe({
      next: (res) => {
        this.bolleArchivio.set(res.bolle || []);
        this.caricamentoBolle.set(false);
      },
      error: (err) => {
        this.caricamentoBolle.set(false);
        this.erroreBolle.set(err.error?.error || 'Errore nel caricamento delle bolle');
      },
    });
  }

  protected apriDettagliBolla(b: BollaTrasportoSommario): void {
    this.caricamentoDettaglioBolla.set(true);
    this.http.get<{ bolla: BollaTrasportoDettaglio }>(`/api/bolle/${b.id}`).subscribe({
      next: (res) => {
        this.bollaDettaglioSelezionata.set(res.bolla);
        this.caricamentoDettaglioBolla.set(false);
      },
      error: (err) => {
        this.caricamentoDettaglioBolla.set(false);
        this.mostraErrore(err.error?.error || 'Errore nel recupero della bolla');
      },
    });
  }

  protected chiudiDettagliBolla(): void {
    this.bollaDettaglioSelezionata.set(null);
  }

  protected ristampaBollaDaArchivio(b: BollaTrasportoSommario | BollaTrasportoDettaglio): void {
    if ('righe' in b && Array.isArray((b as BollaTrasportoDettaglio).righe)) {
      this.eseguiStampaBollaDaDettaglio(b as BollaTrasportoDettaglio);
      return;
    }

    this.http.get<{ bolla: BollaTrasportoDettaglio }>(`/api/bolle/${b.id}`).subscribe({
      next: (res) => {
        this.eseguiStampaBollaDaDettaglio(res.bolla);
      },
      error: (err) => {
        this.mostraErrore(err.error?.error || 'Impossibile recuperare la bolla per la ristampa');
      },
    });
  }

  protected eliminaBolla(b: BollaTrasportoSommario): void {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Sei sicuro di voler eliminare la bolla N. ${b.numeroBolla}? L'operazione non può essere annullata.`,
      );
      if (!ok) return;
    }

    this.http.delete(`/api/bolle/${b.id}`).subscribe({
      next: () => {
        this.bolleArchivio.update((list) => list.filter((item) => item.id !== b.id));
        if (this.bollaDettaglioSelezionata()?.id === b.id) {
          this.bollaDettaglioSelezionata.set(null);
        }
        this.mostraOk(`Bolla N. ${b.numeroBolla} eliminata con successo.`);
      },
      error: (err) => {
        this.mostraErrore(err.error?.error || "Errore durante l'eliminazione della bolla");
      },
    });
  }

  protected readonly listaClientiAnagrafica = signal<{
    ragioneSociale: string;
    referente?: string;
    indirizzo: string;
    citta: string;
    partitaIva: string;
    codiceFiscale: string;
    note?: string;
  }[]>([]);

  protected caricaListaClienti(): void {
    if (this.listaClientiAnagrafica().length > 0) return;
    this.http.get<{ righe: RigaTabella[] }>('/api/crud/clienti').subscribe({
      next: (res) => {
        const list = (res.righe ?? [])
          .map((c) => ({
            ragioneSociale: String(c['ragione_sociale'] || '').trim(),
            referente: String(c['referente'] || '').trim(),
            indirizzo: String(c['indirizzo'] || '').trim(),
            citta: String(c['citta'] || '').trim(),
            partitaIva: String(c['partita_iva'] || '').trim(),
            codiceFiscale: String(c['codice_fiscale'] || '').trim(),
            note: String(c['note'] || '').trim(),
          }))
          .filter((c) => c.ragioneSociale);
        this.listaClientiAnagrafica.set(list);
      },
      error: () => {},
    });
  }

  protected selezionaClienteBolla(nome: string): void {
    this.aggiornaCampoBolla('cessionarioRagioneSociale', nome);
    const trovato = this.listaClientiAnagrafica().find(
      (c) => c.ragioneSociale.toLowerCase() === nome.trim().toLowerCase(),
    );
    if (trovato) {
      const ind = [trovato.indirizzo, trovato.citta].filter(Boolean).join(' - ');
      if (ind) {
        this.aggiornaCampoBolla('cessionarioIndirizzo', ind);
        this.aggiornaCampoBolla('luogoDestinazione', `${trovato.ragioneSociale} — ${ind}`);
      } else {
        this.aggiornaCampoBolla('luogoDestinazione', trovato.ragioneSociale);
      }
    }
  }

  protected formattaRigheComeTesto(righe: (BollaRigaArticolo | BollaRigaItem)[]): string {
    if (!righe || righe.length === 0) return '';
    return righe
      .map((r: any) => {
        const prod = String(r.prodotto || '').trim();
        const varCode = r.codice_varieta ?? r.codiceVarieta ?? '';
        const cloneCode = r.codice_clone ?? r.codiceClone ?? '';
        const piCode = r.codice_portainnesto ?? r.codicePortainnesto ?? '';
        const varClone =
          varCode && varCode !== 'NC'
            ? `${varCode}${cloneCode && cloneCode !== 'NC' ? ` (Cl. ${cloneCode})` : ''}`
            : '';
        const pi = piCode && piCode !== 'NC' ? `P.I. ${piCode}` : '';
        const qta = Number(r.quantita) || 0;
        const desc = [prod, varClone, pi].filter(Boolean).join(' - ');
        return `${desc} — Q.tà: ${qta.toLocaleString('it-IT')}`;
      })
      .join('\n');
  }

  protected apriModalNuovaBollaLibera(): void {
    this.caricaListaClienti();
    this.bollaOrdini.set([]);
    this.bollaIndirizziConflitto.set(false);
    this.bollaOpzioniDestinazione.set([]);

    const oggiIso = dataOggi();
    const annoCorrente = new Date().getFullYear();
    this.bollaForm.set({
      numeroBolla: this.proponiNumeroBolla(),
      dataBolla: oggiIso,
      cessionarioRagioneSociale: '',
      cessionarioIndirizzo: '',
      luogoDestinazione: '',
      causaleTrasporto: 'Vendita',
      trasportoACuraDi: 'Cedente',
      vettore: '',
      aspettoBeni: '',
      numeroColli: '',
      dataOraInizioTrasporto: this.formattaDataIt(oggiIso),
      noteBolla: '',
      corpoLibero: '',
    });
    this.bollaModalAperto.set(true);

    this.http
      .get<ProssimoNumeroBollaResponse>(`/api/bolle/prossimo-numero?anno=${annoCorrente}`)
      .subscribe({
        next: (res) => {
          if (res?.numeroBolla) {
            this.aggiornaCampoBolla('numeroBolla', res.numeroBolla);
          }
        },
        error: () => {},
      });
  }

  protected apriModalBolla(): void {
    this.caricaListaClienti();
    const ordini = this.righeSelezionate();
    if (ordini.length === 0) return;

    const clientiDistinti = Array.from(
      new Set(ordini.map((r) => String(r['cliente'] || '').trim()).filter(Boolean)),
    );
    if (clientiDistinti.length === 0) {
      this.mostraErrore('Gli ordini selezionati non hanno un cliente associato.');
      return;
    }
    if (clientiDistinti.length > 1) {
      this.mostraErrore(
        `Impossibile generare la bolla: seleziona ordini appartenenti a un solo cliente (${clientiDistinti.join(', ')}).`,
      );
      return;
    }

    const clienteNome = clientiDistinti[0];
    const listaClienti = this.opzioniRiferimento()['cliente'] || [];
    if (listaClienti.length > 0) {
      const clienteObj = listaClienti.find(
        (c: any) => String(c['ragione_sociale'] || '').trim() === clienteNome,
      );
      this.inizializzaEApriModalBolla(ordini, clienteNome, clienteObj);
      return;
    }

    this.http.get<{ righe: RigaTabella[] }>('/api/crud/clienti').subscribe({
      next: (res) => {
        const clienti = res.righe ?? [];
        const clienteObj = clienti.find(
          (c) => String(c['ragione_sociale'] || '').trim() === clienteNome,
        );
        this.inizializzaEApriModalBolla(ordini, clienteNome, clienteObj);
      },
      error: () => {
        this.inizializzaEApriModalBolla(ordini, clienteNome, undefined);
      },
    });
  }

  private inizializzaEApriModalBolla(
    ordini: RigaTabella[],
    clienteNome: string,
    clienteObj: RigaTabella | undefined,
  ): void {
    this.caricaListaClienti();
    const cessionarioIndirizzo = [clienteObj?.['indirizzo'], clienteObj?.['citta']]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(' - ');

    const destinazioneCessionario = cessionarioIndirizzo
      ? `${clienteNome} — ${cessionarioIndirizzo}`
      : clienteNome;

    const indirizziConsegnaDistinti = Array.from(
      new Set(ordini.map((r) => String(r['indirizzo_consegna'] || '').trim()).filter(Boolean)),
    );

    let luogoDestinazione = destinazioneCessionario;
    if (indirizziConsegnaDistinti.length === 1) {
      luogoDestinazione = indirizziConsegnaDistinti[0];
      this.bollaIndirizziConflitto.set(false);
      this.bollaOpzioniDestinazione.set([]);
    } else if (indirizziConsegnaDistinti.length > 1) {
      luogoDestinazione = indirizziConsegnaDistinti[0];
      this.bollaIndirizziConflitto.set(true);
      this.bollaOpzioniDestinazione.set([
        ...indirizziConsegnaDistinti.map((addr) => ({ label: addr, value: addr })),
        {
          label: `Indirizzo del cessionario (${destinazioneCessionario})`,
          value: destinazioneCessionario,
        },
      ]);
    } else {
      this.bollaIndirizziConflitto.set(false);
      this.bollaOpzioniDestinazione.set([]);
    }

    const oggiIso = dataOggi();
    const annoCorrente = new Date().getFullYear();
    this.bollaOrdini.set([...ordini]);

    const corpoLibero = ordini
      .map((r) => {
        const prod = String(r['prodotto'] || '').trim();
        const varCode = r['codice_varieta'] ?? '';
        const cloneCode = r['codice_clone'] ?? '';
        const piCode = r['codice_portainnesto'] ?? '';
        const varClone =
          varCode && varCode !== 'NC'
            ? `${varCode}${cloneCode && cloneCode !== 'NC' ? ` (Cl. ${cloneCode})` : ''}`
            : '';
        const pi = piCode && piCode !== 'NC' ? `P.I. ${piCode}` : '';
        const qta = Number(r['quantita']) || 0;
        const desc = [prod, varClone, pi].filter(Boolean).join(' - ');
        return `${desc} — Q.tà: ${qta.toLocaleString('it-IT')}`;
      })
      .join('\n');

    this.bollaForm.set({
      numeroBolla: this.proponiNumeroBolla(),
      dataBolla: oggiIso,
      cessionarioRagioneSociale: clienteNome,
      cessionarioIndirizzo,
      luogoDestinazione,
      causaleTrasporto: 'Vendita',
      trasportoACuraDi: 'Cedente',
      vettore: '',
      aspettoBeni: '',
      numeroColli: '',
      dataOraInizioTrasporto: this.formattaDataIt(oggiIso),
      noteBolla: '',
      corpoLibero,
    });
    this.bollaModalAperto.set(true);

    // Chiedi all'API il numero reale aggiornato dal database
    this.http
      .get<ProssimoNumeroBollaResponse>(`/api/bolle/prossimo-numero?anno=${annoCorrente}`)
      .subscribe({
        next: (res) => {
          if (res?.numeroBolla) {
            this.aggiornaCampoBolla('numeroBolla', res.numeroBolla);
          }
        },
        error: () => {},
      });
  }

  protected chiudiModalBolla(): void {
    this.bollaModalAperto.set(false);
  }

  protected aggiornaCampoBolla<K extends keyof BollaTrasportoForm>(
    campo: K,
    valore: BollaTrasportoForm[K],
  ): void {
    this.bollaForm.update((prev) => ({ ...prev, [campo]: valore }));
  }

  private escapeHtml(val: unknown): string {
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  protected salvaEStampaBolla(): void {
    const f = this.bollaForm();
    const righe = this.bollaRighe();
    const corpoLibero = (f.corpoLibero || '').trim();
    if (!corpoLibero && righe.length === 0) {
      this.mostraErrore('Specificare la descrizione della merce nel corpo della bolla.');
      return;
    }

    this.salvataggioBollaInCorso.set(true);

    const payload: SalvaBollaPayload = {
      numeroBolla: f.numeroBolla.trim(),
      dataBolla: f.dataBolla,
      cliente: f.cessionarioRagioneSociale.trim(),
      cessionarioIndirizzo: f.cessionarioIndirizzo.trim(),
      luogoDestinazione: f.luogoDestinazione.trim(),
      causaleTrasporto: f.causaleTrasporto.trim(),
      trasportoACuraDi: f.trasportoACuraDi,
      vettore: f.vettore.trim(),
      aspettoBeni: f.aspettoBeni.trim(),
      numeroColli: f.numeroColli.trim(),
      dataOraInizioTrasporto: f.dataOraInizioTrasporto.trim(),
      note: f.noteBolla.trim(),
      corpoLibero,
      righe: righe.map((r) => ({
        ordineId: r.ordine_id || null,
        prodotto: r.prodotto,
        codiceVarieta: r.codice_varieta,
        codiceClone: r.codice_clone,
        codicePortainnesto: r.codice_portainnesto,
        quantita: r.quantita,
      })),
    };

    this.http.post<{ bolla: BollaTrasportoDettaglio }>('/api/bolle', payload).subscribe({
      next: (res) => {
        this.salvataggioBollaInCorso.set(false);
        const salvata = res.bolla;
        this.salvaUltimoNumeroBolla(salvata.numeroBolla);

        // Aggiungi all'elenco locale
        this.bolleArchivio.update((prev) => [
          {
            id: salvata.id,
            numeroBolla: salvata.numeroBolla,
            anno: salvata.anno,
            progressivo: salvata.progressivo,
            dataBolla: salvata.dataBolla,
            cliente: salvata.cliente,
            cessionarioIndirizzo: salvata.cessionarioIndirizzo,
            luogoDestinazione: salvata.luogoDestinazione,
            causaleTrasporto: salvata.causaleTrasporto,
            trasportoACuraDi: salvata.trasportoACuraDi,
            vettore: salvata.vettore,
            aspettoBeni: salvata.aspettoBeni,
            numeroColli: salvata.numeroColli,
            dataOraInizioTrasporto: salvata.dataOraInizioTrasporto,
            note: salvata.note,
            corpoLibero: salvata.corpoLibero,
            createdAt: salvata.createdAt,
            totaleQuantita: salvata.totaleQuantita,
            numeroRighe: salvata.numeroRighe,
          },
          ...prev.filter((item) => item.id !== salvata.id),
        ]);

        this.chiudiModalBolla();
        this.deselezionaTutteLeRighe();
        this.mostraOk(`Bolla N. ${salvata.numeroBolla} salvata nell'Archivio bolle.`);

        // Avvia la stampa
        this.eseguiStampaBollaDaDettaglio(salvata);
      },
      error: (err) => {
        this.salvataggioBollaInCorso.set(false);
        this.mostraErrore(err.error?.error || 'Errore durante il salvataggio della bolla nel database.');
      },
    });
  }

  protected stampaBollaSenzaSalvare(): void {
    const f = this.bollaForm();
    const righe = this.bollaRighe();
    const corpoLibero = (f.corpoLibero || '').trim();
    if (!corpoLibero && righe.length === 0) return;

    this.salvaUltimoNumeroBolla(f.numeroBolla);
    this.eseguiStampaHtml(this.generaHtmlBolla(f, righe));
    this.chiudiModalBolla();
  }

  /**
   * Metodo di fallback compatibile
   */
  protected stampaBolla(): void {
    this.salvaEStampaBolla();
  }

  private eseguiStampaBollaDaDettaglio(d: BollaTrasportoDettaglio): void {
    const righe: BollaRigaArticolo[] = (d.righe || []).map((r) => ({
      ordine_id: r.ordineId || null,
      prodotto: r.prodotto,
      codice_varieta: r.codiceVarieta,
      codice_clone: r.codiceClone,
      codice_portainnesto: r.codicePortainnesto,
      quantita: r.quantita,
    }));

    const f: BollaTrasportoForm = {
      numeroBolla: d.numeroBolla,
      dataBolla: d.dataBolla,
      cessionarioRagioneSociale: d.cliente,
      cessionarioIndirizzo: d.cessionarioIndirizzo || '',
      luogoDestinazione: d.luogoDestinazione,
      causaleTrasporto: d.causaleTrasporto,
      trasportoACuraDi: (d.trasportoACuraDi as any) || 'Cedente',
      vettore: d.vettore || '',
      aspettoBeni: d.aspettoBeni || '',
      numeroColli: d.numeroColli || '',
      dataOraInizioTrasporto: d.dataOraInizioTrasporto || '',
      noteBolla: d.note || '',
      corpoLibero: d.corpoLibero || this.formattaRigheComeTesto(righe),
    };

    this.eseguiStampaHtml(this.generaHtmlBolla(f, righe));
  }

  private generaHtmlBolla(f: BollaTrasportoForm, righe: BollaRigaArticolo[]): string {
    const dataDocIt = this.formattaDataIt(f.dataBolla) || '—';
    const trasportoLabel =
      f.trasportoACuraDi === 'Vettore' && f.vettore.trim()
        ? `Vettore (${f.vettore.trim()})`
        : f.trasportoACuraDi;

    const corpoLibero = f.corpoLibero?.trim() || this.formattaRigheComeTesto(righe);
    const corpoHtml = this.escapeHtml(corpoLibero || '—').replace(/\r?\n/g, '<br>');

    const noteHtml = f.noteBolla.trim()
      ? `<div class="notes-box"><strong>Note:</strong> ${this.escapeHtml(f.noteBolla.trim()).replace(/\r?\n/g, '<br>')}</div>`
      : '';

    return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <title></title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    @media print {
      @page {
        margin: 0;
      }
      html, body {
        margin: 0;
        padding: 0;
      }
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #111827;
      font-size: 11px;
      line-height: 1.4;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .ddt-page {
      width: 100%;
      min-height: 297mm;
      padding: 12mm 14mm;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
    }
    .ddt-main {
      flex: 1 0 auto;
    }
    .ddt-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #1b4332;
      padding-bottom: 8px;
      margin-bottom: 12px;
      gap: 12px;
    }
    .ddt-title {
      font-size: 16px;
      font-weight: 800;
      color: #1b4332;
      letter-spacing: 0.02em;
      margin: 0;
    }
    .ddt-subtitle {
      font-size: 10px;
      color: #4b5563;
      margin-top: 2px;
    }
    .ddt-doc-meta {
      text-align: right;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 6px 10px;
      min-width: 155px;
    }
    .ddt-doc-meta div { font-size: 11px; }
    .ddt-doc-meta strong { font-size: 12px; }
    .parties-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 10px;
    }
    .box {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 8px 10px;
      background: #fff;
    }
    .box-full { margin-bottom: 10px; }
    .box-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #1b4332;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 3px;
      margin-bottom: 5px;
    }
    .box-title {
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .transport-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .transport-cell {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 6px 8px;
      background: #f8fafc;
    }
    .transport-cell .lbl {
      display: block;
      font-size: 8.5px;
      text-transform: uppercase;
      color: #64748b;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .transport-cell .val {
      font-size: 10.5px;
      font-weight: 600;
      color: #0f172a;
      word-break: break-word;
    }
    .items-box {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 10px 12px;
      margin-bottom: 12px;
      background: #fff;
      min-height: 85mm;
    }
    .items-box .items-header {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #1b4332;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 3px;
      margin-bottom: 8px;
    }
    .items-content {
      font-size: 11.5px;
      line-height: 1.6;
      white-space: pre-wrap;
      color: #0f172a;
    }
    .notes-box {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 7px 10px;
      margin-bottom: 12px;
      background: #fffbeb;
      font-size: 10.5px;
    }
    .signatures-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-top: auto;
      padding-top: 14px;
      break-inside: avoid;
    }
    .sig-box {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 7px 10px;
      height: 68px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: #fff;
    }
    .sig-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      color: #475569;
    }
    .sig-line {
      border-top: 1px dashed #94a3b8;
      padding-top: 3px;
      font-size: 8.5px;
      color: #94a3b8;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="ddt-page">
    <div class="ddt-main">
      <div class="ddt-header">
        <div>
          <h1 class="ddt-title">DOCUMENTO DI TRASPORTO (D.P.R. 472 del 14/8/1996 - D.P.R. 696 del 21/12/1996)</h1>
          <div class="ddt-subtitle">Documento accompagnatorio materiale vivaistico viticolo</div>
        </div>
        <div class="ddt-doc-meta">
          <div>N. Documento: <strong>${this.escapeHtml(f.numeroBolla || '—')}</strong></div>
          <div>Data: <strong>${this.escapeHtml(dataDocIt)}</strong></div>
        </div>
      </div>

      <div class="parties-grid">
        <div class="box">
          <div class="box-label">Società Cedente</div>
          <div class="box-title">${this.escapeHtml(this.datiCedente.ragioneSociale)}</div>
          <div>${this.escapeHtml(this.datiCedente.indirizzo)}</div>
          <div>${this.escapeHtml(this.datiCedente.contattiFiscali)}</div>
          <div>${this.escapeHtml(this.datiCedente.autorizzazioni)}</div>
        </div>

        <div class="box">
          <div class="box-label">Società Cessionaria</div>
          <div class="box-title">${this.escapeHtml(f.cessionarioRagioneSociale || '—')}</div>
          <div>${this.escapeHtml(f.cessionarioIndirizzo || 'Indirizzo non specificato')}</div>
        </div>
      </div>

      <div class="box box-full">
        <div class="box-label">Luogo di Destinazione</div>
        <div><strong>${this.escapeHtml(f.luogoDestinazione || '—')}</strong></div>
      </div>

      <div class="transport-grid">
        <div class="transport-cell">
          <span class="lbl">Causale trasporto</span>
          <span class="val">${this.escapeHtml(f.causaleTrasporto || '—')}</span>
        </div>
        <div class="transport-cell">
          <span class="lbl">Trasporto a cura di</span>
          <span class="val">${this.escapeHtml(trasportoLabel)}</span>
        </div>
        <div class="transport-cell">
          <span class="lbl">Aspetto esteriore beni</span>
          <span class="val">${this.escapeHtml(f.aspettoBeni || '—')}</span>
        </div>
        <div class="transport-cell">
          <span class="lbl">Numero colli</span>
          <span class="val">${this.escapeHtml(f.numeroColli || '—')}</span>
        </div>
        <div class="transport-cell">
          <span class="lbl">Data / Ora inizio</span>
          <span class="val">${this.escapeHtml(f.dataOraInizioTrasporto || '—')}</span>
        </div>
      </div>

      <div class="items-box">
        <div class="items-header">Descrizione dei beni / Merce trasportata</div>
        <div class="items-content">${corpoHtml}</div>
      </div>

      ${noteHtml}
    </div>

    <div class="signatures-grid">
      <div class="sig-box">
        <span class="sig-label">Firma del Conducente / Vettore</span>
        <span class="sig-line">Firma per presa in carico</span>
      </div>
      <div class="sig-box">
        <span class="sig-label">Firma del Cessionario / Destinatario</span>
        <span class="sig-line">Firma per ricevuta</span>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  private eseguiStampaHtml(html: string): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Stampa tramite iframe invisibile: evita l'apertura di popup con URL "about:blank"
    // e, unito a @page { margin: 0 }, garantisce che non vengano stampate intestazioni e piè di pagina del browser.
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {}
        setTimeout(() => {
          iframe.remove();
        }, 2000);
      }, 250);
      return;
    }

    // Fallback con popup se l'iframe non è utilizzabile
    const printWin = window.open('', '_blank', 'width=960,height=800');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => {
        printWin.print();
      }, 250);
    }
  }

  // ==========================================================================
  // GESTIONE ARCHIVIO E GENERAZIONE FATTURE DI VENDITA
  // ==========================================================================

  protected caricaFatture(): void {
    this.caricamentoFatture.set(true);
    this.erroreFatture.set(null);
    this.http.get<{ fatture: FatturaSommario[] }>('/api/fatture').subscribe({
      next: (res) => {
        this.fattureArchivio.set(res.fatture || []);
        this.caricamentoFatture.set(false);
      },
      error: (err) => {
        this.caricamentoFatture.set(false);
        this.erroreFatture.set(err.error?.error || 'Errore nel caricamento delle fatture');
      },
    });
  }

  protected apriDettagliFattura(f: FatturaSommario): void {
    this.caricamentoDettaglioFattura.set(true);
    this.http.get<{ fattura: FatturaDettaglio }>(`/api/fatture/${f.id}`).subscribe({
      next: (res) => {
        this.fatturaDettaglioSelezionata.set(res.fattura);
        this.caricamentoDettaglioFattura.set(false);
      },
      error: (err) => {
        this.caricamentoDettaglioFattura.set(false);
        this.mostraErrore(err.error?.error || 'Errore nel recupero della fattura');
      },
    });
  }

  protected chiudiDettagliFattura(): void {
    this.fatturaDettaglioSelezionata.set(null);
  }

  protected ristampaFatturaDaArchivio(f: FatturaSommario | FatturaDettaglio): void {
    if ('righe' in f && Array.isArray((f as FatturaDettaglio).righe)) {
      this.eseguiStampaFatturaDaDettaglio(f as FatturaDettaglio);
      return;
    }

    this.http.get<{ fattura: FatturaDettaglio }>(`/api/fatture/${f.id}`).subscribe({
      next: (res) => {
        this.eseguiStampaFatturaDaDettaglio(res.fattura);
      },
      error: (err) => {
        this.mostraErrore(err.error?.error || 'Impossibile recuperare la fattura per la ristampa');
      },
    });
  }

  protected eliminaFattura(f: FatturaSommario): void {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Sei sicuro di voler eliminare la fattura N. ${f.numeroFattura}? L'operazione non può essere annullata.`,
      );
      if (!ok) return;
    }

    this.http.delete(`/api/fatture/${f.id}`).subscribe({
      next: () => {
        this.fattureArchivio.update((list) => list.filter((item) => item.id !== f.id));
        if (this.fatturaDettaglioSelezionata()?.id === f.id) {
          this.fatturaDettaglioSelezionata.set(null);
        }
        this.mostraOk(`Fattura N. ${f.numeroFattura} eliminata con successo.`);
      },
      error: (err) => {
        this.mostraErrore(err.error?.error || "Errore durante l'eliminazione della fattura");
      },
    });
  }

  private proponiNumeroFattura(): string {
    const anno = new Date().getFullYear();
    try {
      const raw = localStorage.getItem(App.STORAGE_FATTURA_NUM_KEY);
      if (raw) {
        const parts = raw.split('/');
        const n = parseInt(parts[0], 10);
        const y = parts[1] ? parseInt(parts[1], 10) : anno;
        if (!isNaN(n) && y === anno) {
          return `${n + 1}/${anno}`;
        }
      }
    } catch {}
    return `1/${anno}`;
  }

  private salvaUltimoNumeroFattura(num: string): void {
    try {
      const trimmed = (num || '').trim();
      if (/^\d+(?:\/\d{4})?$/.test(trimmed)) {
        localStorage.setItem(App.STORAGE_FATTURA_NUM_KEY, trimmed);
      }
    } catch {}
  }

  protected apriModalNuovaFatturaLibera(): void {
    this.caricaListaClienti();
    const oggiIso = dataOggi();
    const annoCorrente = new Date().getFullYear();
    this.fatturaOrdini.set([]);
    this.fatturaRighe.set([]);

    this.fatturaForm.set({
      numeroFattura: this.proponiNumeroFattura(),
      dataFattura: oggiIso,
      cliente: '',
      partitaIva: '',
      codiceFiscale: '',
      cessionarioIndirizzo: '',
      modalitaPagamento: MODALITA_PAGAMENTO_PREDEFINITA,
      aliquotaIva: ALIQUOTA_IVA_PREDEFINITA,
      totaleMerce: 0,
      totaleIva: 0,
      totaleFattura: 0,
      noteFattura: '',
      corpoLibero: '',
    });
    this.fatturaModalAperto.set(true);

    this.http
      .get<ProssimoNumeroFatturaResponse>(`/api/fatture/prossimo-numero?anno=${annoCorrente}`)
      .subscribe({
        next: (res) => {
          if (res?.numeroFattura) {
            this.aggiornaCampoFattura('numeroFattura', res.numeroFattura);
          }
        },
        error: () => {},
      });
  }

  protected apriModalFattura(): void {
    this.caricaListaClienti();
    const ordini = this.righeSelezionate();
    if (ordini.length === 0) return;

    const clientiDistinti = Array.from(
      new Set(ordini.map((r) => String(r['cliente'] || '').trim()).filter(Boolean)),
    );
    if (clientiDistinti.length === 0) {
      this.mostraErrore('Gli ordini selezionati non hanno un cliente associato.');
      return;
    }
    if (clientiDistinti.length > 1) {
      this.mostraErrore(
        `Impossibile generare la fattura: seleziona ordini appartenenti a un solo cliente (${clientiDistinti.join(', ')}).`,
      );
      return;
    }

    const clienteNome = clientiDistinti[0];
    const clienteTrovato = this.listaClientiAnagrafica().find(
      (c) => c.ragioneSociale.toLowerCase() === clienteNome.toLowerCase(),
    );
    if (clienteTrovato) {
      this.inizializzaEApriModalFattura(ordini, clienteNome, clienteTrovato);
      return;
    }

    this.http.get<{ righe: RigaTabella[] }>('/api/crud/clienti').subscribe({
      next: (res) => {
        const clienti = res.righe ?? [];
        const cObj = clienti.find(
          (c) => String(c['ragione_sociale'] || '').trim() === clienteNome,
        );
        const mappedObj = cObj
          ? {
              ragioneSociale: String(cObj['ragione_sociale'] || '').trim(),
              indirizzo: String(cObj['indirizzo'] || '').trim(),
              citta: String(cObj['citta'] || '').trim(),
              partitaIva: String(cObj['partita_iva'] || '').trim(),
              codiceFiscale: String(cObj['codice_fiscale'] || '').trim(),
            }
          : undefined;
        this.inizializzaEApriModalFattura(ordini, clienteNome, mappedObj);
      },
      error: () => {
        this.inizializzaEApriModalFattura(ordini, clienteNome, undefined);
      },
    });
  }

  private inizializzaEApriModalFattura(
    ordini: RigaTabella[],
    clienteNome: string,
    clienteObj?: {
      ragioneSociale: string;
      indirizzo: string;
      citta: string;
      partitaIva: string;
      codiceFiscale: string;
    },
  ): void {
    this.caricaListaClienti();
    const cessionarioIndirizzo = [clienteObj?.indirizzo, clienteObj?.citta]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(' - ');

    const partitaIva = clienteObj?.partitaIva || '';
    const codiceFiscale = clienteObj?.codiceFiscale || '';

    const oggiIso = dataOggi();
    const annoCorrente = new Date().getFullYear();
    this.fatturaOrdini.set([...ordini]);

    // Costruisci le righe fattura dagli ordini selezionati
    const righe: FatturaRigaForm[] = ordini.map((r) => {
      const qta = Math.max(0, parseInt(String(r['quantita']), 10) || 0);
      const prezzoVenditaRaw = r['prezzo_vendita'];
      const prezzoUnitario =
        typeof prezzoVenditaRaw === 'number'
          ? Math.round(prezzoVenditaRaw * 100) / 100
          : prezzoVenditaRaw
            ? Math.round(parseFloat(String(prezzoVenditaRaw).replace(',', '.')) * 100) / 100
            : 0;
      const importo = Math.round(qta * prezzoUnitario * 100) / 100;
      return {
        ordine_id: r['id'] ? String(r['id']) : null,
        prodotto: String(r['prodotto'] || '').trim(),
        codice_varieta: String(r['codice_varieta'] || '').trim(),
        codice_clone: String(r['codice_clone'] || '').trim(),
        codice_portainnesto: String(r['codice_portainnesto'] || '').trim(),
        quantita: qta,
        prezzo_unitario: prezzoUnitario,
        aliquota_iva: ALIQUOTA_IVA_PREDEFINITA,
        importo,
      };
    });

    this.fatturaRighe.set(righe);

    const totaleMerce = Math.round(righe.reduce((acc, r) => acc + r.importo, 0) * 100) / 100;
    const totaleIva = Math.round(
      righe.reduce((acc, r) => acc + (r.importo * ((r.aliquota_iva ?? 10) / 100)), 0) * 100,
    ) / 100;
    const totaleFattura = Math.round((totaleMerce + totaleIva) * 100) / 100;

    this.fatturaForm.set({
      numeroFattura: this.proponiNumeroFattura(),
      dataFattura: oggiIso,
      cliente: clienteNome,
      partitaIva,
      codiceFiscale,
      cessionarioIndirizzo,
      modalitaPagamento: MODALITA_PAGAMENTO_PREDEFINITA,
      aliquotaIva: ALIQUOTA_IVA_PREDEFINITA,
      totaleMerce,
      totaleIva,
      totaleFattura,
      noteFattura: '',
      corpoLibero: '',
    });
    this.fatturaModalAperto.set(true);

    this.http
      .get<ProssimoNumeroFatturaResponse>(`/api/fatture/prossimo-numero?anno=${annoCorrente}`)
      .subscribe({
        next: (res) => {
          if (res?.numeroFattura) {
            this.aggiornaCampoFattura('numeroFattura', res.numeroFattura);
          }
        },
        error: () => {},
      });
  }

  protected chiudiModalFattura(): void {
    this.fatturaModalAperto.set(false);
  }

  protected aggiornaCampoFattura<K extends keyof FatturaForm>(
    campo: K,
    valore: FatturaForm[K],
  ): void {
    this.fatturaForm.update((prev) => ({ ...prev, [campo]: valore }));
    if (campo === 'aliquotaIva' || campo === 'totaleMerce') {
      this.ricalcolaTotaliFattura();
    }
  }

  protected selezionaClienteFattura(nome: string): void {
    this.aggiornaCampoFattura('cliente', nome);
    const trovato = this.listaClientiAnagrafica().find(
      (c) => c.ragioneSociale.toLowerCase() === nome.trim().toLowerCase(),
    );
    if (trovato) {
      const ind = [trovato.indirizzo, trovato.citta].filter(Boolean).join(' - ');
      this.aggiornaCampoFattura('cessionarioIndirizzo', ind);
      this.aggiornaCampoFattura('partitaIva', trovato.partitaIva || '');
      this.aggiornaCampoFattura('codiceFiscale', trovato.codiceFiscale || '');
    }
  }

  protected aggiornaPrezzoRigaFattura(index: number, valore: any): void {
    const list = [...this.fatturaRighe()];
    if (index >= 0 && index < list.length) {
      const r = list[index];
      const parsed = typeof valore === 'string' ? parseFloat(valore.replace(',', '.')) : Number(valore);
      const p = isNaN(parsed) || parsed < 0 ? 0 : Math.round(parsed * 100) / 100;
      const imp = Math.round(r.quantita * p * 100) / 100;
      list[index] = { ...r, prezzo_unitario: p, importo: imp };
      this.fatturaRighe.set(list);
      this.ricalcolaTotaliFattura();
    }
  }

  protected aggiornaQuantitaRigaFattura(index: number, valore: any): void {
    const list = [...this.fatturaRighe()];
    if (index >= 0 && index < list.length) {
      const r = list[index];
      const q = Math.max(0, parseInt(String(valore), 10) || 0);
      const imp = Math.round(q * r.prezzo_unitario * 100) / 100;
      list[index] = { ...r, quantita: q, importo: imp };
      this.fatturaRighe.set(list);
      this.ricalcolaTotaliFattura();
    }
  }

  protected aggiornaAliquotaIvaRigaFattura(index: number, valore: any): void {
    const list = [...this.fatturaRighe()];
    if (index >= 0 && index < list.length) {
      const r = list[index];
      const a = Math.max(0, Math.min(100, Number(valore) || 0));
      list[index] = { ...r, aliquota_iva: a };
      this.fatturaRighe.set(list);
      this.ricalcolaTotaliFattura();
    }
  }

  protected ricalcolaTotaliFattura(): void {
    const righe = this.fatturaRighe();
    const f = this.fatturaForm();
    let totaleMerce = 0;
    let totaleIva = 0;
    if (righe.length > 0) {
      totaleMerce = Math.round(righe.reduce((acc, r) => acc + r.importo, 0) * 100) / 100;
      totaleIva = Math.round(
        righe.reduce((acc, r) => acc + (r.importo * ((r.aliquota_iva ?? 10) / 100)), 0) * 100,
      ) / 100;
    } else {
      totaleMerce = Math.max(0, Number(f.totaleMerce) || 0);
      const aliquota = Number.isFinite(Number(f.aliquotaIva)) ? Number(f.aliquotaIva) : 10;
      totaleIva = Math.round(totaleMerce * (aliquota / 100) * 100) / 100;
    }
    const totaleFattura = Math.round((totaleMerce + totaleIva) * 100) / 100;

    this.fatturaForm.update((prev) => ({
      ...prev,
      totaleMerce,
      totaleIva,
      totaleFattura,
    }));
  }

  protected formattaValuta(val: number | null | undefined): string {
    const n = Number(val) || 0;
    return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  protected salvaEStampaFattura(): void {
    const f = this.fatturaForm();
    const righe = this.fatturaRighe();
    const corpoLibero = (f.corpoLibero || '').trim();
    if (!corpoLibero && righe.length === 0) {
      this.mostraErrore('Specificare una descrizione dei beni o almeno una riga merce.');
      return;
    }

    this.salvataggioFatturaInCorso.set(true);

    const payload: SalvaFatturaPayload = {
      numeroFattura: f.numeroFattura.trim(),
      dataFattura: f.dataFattura,
      cliente: f.cliente.trim(),
      partitaIva: f.partitaIva.trim(),
      codiceFiscale: f.codiceFiscale.trim(),
      cessionarioIndirizzo: f.cessionarioIndirizzo.trim(),
      modalitaPagamento: f.modalitaPagamento.trim(),
      aliquotaIva: f.aliquotaIva,
      totaleMerce: f.totaleMerce,
      totaleIva: f.totaleIva,
      totaleFattura: f.totaleFattura,
      note: f.noteFattura.trim(),
      corpoLibero,
      righe: righe.map((r) => ({
        ordineId: r.ordine_id || null,
        prodotto: r.prodotto,
        codiceVarieta: r.codice_varieta,
        codiceClone: r.codice_clone,
        codicePortainnesto: r.codice_portainnesto,
        quantita: r.quantita,
        prezzoUnitario: r.prezzo_unitario,
        aliquotaIva: r.aliquota_iva ?? ALIQUOTA_IVA_PREDEFINITA,
        importo: r.importo,
      })),
    };

    this.http.post<{ fattura: FatturaDettaglio }>('/api/fatture', payload).subscribe({
      next: (res) => {
        this.salvataggioFatturaInCorso.set(false);
        const salvata = res.fattura;
        this.salvaUltimoNumeroFattura(salvata.numeroFattura);

        this.fattureArchivio.update((prev) => [
          {
            id: salvata.id,
            numeroFattura: salvata.numeroFattura,
            anno: salvata.anno,
            progressivo: salvata.progressivo,
            dataFattura: salvata.dataFattura,
            cliente: salvata.cliente,
            partitaIva: salvata.partitaIva,
            codiceFiscale: salvata.codiceFiscale,
            cessionarioIndirizzo: salvata.cessionarioIndirizzo,
            modalitaPagamento: salvata.modalitaPagamento,
            aliquotaIva: salvata.aliquotaIva,
            totaleMerce: salvata.totaleMerce,
            totaleIva: salvata.totaleIva,
            totaleFattura: salvata.totaleFattura,
            note: salvata.note,
            corpoLibero: salvata.corpoLibero,
            createdAt: salvata.createdAt,
            totaleQuantita: salvata.totaleQuantita,
            numeroRighe: salvata.numeroRighe,
          },
          ...prev.filter((item) => item.id !== salvata.id),
        ]);

        this.chiudiModalFattura();
        this.deselezionaTutteLeRighe();
        this.mostraOk(`Fattura N. ${salvata.numeroFattura} salvata nell'Archivio fatture.`);

        // Avvia la stampa
        this.eseguiStampaFatturaDaDettaglio(salvata);
      },
      error: (err) => {
        this.salvataggioFatturaInCorso.set(false);
        this.mostraErrore(err.error?.error || 'Errore durante il salvataggio della fattura.');
      },
    });
  }

  protected stampaFatturaSenzaSalvare(): void {
    const f = this.fatturaForm();
    const righe = this.fatturaRighe();
    const corpoLibero = (f.corpoLibero || '').trim();
    if (!corpoLibero && righe.length === 0) return;

    this.salvaUltimoNumeroFattura(f.numeroFattura);
    this.eseguiStampaHtml(this.generaHtmlFattura(f, righe));
    this.chiudiModalFattura();
  }

  protected stampaFattura(): void {
    this.salvaEStampaFattura();
  }

  private eseguiStampaFatturaDaDettaglio(d: FatturaDettaglio): void {
    const righe: FatturaRigaForm[] = (d.righe || []).map((r) => ({
      ordine_id: r.ordineId || null,
      prodotto: r.prodotto,
      codice_varieta: r.codiceVarieta,
      codice_clone: r.codiceClone,
      codice_portainnesto: r.codicePortainnesto,
      quantita: r.quantita,
      prezzo_unitario: r.prezzoUnitario,
      aliquota_iva: r.aliquotaIva ?? ALIQUOTA_IVA_PREDEFINITA,
      importo: r.importo,
    }));

    const f: FatturaForm = {
      numeroFattura: d.numeroFattura,
      dataFattura: d.dataFattura,
      cliente: d.cliente,
      partitaIva: d.partitaIva || '',
      codiceFiscale: d.codiceFiscale || '',
      cessionarioIndirizzo: d.cessionarioIndirizzo || '',
      modalitaPagamento: d.modalitaPagamento || MODALITA_PAGAMENTO_PREDEFINITA,
      aliquotaIva: d.aliquotaIva ?? ALIQUOTA_IVA_PREDEFINITA,
      totaleMerce: d.totaleMerce,
      totaleIva: d.totaleIva,
      totaleFattura: d.totaleFattura,
      noteFattura: d.note || '',
      corpoLibero: d.corpoLibero || '',
    };

    this.eseguiStampaHtml(this.generaHtmlFattura(f, righe));
  }

  private generaHtmlFattura(f: FatturaForm, righe: FatturaRigaForm[]): string {
    const dataDocIt = this.formattaDataIt(f.dataFattura) || '—';
    const corpoLiberoTrim = (f.corpoLibero || '').trim();
    const corpoHtml = corpoLiberoTrim
      ? `<div class="corpo-libero-box">${this.escapeHtml(corpoLiberoTrim).replace(/\r?\n/g, '<br>')}</div>`
      : '';

    const noteHtml = f.noteFattura.trim()
      ? `<div class="notes-box"><strong>Note:</strong> ${this.escapeHtml(f.noteFattura.trim()).replace(/\r?\n/g, '<br>')}</div>`
      : '';

    let righeTableHtml = '';
    if (righe.length > 0) {
      const rowsHtml = righe
        .map((r) => {
          const varClone =
            r.codice_varieta && r.codice_varieta !== 'NC'
              ? `${r.codice_varieta}${r.codice_clone && r.codice_clone !== 'NC' ? ` (Cl. ${r.codice_clone})` : ''}`
              : '';
          const pi = r.codice_portainnesto && r.codice_portainnesto !== 'NC' ? `P.I. ${r.codice_portainnesto}` : '';
          const desc = [r.prodotto, varClone, pi].filter(Boolean).join(' - ');
          return `<tr>
            <td><strong>${this.escapeHtml(desc)}</strong></td>
            <td style="text-align: right; width: 90px;">${r.quantita.toLocaleString('it-IT')}</td>
            <td style="text-align: right; width: 105px;">${this.formattaValuta(r.prezzo_unitario)}</td>
            <td style="text-align: center; width: 70px;">${r.aliquota_iva ?? 10}%</td>
            <td style="text-align: right; width: 115px; font-weight: 700;">${this.formattaValuta(r.importo)}</td>
          </tr>`;
        })
        .join('');

      righeTableHtml = `
        <table class="invoice-table">
          <thead>
            <tr>
              <th>Descrizione merce / beni</th>
              <th style="text-align: right; width: 90px;">Quantità</th>
              <th style="text-align: right; width: 105px;">Prezzo unit.</th>
              <th style="text-align: center; width: 70px;">IVA %</th>
              <th style="text-align: right; width: 115px;">Importo netto</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      `;
    }

    return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <title></title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm;
    }
    @media print {
      @page {
        size: A4 portrait;
        margin: 10mm 12mm;
      }
      html, body {
        height: 100%;
        margin: 0;
        padding: 0;
      }
      .fattura-page {
        height: 100vh;
        min-height: calc(297mm - 20mm);
        max-height: calc(297mm - 20mm);
        padding: 0;
      }
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      min-height: 100%;
      height: 100%;
      background: #fff;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #111827;
      font-size: 11px;
      line-height: 1.4;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .fattura-page {
      width: 100%;
      min-height: calc(297mm - 24mm);
      height: 100%;
      padding: 10mm 12mm;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
    }
    .fattura-main {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .fattura-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #1b4332;
      padding-bottom: 8px;
      margin-bottom: 12px;
      gap: 12px;
    }
    .fattura-title {
      font-size: 18px;
      font-weight: 800;
      color: #1b4332;
      letter-spacing: 0.02em;
      margin: 0;
    }
    .fattura-subtitle {
      font-size: 10px;
      color: #4b5563;
      margin-top: 2px;
    }
    .fattura-doc-meta {
      text-align: right;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 6px 12px;
      min-width: 175px;
    }
    .fattura-doc-meta div { font-size: 11.5px; margin-bottom: 2px; }
    .fattura-doc-meta strong { font-size: 13px; color: #1b4332; }
    .parties-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 12px;
    }
    .box {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 9px 12px;
      background: #fff;
    }
    .box-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #1b4332;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 3px;
      margin-bottom: 6px;
    }
    .box-title {
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 3px;
      color: #0f172a;
    }
    .box-fiscal {
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px dashed #e2e8f0;
      font-size: 10.5px;
      color: #334155;
    }
    .payment-box {
      border: 1px solid #cbd5e1;
      background: #f0fdf4;
      border-left: 4px solid #16a34a;
      border-radius: 4px;
      padding: 8px 12px;
      margin-bottom: 14px;
    }
    .payment-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      color: #166534;
      margin-bottom: 3px;
      display: block;
    }
    .payment-value {
      font-size: 11px;
      font-weight: 600;
      color: #14532d;
    }
    .invoice-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
    }
    .invoice-table th {
      background: #f1f5f9;
      color: #1e293b;
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 7px 8px;
      border: 1px solid #cbd5e1;
    }
    .invoice-table td {
      padding: 7px 8px;
      border: 1px solid #e2e8f0;
      font-size: 11px;
    }
    .invoice-table tr:nth-child(even) td {
      background: #fafafa;
    }
    .corpo-libero-box {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 9px 12px;
      margin-bottom: 14px;
      background: #fff;
      font-size: 11.5px;
      line-height: 1.6;
    }
    .notes-box {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 7px 10px;
      margin-bottom: 12px;
      background: #fffbeb;
      font-size: 10.5px;
    }
    .cortesia-box {
      border: 1.5px solid #cbd5e1;
      background: #f8fafc;
      border-radius: 4px;
      padding: 7px 12px;
      text-align: center;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #1b4332;
      margin-bottom: 14px;
    }
    .totals-container {
      display: flex;
      justify-content: flex-end;
      margin-top: auto;
      margin-bottom: 0;
      padding-top: 16px;
    }
    .totals-box {
      width: 260px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: #f8fafc;
      overflow: hidden;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 12px;
      font-size: 11px;
      border-bottom: 1px solid #e2e8f0;
    }
    .totals-row.grand-total {
      background: #1b4332;
      color: #fff;
      font-weight: 800;
      font-size: 13px;
      border-bottom: none;
      padding: 8px 12px;
    }
    .signatures-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-top: auto;
      padding-top: 14px;
      break-inside: avoid;
    }
    .sig-box {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 7px 10px;
      height: 64px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: #fff;
    }
    .sig-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      color: #475569;
    }
    .sig-line {
      border-top: 1px dashed #94a3b8;
      padding-top: 3px;
      font-size: 8.5px;
      color: #94a3b8;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="fattura-page">
    <div class="fattura-main">
      <div class="fattura-header">
        <div>
          <h1 class="fattura-title">FATTURA DI VENDITA</h1>
          <div class="fattura-subtitle">Documento fiscale vendita materiale vivaistico viticolo</div>
        </div>
        <div class="fattura-doc-meta">
          <div>N. Fattura: <strong>${this.escapeHtml(f.numeroFattura || '—')}</strong></div>
          <div>Data: <strong>${this.escapeHtml(dataDocIt)}</strong></div>
        </div>
      </div>

      <div class="parties-grid">
        <div class="box">
          <div class="box-label">Cedente / Prestatore</div>
          <div class="box-title">${this.escapeHtml(this.datiCedente.ragioneSociale)}</div>
          <div>${this.escapeHtml(this.datiCedente.indirizzo)}</div>
          <div class="box-fiscal">${this.escapeHtml(this.datiCedente.contattiFiscali)}</div>
          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">${this.escapeHtml(this.datiCedente.autorizzazioni)}</div>
        </div>

        <div class="box">
          <div class="box-label">Cessionario / Committente</div>
          <div class="box-title">${this.escapeHtml(f.cliente || '—')}</div>
          <div>${this.escapeHtml(f.cessionarioIndirizzo || 'Indirizzo non specificato')}</div>
          <div class="box-fiscal">
            ${f.partitaIva ? `<div><strong>P.IVA:</strong> ${this.escapeHtml(f.partitaIva)}</div>` : ''}
            ${f.codiceFiscale ? `<div><strong>C.F.:</strong> ${this.escapeHtml(f.codiceFiscale)}</div>` : ''}
            ${!f.partitaIva && !f.codiceFiscale ? '<div class="text-muted">P.IVA / C.F. non specificati</div>' : ''}
          </div>
        </div>
      </div>

      <div class="payment-box">
        <span class="payment-label">Modalità di Pagamento</span>
        <div class="payment-value">${this.escapeHtml(f.modalitaPagamento)}</div>
      </div>

      <div class="cortesia-box">Fattura di cortesia</div>

      ${righeTableHtml}

      ${corpoHtml}

      ${noteHtml}

      <div class="totals-container">
        <div class="totals-box">
          <div class="totals-row">
            <span>Totale Merce (Imponibile):</span>
            <strong>${this.formattaValuta(f.totaleMerce)}</strong>
          </div>
          ${righe.length > 0 ? '' : `
          <div class="totals-row">
            <span>Aliquota I.V.A.:</span>
            <span>${f.aliquotaIva}%</span>
          </div>`}
          <div class="totals-row">
            <span>Totale I.V.A.:</span>
            <strong>${this.formattaValuta(f.totaleIva)}</strong>
          </div>
          <div class="totals-row grand-total">
            <span>TOTALE FATTURA:</span>
            <span>${this.formattaValuta(f.totaleFattura)}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }
}
