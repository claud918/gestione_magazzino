import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import {
  TABELLE,
  NOMI_TABELLE,
  campiModificabili,
  validaRiga,
  dataOggi,
  campagnaCorrente,
  processaCsvPerTabella,
  generaTemplateCsv,
  type NomeTabella,
  type DefinizioneTabella,
  type CampoTabella,
  type RigaTabella,
  type RigaDisponibilita,
  type UtenteProfilo,
  type RisultatoParsingCsv,
} from '@magazzino/shared';

type SezioneAttiva = 'disponibilita' | 'tabella';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  // Messaggi feedback
  protected readonly messaggioOk = signal<string | null>(null);
  protected readonly messaggioErrore = signal<string | null>(null);

  // Dati CRUD
  protected readonly caricamentoDati = signal(false);
  protected readonly righeTabella = signal<RigaTabella[]>([]);
  protected readonly opzioniRiferimento = signal<Record<string, any[]>>({});
  protected readonly ricercaTesto = signal('');

  // Maschera Modale Inserimento/Modifica
  protected readonly modalAperto = signal(false);
  protected readonly modalModo = signal<'nuovo' | 'modifica'>('nuovo');
  protected readonly modalValori = signal<Record<string, any>>({});
  protected readonly modalErrori = signal<Record<string, string>>({});
  protected readonly rigaInModifica = signal<RigaTabella | null>(null);

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
  protected readonly filtroDispCampagna = signal<string>('');
  protected readonly filtroDispProdotto = signal<string>('');
  protected readonly filtroDispSoloDisponibili = signal(false);
  protected readonly filtroDispSoloScoperti = signal(false);
  protected readonly filtroDispRicerca = signal('');

  // Computed: definizione della tabella attiva
  protected readonly defTabella = computed<DefinizioneTabella>(() => {
    return this.tabelleMap[this.tabellaSelezionata()];
  });

  // Computed: campi compilabili della tabella attiva
  protected readonly campiForm = computed<CampoTabella[]>(() => {
    return campiModificabili(this.defTabella());
  });

  // Computed: righe filtrate della tabella corrente
  protected readonly righeFiltrate = computed<RigaTabella[]>(() => {
    const q = this.ricercaTesto().trim().toLowerCase();
    const righe = this.righeTabella();
    if (!q) return righe;
    return righe.filter((riga) => {
      return Object.values(riga).some((val) => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(q);
      });
    });
  });

  // Computed: disponibilità filtrata
  protected readonly disponibilitaFiltrata = computed<RigaDisponibilita[]>(() => {
    const righe = this.listaDisponibilita();
    const q = this.filtroDispRicerca().trim().toLowerCase();
    const soloDisp = this.filtroDispSoloDisponibili();
    const soloScop = this.filtroDispSoloScoperti();

    return righe.filter((r) => {
      if (soloDisp && r.disponibile <= 0) return false;
      if (soloScop && r.scoperto <= 0) return false;
      if (q) {
        const full = `${r.campagna} ${r.prodotto} ${r.codice_varieta} ${r.codice_clone} ${r.codice_portainnesto} ${r.tipologia}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });
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

  ngOnInit(): void {
    if (typeof window !== 'undefined' && 'scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
      window.scrollTo({ top: 0, left: 0 });
    }
    this.verificaSessione();
  }

  // --- Auth ---
  protected verificaSessione(): void {
    this.caricamentoIniziale.set(true);
    this.http.get<{ utente: UtenteProfilo }>('/api/auth/me').subscribe({
      next: (res) => {
        this.utente.set(res.utente);
        this.caricamentoIniziale.set(false);
        this.inizializzaDati();
      },
      error: () => {
        this.utente.set(null);
        this.caricamentoIniziale.set(false);
      },
    });
  }

  protected eseguiLogin(): void {
    if (!this.loginEmail() || !this.loginPassword()) {
      this.loginErrore.set('Inserisci email e password');
      return;
    }
    this.inInvio.set(true);
    this.loginErrore.set(null);
    this.http
      .post<{ utente: UtenteProfilo }>('/api/auth/login', {
        email: this.loginEmail(),
        password: this.loginPassword(),
      })
      .subscribe({
        next: (res) => {
          this.utente.set(res.utente);
          this.inInvio.set(false);
          this.inizializzaDati();
        },
        error: (err) => {
          this.inInvio.set(false);
          this.loginErrore.set(err.error?.error || 'Credenziali non valide');
        },
      });
  }

  protected eseguiLogout(): void {
    this.http.post('/api/auth/logout', {}).subscribe(() => {
      this.utente.set(null);
    });
  }

  // --- Inizializzazione ---
  private inizializzaDati(): void {
    this.caricaDisponibilita();
    this.caricaDatiTabella(this.tabellaSelezionata());
  }

  protected selezionaSezione(sez: SezioneAttiva): void {
    this.sezioneAttiva.set(sez);
    this.menuMobileAperto.set(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    if (sez === 'disponibilita') {
      this.caricaDisponibilita();
    } else {
      this.caricaDatiTabella(this.tabellaSelezionata());
    }
  }

  protected selezionaTabella(tab: NomeTabella): void {
    this.tabellaSelezionata.set(tab);
    this.sezioneAttiva.set('tabella');
    this.menuMobileAperto.set(false);
    this.ricercaTesto.set('');
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

  // --- Modale Form Inserimento / Modifica ---
  protected apriModalNuovo(): void {
    const val: Record<string, any> = {};
    for (const c of this.campiForm()) {
      if (c.predefinito === 'oggi') {
        val[c.nome] = dataOggi();
      } else if (c.predefinito === 'campagna_corrente') {
        val[c.nome] = campagnaCorrente();
      } else if (c.predefinito !== undefined) {
        val[c.nome] = c.predefinito;
      } else if (c.tipo === 'booleano') {
        val[c.nome] = false;
      } else {
        val[c.nome] = '';
      }
    }
    this.modalValori.set(val);
    this.modalErrori.set({});
    this.modalModo.set('nuovo');
    this.rigaInModifica.set(null);
    this.modalAperto.set(true);
  }

  protected apriModalModifica(riga: RigaTabella): void {
    const val: Record<string, any> = { ...riga };
    this.modalValori.set(val);
    this.modalErrori.set({});
    this.modalModo.set('modifica');
    this.rigaInModifica.set(riga);
    this.modalAperto.set(true);
  }

  protected chiudiModal(): void {
    this.modalAperto.set(false);
    this.modalErrori.set({});
    this.rigaInModifica.set(null);
  }

  /** Gestione menu a cascata e auto-compilazione */
  protected onCampoChange(campo: CampoTabella): void {
    const val = this.modalValori();

    // Se il campo referenziato ha un'istruzione di auto-compilazione (es. Ordine -> Lotto)
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
    return filtrate.filter((item: any) => {
      const val = item[campo.riferimento!.colonna];
      if (val === null || val === undefined || val === '') return false;
      const chiave = String(val).trim();
      if (visti.has(chiave)) return false;
      visti.add(chiave);
      return true;
    });
  }

  protected isCampoDisabilitato(campo: CampoTabella): boolean {
    // Se siamo in ordine_impieghi e c'è un riferimento_lotto selezionato, i campi presi dal lotto sono bloccati
    if (this.tabellaSelezionata() === 'ordine_impieghi') {
      const lotto = this.modalValori()['riferimento_lotto'];
      const campiDerivatiDaLotto = [
        'campagna',
        'prodotto',
        'codice_varieta',
        'codice_clone',
        'codice_portainnesto',
        'tipologia',
      ];
      if (lotto && campiDerivatiDaLotto.includes(campo.nome)) {
        return true;
      }
    }
    // In modifica, le chiavi primarie testuali (se non uuid) non si modificano
    if (this.modalModo() === 'modifica' && this.defTabella().chiave.includes(campo.nome)) {
      return true;
    }
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
          this.chiudiModal();
          this.mostraOk('Elemento inserito con successo');
          this.caricaDatiTabella(def.nome);
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
          this.chiudiModal();
          this.mostraOk('Elemento modificato con successo');
          this.caricaDatiTabella(def.nome);
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
    ]);
    const dataStr = new Date().toISOString().slice(0, 10);
    this.scaricaCsv(`disponibilita_magazzino_${dataStr}.csv`, [intestazioni, ...righe]);
    this.mostraOk('Report disponibilità scaricato in formato CSV');
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
            this.tabellaSelezionata() === 'ordine_impieghi'
          ) {
            this.caricaDisponibilita();
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
