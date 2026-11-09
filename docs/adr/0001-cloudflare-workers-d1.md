# ADR-0001 — Cloudflare Workers + D1 al posto di un server tradizionale

- **Stato:** Accettato
- **Data:** 2026-10-28

## Contesto

Requisiti: costo zero, un solo utente, accessibile da internet anche da smartphone, nessuna macchina da gestire. Le alternative valutate (vedi `stack.md`) avevano limiti incompatibili: Vercel Hobby vieta l'uso commerciale, il Postgres gratuito di Render scade dopo 30 giorni, Supabase gratuito va in pausa dopo circa 7 giorni di inattività, server a casa o VM Oracle richiedono manutenzione, Java/Spring è troppo pesante senza un server proprio.

## Decisione

Un unico **Cloudflare Worker** serve i file statici dell'app Angular e l'API Hono sotto `/api`. I dati stanno in **Cloudflare D1** (SQLite), con schema e migration gestiti da **Drizzle ORM**.

## Conseguenze

- ✅ Costo zero, nessun server da mantenere, HTTPS e dominio inclusi, un solo deploy, niente CORS.
- ✅ SQLite è più che sufficiente per un utente e volumi piccoli.
- ⚠️ **Lock-in**: runtime (Workers) e database (D1) sono legati a Cloudflare. Per mitigare:
  - la logica di dominio resta in funzioni TypeScript senza dipendenze da Cloudflare, chiamate dalle route Hono;
  - l'accesso ai dati passa da Drizzle (portabile su SQLite/libSQL, adattabile a Postgres);
  - backup periodici in formato portabile (SQL/JSON).
- ⚠️ Vincoli del runtime: circa 10 ms di CPU per richiesta sul piano gratuito (impatta l'hash delle password), niente filesystem, API Node solo parziali (`nodejs_compat`).
- ⚠️ D1 non offre transazioni interattive: le scritture che devono essere atomiche (es. evasione con più movimenti) vanno fatte con `batch()`, che esegue più istruzioni in un'unica transazione.

