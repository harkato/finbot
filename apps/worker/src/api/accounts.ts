import { createAccountSchema, patchAccountSchema } from "@finbot/shared";
import { Hono } from "hono";
import {
  createAccount,
  listUserAccounts,
  updateAccount,
} from "../core/accounts";
import { db } from "../db/client";
import type { AppEnv } from "../env";
import { internalAuth } from "../middleware/auth";

export const accountsRoutes = new Hono<AppEnv>();

accountsRoutes.use("*", internalAuth);

// GET /api/accounts — inclui balanceCents derivado.
accountsRoutes.get("/", async (c) => {
  const includeArchived = c.req.query("archived") === "true";
  const items = await listUserAccounts(db(c.env.DB), c.get("userId"), {
    includeArchived,
  });
  return c.json({ accounts: items });
});

accountsRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createAccountSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const account = await createAccount(db(c.env.DB), c.get("userId"), parsed.data);
  return c.json({ account }, 201);
});

accountsRoutes.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);

  const body = await c.req.json().catch(() => null);
  const parsed = patchAccountSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const account = await updateAccount(db(c.env.DB), c.get("userId"), id, parsed.data);
  if (!account) return c.json({ error: "not_found" }, 404);
  return c.json({ account });
});

// DELETE = arquivar (saldo histórico é preservado; nunca apaga transações).
accountsRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);

  const account = await updateAccount(db(c.env.DB), c.get("userId"), id, {
    archived: true,
  });
  if (!account) return c.json({ error: "not_found" }, 404);
  return c.json({ account });
});
