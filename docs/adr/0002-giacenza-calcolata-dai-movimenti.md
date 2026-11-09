# ADR-0002 — Indicatori di disponibilità calcolati da conferimenti e ordini

- **Stato:** Accettato (aggiornato per Cooperativa Barbatelle)
- **Data:** 2026-10-28

## Contesto

Per ogni combinazione di barbatella (`varieta_id`, `clone_id`, `portainnesto_id`) servono contemporaneamente più indicatori: quanto hanno conferito i soci (*Prodotto*), quanto è impegnato dagli ordini clienti (*Ordinato*), quanto è già uscito (*Di cui Spedito*), quanto è vendibile dai commerciali (*Disponibile / Magazzino Virtuale*) e quanto manca da coprire coi conferimenti dei soci (*Fabbisogno Scoperto*).

## Decisione

Nessuno di questi saldi viene salvato in una colonna ridondante: vengono **calcolati con una query aggregata SQL** a partire da `conferimenti_lotti` e da `ordini_clienti` + `righe_ordine`:

- `prodotto = COALESCE(SUM(conferimenti_lotti.quantita_conferita), 0)`
- `ordinato = COALESCE(SUM(CASE WHEN stato = 'chiuso' THEN quantita_spedita WHEN stato IN ('confermato','parzialmente_spedito','spedito') THEN quantita_ordinata ELSE 0 END), 0)`
- `spedito = COALESCE(SUM(CASE WHEN stato != 'annullato' AND stato != 'bozza' THEN quantita_spedita ELSE 0 END), 0)`
- `disponibileVirtuale = prodotto - ordinato`
- `giacenzaFisica = prodotto - spedito`
- `fabbisognoScoperto = MAX(0, ordinato - prodotto)`

## Conseguenze

- ✅ Una sola fonte di verità: non c'è mai disallineamento tra conferimenti, ordini e disponibilità vista dai commerciali.
- ✅ Quando un ordine viene modificato, spedito parzialmente, chiuso o annullato, la disponibilità del Magazzino Virtuale e il Fabbisogno Scoperto si aggiornano istantaneamente senza bisogno di ricalcoli batch.
- ⚠️ Richiede indici su `(varieta_id, clone_id, portainnesto_id)` sia in `conferimenti_lotti` sia in `righe_ordine`.
