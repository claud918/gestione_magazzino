# Gestionale Mori — Gestione Magazzino Conferimenti e Ordini

Applicazione web mobile-first (**Angular 22 PWA + Hono + Cloudflare Workers & D1 + Drizzle ORM + Zod**) per la gestione dei conferimenti dei soci, della disponibilità commerciale (*Magazzino Virtuale*) e degli ordini clienti di una cooperativa di produttori di barbatelle.

## Documentazione di riferimento
- [`REQUISITI.md`](./REQUISITI.md) — Analisi funzionale, 3 ruoli nominativi, formule dei 7 indicatori e descrizione delle 5 viste.
- [`GLOSSARY.md`](./GLOSSARY.md) — Glossario del dominio e macchina a stati degli ordini.
- [`stack.md`](./stack.md) — Scelte tecnologiche a costo zero.
- [`docs/adr/README.md`](./docs/adr/README.md) — Architecture Decision Records (`ADR-0001` – `ADR-0006`).

---

## Avvio rapido in locale

### 1. Compilazione e preparazione database locale
```powershell
# Applica le migration D1 in locale
npm run db:migrate:local

# Carica il catalogo iniziale, i conferimenti/ordini di esempio e i 3 profili di test
npm run db:seed:local

# Compila shared + frontend Angular
npm run build
```

### 2. Avvio del server unico (Frontend + API + D1 locale)
```powershell
npm run dev:api
```
Apri **http://127.0.0.1:8787** (su smartphone o desktop).

### Credenziali di Accesso (Uso interno)
| Ruolo | Email | Password | Accesso |
|---|---|---|---|
| **Amministrazione** (`admin`) | `fedemori.fm@gmail.com` | `magazzino` | Accesso completo a tutte le sezioni, report e tabelle (lettura e scrittura) |

---

## Creazione o Reset Password Utenti da Terminale

Puoi creare un nuovo account o reimpostare la password in qualsiasi momento (sia in locale sia su Cloudflare remoto aggiungendo `--remote`):

```powershell
# Locale
npm run user:manage -- admin@cooperativa.it "NuovaPasswordSicura2026!" "Amministratore"

# Remoto (Cloudflare D1 in produzione)
npm run user:manage -- admin@cooperativa.it "PasswordProduzione2026!" "Amministratore" --remote
```

---

## Messa in produzione su Cloudflare (Costo 0 €)

1. **Login su Cloudflare**:
   ```powershell
   npx wrangler login
   ```
2. **Creazione del database D1 remoto**:
   ```powershell
   npx wrangler d1 create magazzino
   ```
   Copia il `database_id` restituito dentro [`apps/api/wrangler.jsonc`](./apps/api/wrangler.jsonc).
3. *(Opzionale)* **Creazione del bucket R2 per i backup notturni automatici**:
   ```powershell
   npx wrangler r2 bucket create magazzino-backups
   ```
   Aggiungi in `apps/api/wrangler.jsonc`:
   ```jsonc
   "r2_buckets": [
     { "binding": "BACKUP_BUCKET", "bucket_name": "magazzino-backups" }
   ]
   ```
4. **Applicazione migration e creazione primo utente Admin in produzione**:
   ```powershell
   npm run db:migrate:remote
   npm run user:manage -- admin@cooperativa.it "LaTuaPasswordLungaESicura!" admin "Amministrazione" --remote
   ```
5. **Pubblicazione (Build + Deploy unico)**:
   ```powershell
   npm run deploy
   ```

