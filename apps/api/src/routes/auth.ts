import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import {
  CambioPasswordInput,
  CreaUtenteInput,
  LoginInput,
  type UtenteProfilo,
} from '@magazzino/shared';
import type { Env } from '../index';
import { loginTentativi, sessioni, utenti } from '../db/schema';
import { generateSessionId, hashPassword, verifyPassword } from '../auth/crypto';
import {
  type AppVariables,
  requireAdmin,
  requireAuth,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from '../auth/middleware';

const MAX_ATTEMPTS_PER_MINUTE = 5;
const WINDOW_MS = 60_000;

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'local';
}

authRoutes.post('/login', async (c) => {
  const parsed = LoginInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Dati di login non validi', details: parsed.error.flatten() }, 400);
  }

  const db = drizzle(c.env.DB);
  const ip = getClientIp(c);
  const now = Date.now();

  // Verifica rate limit per IP (nessun blocco permanente dell'account)
  const rateRow = await db
    .select()
    .from(loginTentativi)
    .where(eq(loginTentativi.ip, ip))
    .get();

  if (rateRow && now - rateRow.finestraStart < WINDOW_MS && rateRow.tentativi >= MAX_ATTEMPTS_PER_MINUTE) {
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - rateRow.finestraStart)) / 1000);
    return c.json(
      { error: `Troppi tentativi. Riprova tra ${retryAfterSec} secondi.` },
      429,
    );
  }

  const user = await db
    .select()
    .from(utenti)
    .where(eq(utenti.email, parsed.data.email))
    .get();

  const passwordOk = user && user.attivo
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : false;

  if (!user || !user.attivo || !passwordOk) {
    const newCount =
      rateRow && now - rateRow.finestraStart < WINDOW_MS ? rateRow.tentativi + 1 : 1;
    const windowStart =
      rateRow && now - rateRow.finestraStart < WINDOW_MS ? rateRow.finestraStart : now;

    await db
      .insert(loginTentativi)
      .values({ ip, tentativi: newCount, finestraStart: windowStart })
      .onConflictDoUpdate({
        target: loginTentativi.ip,
        set: { tentativi: newCount, finestraStart: windowStart },
      });

    return c.json({ error: 'Email o password non corretti' }, 401);
  }

  // Azzera contatore tentativi per questo IP
  if (rateRow) {
    await db.delete(loginTentativi).where(eq(loginTentativi.ip, ip));
  }

  const sessionId = generateSessionId();
  const expiresAt = now + SESSION_TTL_MS;

  await db.insert(sessioni).values({
    id: sessionId,
    utenteId: user.id,
    expiresAt,
  });

  const isSecure = new URL(c.req.url).protocol === 'https:';
  setCookie(c, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecure,
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  let nomeNormalizzato = user.nome;
  if (nomeNormalizzato === 'Elena (Amministrazione)') {
    nomeNormalizzato = 'Federico Mori (Amministrazione)';
    await db
      .update(utenti)
      .set({ nome: nomeNormalizzato })
      .where(eq(utenti.id, user.id));
  }

  const profilo: UtenteProfilo = {
    id: user.id,
    email: user.email,
    nome: nomeNormalizzato,
    ruolo: user.ruolo,
    attivo: user.attivo,
  };

  return c.json({ utente: profilo });
});

authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (token) {
    const db = drizzle(c.env.DB);
    await db.delete(sessioni).where(eq(sessioni.id, token));
  }
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
  return c.json({ ok: true });
});

authRoutes.get('/me', requireAuth, async (c) => {
  return c.json({ utente: c.get('utente') });
});

authRoutes.post('/change-password', requireAuth, async (c) => {
  const parsed = CambioPasswordInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Dati non validi', details: parsed.error.flatten() }, 400);
  }

  const currentUser = c.get('utente');
  const db = drizzle(c.env.DB);
  const row = await db.select().from(utenti).where(eq(utenti.id, currentUser.id)).get();
  if (!row) {
    return c.json({ error: 'Utente non trovato' }, 404);
  }

  const ok = await verifyPassword(parsed.data.passwordAttuale, row.passwordHash);
  if (!ok) {
    return c.json({ error: 'La password attuale non è corretta' }, 400);
  }

  const newHash = await hashPassword(parsed.data.nuovaPassword);
  await db.update(utenti).set({ passwordHash: newHash }).where(eq(utenti.id, currentUser.id));

  return c.json({ ok: true });
});

// Gestione account nominativi da parte dell'Amministrazione
authRoutes.get('/utenti', requireAuth, requireAdmin, async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({
      id: utenti.id,
      email: utenti.email,
      nome: utenti.nome,
      ruolo: utenti.ruolo,
      attivo: utenti.attivo,
    })
    .from(utenti)
    .orderBy(utenti.nome);

  return c.json({
    utenti: rows.map((r) => ({
      ...r,
      nome: r.nome === 'Elena (Amministrazione)' ? 'Federico Mori (Amministrazione)' : r.nome,
    })),
  });
});

authRoutes.post('/utenti', requireAuth, requireAdmin, async (c) => {
  const parsed = CreaUtenteInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Dati utente non validi', details: parsed.error.flatten() }, 400);
  }

  const db = drizzle(c.env.DB);
  const existing = await db
    .select({ id: utenti.id })
    .from(utenti)
    .where(eq(utenti.email, parsed.data.email))
    .get();

  if (existing) {
    return c.json({ error: 'Esiste già un utente con questa email' }, 409);
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const inserted = await db
    .insert(utenti)
    .values({
      email: parsed.data.email,
      nome: parsed.data.nome,
      passwordHash,
      ruolo: parsed.data.ruolo,
      attivo: true,
    })
    .returning({
      id: utenti.id,
      email: utenti.email,
      nome: utenti.nome,
      ruolo: utenti.ruolo,
      attivo: utenti.attivo,
    })
    .get();

  return c.json({ utente: inserted }, 201);
});

