import {
  createTransactionSchema,
  patchTransactionSchema,
  transactionQuerySchema,
} from "@finbot/shared";
import { Hono } from "hono";
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from "../core/transactions";
import { db } from "../db/client";
import type { AppEnv } from "../env";
import { internalAuth } from "../middleware/auth";

export const transactionsRoutes = new Hono<AppEnv>();

// Fase 1: só auth interno (bot/cron). A sessão do dashboard chega na Fase 6.
transactionsRoutes.use("*", internalAuth);

transactionsRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const transaction = await createTransaction(
    db(c.env.DB),
    c.get("userId"),
    parsed.data,
  );
  // budget: status do orçamento da categoria — implementado na Fase 5 (null por ora).
  return c.json({ transaction, budget: null }, 201);
});

transactionsRoutes.get("/", async (c) => {
  const parsed = transactionQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const items = await listTransactions(db(c.env.DB), c.get("userId"), parsed.data);
  return c.json({ transactions: items });
});

transactionsRoutes.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);

  const body = await c.req.json().catch(() => null);
  const parsed = patchTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const updated = await updateTransaction(
    db(c.env.DB),
    c.get("userId"),
    id,
    parsed.data,
  );
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ transaction: updated });
});

transactionsRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);

  const ok = await deleteTransaction(db(c.env.DB), c.get("userId"), id);
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ deleted: true });
});
