# Gestione magazzino conferimenti e ordini (Cooperativa Barbatelle) — Stack tecnologico

Decisioni concordate e aggiornate il 2026-10-28 (vedi anche [`REQUISITI.md`](./REQUISITI.md)).

## Requisiti di partenza

- **Costo zero**: nessuna licenza, hosting o database a pagamento; solo componenti open source e piani gratuiti che non vanno in pausa (a differenza di Supabase gratuito).
- **Cooperativa di produttori di barbatelle** con **account nominativi** divisi in **3 ruoli**:
  - `admin` (**Amministrazione**): gestione conferimenti dei soci, ordini clienti, spedizioni e catalogo anagrafiche;
  - `commerciale` (**Commerciali**): consultazione in sola lettura della disponibilità (*Magazzino Virtuale*) da smartphone;
  - `produttore` (**Soci Produttori**): consultazione in sola lettura del fabbisogno scoperto (*Ordinato > Conferito*) da smartphone.
- **Anagrafica vincolata a prova di errore**: ogni barbatella è identificata dalla tripla **Varietà + Clone + Portainnesto** scelta da menu a tendina a cascata (`Varietà → Clone` + `Portainnesto`).
- **Conferimenti dei soci** (entrate per lotto/socio) e **Ordini cliente** (uscite sulla combinazione aggregata `Varietà + Clone + Portainnesto`, con gestione di *ordinato* e *di cui spedito*).
- **Accessibile da internet**, usabile comodamente da smartphone (Android/iOS) come app installabile (PWA).
- **Solo online**: nessun uso offline con sincronizzazione.
- **Nessun documento fiscale** (DDT, fatture, SdI): fuori perimetro.

## Stack

| Strato | Scelta |
|---|---|
| Repository | Monorepo **npm workspaces**: `apps/web` (frontend), `apps/api` (backend), `packages/shared` (schemi e tipi condivisi) |
| Frontend | **Angular 22** come **PWA** (installabile sulla schermata Home del telefono) |
| API | **Hono** |
| Pubblicazione | **Un unico Cloudflare Worker** che serve sia i file statici di Angular sia l'API sotto `/api`: un solo deploy, stesso dominio, niente CORS |
| Database | **Cloudflare D1** (SQLite) + **Drizzle ORM** per schema tipizzato e migration |
| Validazione input | **Zod**, schemi condivisi tra frontend e API in `packages/shared` |
| Login e Ruoli | **Better Auth** (o sessioni su D1 con PBKDF2 WebCrypto) con controllo del ruolo (`admin`, `commerciale`, `produttore`) |
| Backup | Cron Trigger notturno che esporta il database su **Cloudflare R2**, più un pulsante di download manuale nella app |
| Costo | **0 €**; facoltativo solo un dominio personalizzato (~10 €/anno), altrimenti sottodominio Cloudflare gratuito |

## Autenticazione e Autorizzazione

- Email e password con sessione via cookie salvata su D1.
- **Account nominativi** con ruolo (`admin`, `commerciale`, `produttore`) ed eventuale legame opzionale con il `socio_id` per i produttori.
- **Nessuna registrazione pubblica**: gli account sono creati dall'amministratore (da script CLI o dal pannello Admin).
- **Cambio password** dall'interno della app.
- **Limite ai tentativi** per IP (`cf-connecting-ip`) salvato su D1; **nessun blocco permanente dell'account**.
- Hash delle password con **PBKDF2 di WebCrypto** per rimanere ampiamente entro il limite di CPU (10 ms) del piano gratuito dei Cloudflare Workers.

## Alternative scartate

- **Budibase + Supabase gratuito**: Supabase gratuito va in pausa dopo ~7 giorni di inattività e Budibase risulta scomodo da usare su smartphone per i commerciali e i soci.
- **Vercel Hobby**: il piano gratuito vieta l'uso non strettamente personale.
- **Render gratuito**: il database Postgres viene cancellato dopo 30 giorni.
- **Server a casa + Cloudflare Tunnel** e **VM Oracle Always Free**: richiedono di gestire e mantenere una macchina.
