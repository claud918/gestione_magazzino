import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { UtenteProfilo } from '@magazzino/shared';
import type { Env } from '../index';
import { sessioni, utenti } from '../db/schema';

export const SESSION_COOKIE_NAME = 'magazzino_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 giorni

export type AppVariables = {
  utente: UtenteProfilo;
};

export const requireAuth = createMiddleware<{ Bindings: Env; Variables: AppVariables }>(
  async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    if (!token) {
      return c.json({ error: 'Autenticazione richiesta' }, 401);
    }

    const db = drizzle(c.env.DB);
    const now = Date.now();

    const rows = await db
      .select({
        sessionId: sessioni.id,
        expiresAt: sessioni.expiresAt,
        id: utenti.id,
        email: utenti.email,
        nome: utenti.nome,
        ruolo: utenti.ruolo,
        attivo: utenti.attivo,
      })
      .from(sessioni)
      .innerJoin(utenti, eq(sessioni.utenteId, utenti.id))
      .where(eq(sessioni.id, token))
      .limit(1);

    const row = rows[0];
    if (!row || !row.attivo || row.expiresAt <= now) {
      if (row && row.expiresAt <= now) {
        await db.delete(sessioni).where(eq(sessioni.id, token));
      }
      return c.json({ error: 'Sessione scaduta o non valida' }, 401);
    }

    let nomeNormalizzato = row.nome;
    if (nomeNormalizzato === 'Elena (Amministrazione)') {
      nomeNormalizzato = 'Federico Mori (Amministrazione)';
      await db
        .update(utenti)
        .set({ nome: nomeNormalizzato })
        .where(eq(utenti.id, row.id));
    }

    c.set('utente', {
      id: row.id,
      email: row.email,
      nome: nomeNormalizzato,
      ruolo: row.ruolo,
      attivo: row.attivo,
    });

    await next();
  },
);

export const requireAdmin = createMiddleware<{ Bindings: Env; Variables: AppVariables }>(
  async (c, next) => {
    const utente = c.get('utente');
    if (!utente || utente.ruolo !== 'admin') {
      return c.json({ error: 'Permesso negato: richiesto ruolo Amministrazione' }, 403);
    }
    await next();
  },
);

