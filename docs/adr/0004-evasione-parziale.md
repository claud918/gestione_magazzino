# ADR-0004 — Spedizione parziale degli ordini clienti ("Ordinato" vs "Di cui Spedito")

- **Stato:** Accettato (aggiornato per Cooperativa Barbatelle)
- **Data:** 2026-10-28

## Contesto

Un ordine cliente può essere spedito in un'unica soluzione o in più tranche. Sia l'amministrazione sia i commerciali devono distinguere chiaramente tra quanto è stato **ordinato** in totale e quanto è **"di cui spedito"**.

## Decisione

- Ogni `riga_ordine` mantiene `quantita_ordinata` ($> 0$) e `quantita_spedita` ($0 \le \text{quantita\_spedita} \le \text{quantita\_ordinata}$).
- L'amministrazione può registrare spedizioni totali (porta tutte le righe a `quantita_spedita = quantita_ordinata`) o parziali (incrementando o impostando `quantita_spedita` riga per riga).
- Lo stato dell'ordine viene ricalcolato automaticamente nella stessa transazione (`batch()` D1):
  - se tutte le righe hanno `quantita_spedita == quantita_ordinata` → `spedito`;
  - se almeno una riga ha `quantita_spedita > 0` ma non tutte sono complete → `parzialmente_spedito`.
- Se un ordine `parzialmente_spedito` non verrà completato, l'amministrazione può impostarlo come `chiuso`: in tale stato la quantità impegnata nel Magazzino Virtuale diventa uguale alla sola `quantita_spedita`, liberando il residuo non spedito.

## Conseguenze

- ✅ Gestione immediata e intuitiva del *"di cui spedito"* richiesta dall'utente.
- ✅ Chiusura parziale che rilascia automaticamente la merce non ritirata nel Magazzino Virtuale.
