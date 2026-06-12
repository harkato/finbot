import { upsertBudgetSchema } from "@finbot/shared";
import { Hono } from "hono";
import {
  deleteBudget,
  listBudgetsWithStatus,
  upsertBudget,
} from "../core/budgets";
import { currentMonth } from "../core/dates";
import { db } from "../db/client";
import type { AppEnv } from "../env";
import { internalAuth } from "../middleware/auth";

export const budgetsRoutes = new Hono<AppEnv>();

budgetsRoutes.use("*", internalAuth);

// GET /api/budgets?month= — orçamentos com gasto/ratio do mês.
budgetsRoutes.get("/", async (c) => {
  const month = c.req.query("month") ?? currentMonth();
  const items = await listBudgetsWithStatus(db(c.env.DB), c.get("userId"), month);
  return c.json({ budgets: items });
});

// POST /api/budgets — cria/atualiza o teto da categoria (upsert por categoria).
budgetsRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = upsertBudgetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const budget = await upsertBudget(db(c.env.DB), c.get("userId"), parsed.data);
  return c.json({ budget }, 201);
});

budgetsRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);
  const ok = await deleteBudget(db(c.env.DB), c.get("userId"), id);
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ deleted: true });
});
