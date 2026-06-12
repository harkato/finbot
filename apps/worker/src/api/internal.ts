import { Hono } from "hono";
import { z } from "zod";
import { createUserWithSeed, listUsers } from "../core/users";
import { db } from "../db/client";
import type { AppEnv } from "../env";
import { bearerOnly } from "../middleware/auth";

// Rotas internas (bearer-only, sem resolução de usuário) — bootstrap/admin.
// O fluxo real de cadastro é por convite no bot (Fase 2); estas rotas servem o admin
// e os testes ponta-a-ponta da API.
export const internalRoutes = new Hono<AppEnv>();

internalRoutes.use("*", bearerOnly);

const createUserSchema = z.object({
  telegramId: z.number().int(),
  name: z.string().trim().min(1),
  isAdmin: z.boolean().optional(),
});

internalRoutes.post("/users", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const user = await createUserWithSeed(db(c.env.DB), parsed.data);
  return c.json({ user }, 201);
});

internalRoutes.get("/users", async (c) => {
  return c.json({ users: await listUsers(db(c.env.DB)) });
});
