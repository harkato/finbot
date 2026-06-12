import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getUserByTelegramId } from "../core/users";
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

function checkBearer(c: Context<AppEnv>): boolean {
  const header = c.req.header("Authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const token = header.slice(prefix.length);
  const expected = c.env.API_TOKEN;
  if (!expected) return false;
  return safeEqual(token, expected);
}

// Auth interno SEM resolução de usuário — bootstrap/admin (criar usuários, etc.).
export const bearerOnly = createMiddleware<AppEnv>(async (c, next) => {
  if (!checkBearer(c)) return c.json({ error: "unauthorized" }, 401);
  await next();
});

// Auth interno (modo (a) da seção 7): bearer + X-Telegram-Id ⇒ resolve o usuário.
// NUNCA confia em userId vindo de body/query. Updates de telegramId sem usuário → 401.
export const internalAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!checkBearer(c)) return c.json({ error: "unauthorized" }, 401);

  const raw = c.req.header("X-Telegram-Id");
  const telegramId = raw !== undefined ? Number(raw) : Number.NaN;
  if (!Number.isInteger(telegramId)) {
    return c.json({ error: "missing_telegram_id" }, 401);
  }

  const user = await getUserByTelegramId(db(c.env.DB), telegramId);
  if (!user) return c.json({ error: "unknown_user" }, 401);

  c.set("user", user);
  c.set("userId", user.id);
  await next();
});
