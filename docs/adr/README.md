# Architecture Decision Records

Decisioni architetturali e di dominio difficili da cambiare. Una decisione superata non si cancella: si crea un nuovo ADR che la sostituisce e si aggiorna lo stato di quello vecchio.

| ADR | Titolo | Stato |
|---|---|---|
| [0001](0001-cloudflare-workers-d1.md) | Cloudflare Workers + D1 al posto di un server tradizionale (e di Budibase/Supabase) | Accettato |
| [0002](0002-giacenza-calcolata-dai-movimenti.md) | Indicatori di disponibilità calcolati da conferimenti e ordini | Accettato |
| [0003](0003-giacenza-negativa-ammessa.md) | Disponibilità virtuale negativa ammessa (Fabbisogno Scoperto per i Soci) | Accettato |
| [0004](0004-evasione-parziale.md) | Spedizione parziale degli ordini clienti ("Ordinato" vs "Di cui Spedito") | Accettato |
| [0005](0005-annullamento-con-storno.md) | Annullamento di ordini clienti e ripristino immediato del Magazzino Virtuale | Accettato |
| [0006](0006-catalogo-vincolato-barbatelle-e-ruoli.md) | Catalogo vincolato (Varietà → Clone + Portainnesto), separazione Lotti/Ordini e 3 Ruoli utente | Accettato |

Formato: Contesto → Decisione → Conseguenze.
