import { verifyToken } from "@finbot/shared";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getUserById, getUserByTelegramId } from "../core/users";
import { db } from "../db/client";
import type { AppEnv } from "../env";

// Comparação de tempo ~constante para o bearer (evita timing oracle no token).
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length === bb.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

function bearerOf(c: Context<AppEnv>): string {
  const header = c.req.header("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

// Auth interno SEM resolução de usuário — bootstrap/admin (criar usuários, etc.).
export const bearerOnly = createMiddleware<AppEnv>(async (c, next) => {
  const token = bearerOf(c);
  if (!c.env.API_TOKEN || !safeEqual(token, c.env.API_TOKEN)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

// Auth das rotas de dados. Aceita dois modos (seção 7):
//  (a) interno — bearer == API_TOKEN + header X-Telegram-Id (bot/cron);
//  (b) sessão — token HMAC do magic link (cookie repassado pelo proxy do Nuxt) → userId.
// NUNCA confia em userId vindo de body/query.
export const internalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = bearerOf(c);
  if (!token) return c.json({ error: "unauthorized" }, 401);
  const database = db(c.env.DB);

  // modo (a)
  if (c.env.API_TOKEN && safeEqual(token, c.env.API_TOKEN)) {
    const raw = c.req.header("X-Telegram-Id");
    const telegramId = raw !== undefined ? Number(raw) : Number.NaN;
    if (!Number.isInteger(telegramId)) {
      return c.json({ error: "missing_telegram_id" }, 401);
    }
    const user = await getUserByTelegramId(database, telegramId);
    if (!user) return c.json({ error: "unknown_user" }, 401);
    c.set("user", user);
    c.set("userId", user.id);
    return next();
  }

  // modo (b)
  if (c.env.SESSION_SECRET) {
    const payload = await verifyToken(c.env.SESSION_SECRET, token, "session");
    if (payload) {
      const user = await getUserById(database, payload.uid);
      if (user) {
        c.set("user", user);
        c.set("userId", user.id);
        return next();
      }
    }
  }

  return c.json({ error: "unauthorized" }, 401);
});
