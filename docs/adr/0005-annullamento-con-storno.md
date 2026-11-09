# ADR-0005 — Annullamento di ordini clienti e ripristino immediato del Magazzino Virtuale

- **Stato:** Accettato (aggiornato per Cooperativa Barbatelle)
- **Data:** 2026-10-28

## Contesto

Se un cliente disdice un ordine, la quantità che era stata impegnata deve tornare immediatamente visibile come **Disponibile** nel **Magazzino Virtuale** consultato dai commerciali, senza perdere traccia dell'ordine nello storico amministrativo.

## Decisione

- Un ordine cliente non viene eliminato fisicamente dal database, ma passa allo stato `annullato` (con eventuale nota del motivo).
- Poiché gli indicatori `ordinato` e `spedito` escludono gli ordini in stato `annullato` (ADR-0002), il passaggio allo stato `annullato` libera istantaneamente le quantità nel **Magazzino Virtuale** (`disponibileVirtuale = prodotto - ordinato`) e riduce eventuale `fabbisognoScoperto`.

## Conseguenze

- ✅ Storico ordini preservato per l'amministrazione.
- ✅ Effetto immediato e automatico sulle viste dei Commerciali e dei Soci Produttori.
