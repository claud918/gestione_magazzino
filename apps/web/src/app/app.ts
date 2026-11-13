import { Component, computed, HostListener, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { StickyScrollbarDirective } from './sticky-scrollbar.directive';
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
  type NomeTabella,
  type DefinizioneTabella,
  type CampoTabella,
  type RigaTabella,
  type RigaDisponibilita,
  type RigaResa,
  type UtenteProfilo,
  type RisultatoParsingCsv,
} from '@magazzino/shared';

type SezioneAttiva = 'disponibilita' | 'rese' | 'tabella';

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
  protected readonly filtroDispProdotto = signal<string>('Barbatelle innestate');
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
  protected readonly filtroReseProdotto = signal<string>('Barbatelle innestate');
  protected readonly filtroReseRicerca = signal('');

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
    set.add('Barbatelle innestate');
    set.add('Pezzoni Barbatelloni');
    set.add('Pezzoni Standard');
    set.add('Marze');
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
    return hasSingoli || hasMulti;
  });

  protected readonly haOrdinamentoColonnaAttivo = computed<boolean>(() => {
    const chiave = this.chiaveTabellaAttiva();
    return !!this.ordinamentoColonna()[chiave];
  });

  protected readonly opzioniColonnaFiltroAperta = computed<string[]>(() => {
    const campo = this.colonnaFiltroAperta();
    if (!campo) return [];

    const tipoFiltro = this.getTipoFiltroColonna(campo);
    if (tipoFiltro === 'testo') return [];
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
    return this.tabellaSelezionata();
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

  protected getTipoFiltroColonna(campo: CampoTabella): 'select' | 'multiselect' | 'testo' {
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

  protected isColonnaFiltrata(nomeCampo: string): boolean {
    const chiave = this.chiaveTabellaAttiva();
    const singolo = (this.filtriColonne()[chiave]?.[nomeCampo] ?? '').trim();
    const multi = this.filtriMultiColonne()[chiave]?.[nomeCampo];
    return singolo !== '' || (!!multi && multi.length > 0);
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

  private applicaFiltriEOrdinamentoColonne<T extends Record<string, any>>(
    righe: T[],
    campi: CampoTabella[],
    chiave: string,
    ordinamentoDefault?: (a: T, b: T) => number,
  ): T[] {
    const filtri = this.filtriColonne()[chiave];
    const filtriMulti = this.filtriMultiColonne()[chiave];
    const mappaCampi = new Map(campi.map((c) => [c.nome, c]));

    const attiviSingoli = filtri
      ? Object.entries(filtri).filter(([, val]) => val.trim() !== '')
      : [];
    const attiviMulti = filtriMulti
      ? Object.entries(filtriMulti).filter(([, arr]) => arr.length > 0)
      : [];

    let risultato = righe;
    if (attiviSingoli.length > 0 || attiviMulti.length > 0) {
      risultato = righe.filter((riga) => {
        const okSingoli = attiviSingoli.every(([nomeCampo, valFiltro]) => {
          const campo = mappaCampi.get(nomeCampo);
          if (!campo) return true;
          return this.verificaFiltroColonna(campo, riga[nomeCampo], valFiltro);
        });
        if (!okSingoli) return false;

        return attiviMulti.every(([nomeCampo, valoriAmmessi]) => {
          const valStr =
            riga[nomeCampo] === null || riga[nomeCampo] === undefined
              ? ''
              : String(riga[nomeCampo]).trim();
          return valoriAmmessi.includes(valStr);
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
        d.prodotto === (prodotto || 'Barbatelle innestate') &&
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
      prodotto: prodotto || 'Barbatelle innestate',
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
      // Requisito: nel report rese si mostri solo i record che hanno una produzione (prodotto_qta <> 0)
      if (!r.prodotto_qta || r.prodotto_qta === 0) return false;
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
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    this.caricaDatiTabella(tab);
  }

  // --- CRUD API ---
  protected caricaDatiTabella(nome: NomeTabella): void {
    this.caricamentoDati.set(true);
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

  // --- Modale Form Inserimento / Modifica ---
  protected apriModalNuovo(): void {
    this.ricercaOpzioniPerCampo.set({});
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
    const prod = String(val['prodotto'] || '').trim();
    if (prod === 'Pezzoni Barbatelloni' || prod === 'Pezzoni Standard') {
      val['codice_varieta'] = 'NC';
      val['codice_clone'] = 'NC';
    }
    if (prod === 'Marze') {
      val['codice_portainnesto'] = 'NC';
    }
    this.modalValori.set(val);
    this.modalErrori.set({});
    this.modalModo.set('nuovo');
    this.rigaInModifica.set(null);
    this.modalAperto.set(true);
  }

  protected apriModalModifica(riga: RigaTabella): void {
    this.ricercaOpzioniPerCampo.set({});
    if (this.tabellaSelezionata() === 'ordine_impieghi') {
      this.caricaDisponibilita();
    }
    const val: Record<string, any> = { ...riga };
    this.modalValori.set(val);
    this.modalErrori.set({});
    this.modalModo.set('modifica');
    this.rigaInModifica.set(riga);
    this.modalAperto.set(true);
  }

  protected selezionaRiga(riga: RigaTabella): void {
    if (this.rigaSelezionata() === riga) {
      this.rigaSelezionata.set(null);
    } else {
      this.rigaSelezionata.set(riga);
    }
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

    // Regole speciali Pezzoni e Marze
    if (campo.nome === 'prodotto') {
      const prod = String(val['prodotto'] || '').trim();
      if (prod === 'Pezzoni Barbatelloni' || prod === 'Pezzoni Standard') {
        val['codice_varieta'] = 'NC';
        val['codice_clone'] = 'NC';
      }
      if (prod === 'Marze') {
        val['codice_portainnesto'] = 'NC';
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
        const prod = String(val['prodotto'] || '').trim();
        if (prod === 'Pezzoni Barbatelloni' || prod === 'Pezzoni Standard') {
          val['codice_varieta'] = 'NC';
          val['codice_clone'] = 'NC';
        }
        if (prod === 'Marze') {
          val['codice_portainnesto'] = 'NC';
        }
        this.modalValori.set({ ...val });
      }
    }

    // Se modifico un campo genitore (es. centro_di_costo o codice_varieta), resetto i figli dipendenti
    for (const c of this.campiForm()) {
      if (c.riferimento?.filtro?.campo === campo.nome) {
        // Valida se l'attuale valore del figlio è ancora ammesso
        const opzFiglio = this.getOpzioniPerCampo(c);
        const esiste = opzFiglio.some((o: any) => o[c.riferimento!.colonna] === val[c.nome]);
        if (!esiste) {
          val[c.nome] = '';
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
      if (!valoreGenitore) return [];
      filtrate = tutte.filter((item: any) => item[colonnaRif] === valoreGenitore);
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

    // Pezzoni: varietà e clone non devono essere alimentati
    if (
      (prod === 'Pezzoni Barbatelloni' || prod === 'Pezzoni Standard') &&
      (campo.nome === 'codice_varieta' || campo.nome === 'codice_clone')
    ) {
      return true;
    }

    // Marze: portainnesto non deve essere alimentato
    if (prod === 'Marze' && campo.nome === 'codice_portainnesto') {
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
    }

    // In modifica, le chiavi primarie testuali (se non uuid) non si modificano tranne il soprannome in anagrafica_personale che deve essere editabile
    if (this.modalModo() === 'modifica' && this.defTabella().chiave.includes(campo.nome)) {
      if (this.defTabella().nome === 'anagrafica_personale' && campo.nome === 'soprannome') {
        return false;
      }
      return true;
    }

    // Requisito 6: riferimento innesto nella tabella degli ordini NON è vincolato dal lotto ed è sempre editabile
    return false;
  }

  protected salvaRiga(): void {
    const def = this.defTabella();
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

  protected formattaValoreTabella(campo: CampoTabella, val: any): string {
    if (val === null || val === undefined || val === '') return '—';
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
}
