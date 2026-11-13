# Regole del Progetto (`gestione_magazzino`)

## Divieto assoluto di dati mockati sul Database
- **NON aggiungere MAI dati mockati, di test, di esempio o fittizi nel database.**
- Il database (Cloudflare D1 remoto e flussi collegati) è utilizzato realmente in produzione con dati aziendali reali.
- È severamente vietato:
  - Inserire `INSERT` di record di prova o fittizi all'interno di migrazioni SQL o codice applicativo.
  - Eseguire script di seed (`db:seed`, `seed-and-users.mjs`, ecc.) o comandi di pulizia/sovrascrittura (`db:clean:remote`, ecc.) verso il database reale o remoto.
  - Creare, modificare o eliminare record di produzione per eseguire test manuali, salvo esplicita richiesta dell'utente.
