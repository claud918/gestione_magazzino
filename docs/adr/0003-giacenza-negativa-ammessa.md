# ADR-0003 — Disponibilità virtuale negativa ammessa (Fabbisogno Scoperto per i Soci)

- **Stato:** Accettato (aggiornato per Cooperativa Barbatelle)
- **Data:** 2026-10-28

## Contesto

Nella cooperativa capita regolarmente che l'amministrazione registri ordini clienti per combinazioni `Varietà + Clone + Portainnesto` prima che i soci abbiano conferito tutti i lotti necessari, oppure per quantità superiori a quanto conferito fino a quel momento.

## Decisione

- L'inserimento o la conferma di un ordine cliente che porta `disponibileVirtuale` (`prodotto - ordinato`) sotto zero è **sempre ammesso** con un avviso non bloccante per l'amministratrice.
- Quando `ordinato > prodotto`, la differenza positiva `ordinato - prodotto` alimenta automaticamente l'indicatore **Fabbisogno Scoperto**, messo in evidenza nella **Vista 2 (Pannello Produttori / Soci)** affinché i soci sappiano cosa conferire o l'amministrazione sappia cosa acquistare da terzi.
- Nella **Vista 1 (Pannello Commerciali)** le combinazioni con `disponibileVirtuale <= 0` appaiono come non disponibili alla vendita.

## Conseguenze

- ✅ L'operatività dell'amministrazione non viene mai bloccata.
- ✅ Il saldo negativo ha un significato di business preciso (*Fabbisogno Scoperto*) ed è il motore della Vista Produttori.
