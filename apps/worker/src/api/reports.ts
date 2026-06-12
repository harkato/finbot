import { cashflowQuerySchema, summaryQuerySchema } from "@finbot/shared";
import { Hono } from "hono";
import { currentMonth } from "../core/dates";
import { getCashflow, getSummary } from "../core/reports";
import { db } from "../db/client";
import type { AppEnv } from "../env";
import { internalAuth } from "../middleware/auth";

export const reportsRoutes = new Hono<AppEnv>();

// Auth por rota (não use("*")) para que /api/<desconhecida> caia no notFound (404),
// já que este router é montado no prefixo /api.
reportsRoutes.get("/summary", internalAuth, async (c) => {
  const parsed = summaryQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const month = parsed.data.month ?? currentMonth();
  return c.json(await getSummary(db(c.env.DB), c.get("userId"), month));
});

reportsRoutes.get("/cashflow", internalAuth, async (c) => {
  const parsed = cashflowQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const cashflow = await getCashflow(
    db(c.env.DB),
    c.get("userId"),
    parsed.data.months,
  );
  return c.json({ cashflow });
});
