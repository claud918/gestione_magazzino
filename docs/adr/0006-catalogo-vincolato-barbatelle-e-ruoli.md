# ADR-0006 — Catalogo vincolato (Varietà → Clone + Portainnesto), separazione Lotti/Ordini e 3 Ruoli utente

- **Stato:** Accettato
- **Data:** 2026-10-28

## Contesto

Dall'analisi del dominio della Cooperativa Barbatelle (`REQUISITI.md`) emergono tre vincoli fondamentali:
1. I nomi delle varietà, dei cloni e dei portainnesti sono regolamentati da registri ufficiali e non devono mai essere digitati a mano nei conferimenti o negli ordini (per evitare refusi che spezzerebbero i conteggi). Inoltre ogni Clone appartiene a una specifica Varietà.
2. I soci conferiscono per **lotti**, ma gli **ordini clienti** vengono presi sulla combinazione agronomica (`Varietà + Clone + Portainnesto`) senza legame 1:1 a priori con un singolo lotto fisico.
3. L'app è usata da 3 categorie di utenti nominativi con esigenze opposte: **Amministrazione** (operatività completa), **Commerciali** (sola lettura disponibilità da smartphone) e **Soci Produttori** (sola lettura fabbisogni scoperti da smartphone).

## Decisione

1. **Catalogo vincolato in 3 tabelle**:
   - `varieta` (`id`, `nome` univoco, `attiva`)
   - `cloni` (`id`, `varieta_id` FK, `codice`, `attivo`, univoco per `(varieta_id, codice)`)
   - `portainnesti` (`id`, `codice` univoco, `descrizione`, `attivo`)
   - Sia l'API sia la UI verificano che il `clone_id` scelto appartenga alla `varieta_id` selezionata.
2. **Disaccoppiamento tra Conferimenti (per Socio/Lotto) e Ordini Clienti**:
   - `conferimenti_lotti` traccia `socio_id` e `codice_lotto` oltre alla tripla `(varieta_id, clone_id, portainnesto_id)`.
   - `righe_ordine` referenzia unicamente la tripla `(varieta_id, clone_id, portainnesto_id)`.
3. **Account nominativi con RBAC a 3 ruoli (`admin`, `commerciale`, `produttore`)**:
   - Il ruolo è salvato sull'utente (`users.role`) con possibilità opzionale di associare `socio_id` per i produttori.
   - Tutte le API di mutazione (`POST`, `PUT`, `PATCH`, `DELETE`) sono protette da middleware che richiede `role === 'admin'`.
   - I profili `commerciale` e `produttore` hanno interfacce mobile in sola lettura prive di qualsiasi pulsante di modifica.

## Conseguenze

- ✅ Zero errori di imputazione grazie ai selettori a cascata `Varietà → Clone + Portainnesto`.
- ✅ Massima flessibilità per l'amministrazione: un ordine cliente può essere coperto da più lotti di soci diversi senza burocrazia aggiuntiva nel software.
- ✅ Sicurezza operativa per commerciali e soci: nessun rischio di alterare dati consultando l'app dal telefono in vigna o dai clienti.

