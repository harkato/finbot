import {
  createCardSchema,
  invoiceQuerySchema,
  patchCardSchema,
  payInvoiceSchema,
} from "@finbot/shared";
import { Hono } from "hono";
import {
  computeInvoiceMonth,
  createCard,
  getInvoice,
  getUserCard,
  listUserCards,
  payInvoice,
  updateCard,
} from "../core/cards";
import { todaySaoPaulo } from "../core/dates";
import { db } from "../db/client";
import type { AppEnv } from "../env";
import { internalAuth } from "../middleware/auth";

export const cardsRoutes = new Hono<AppEnv>();

cardsRoutes.use("*", internalAuth);

cardsRoutes.get("/", async (c) => {
  const includeArchived = c.req.query("archived") === "true";
  const cards = await listUserCards(db(c.env.DB), c.get("userId"), { includeArchived });
  return c.json({ cards });
});

cardsRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createCardSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const card = await createCard(db(c.env.DB), c.get("userId"), parsed.data);
  return c.json({ card }, 201);
});

cardsRoutes.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);
  const body = await c.req.json().catch(() => null);
  const parsed = patchCardSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const card = await updateCard(db(c.env.DB), c.get("userId"), id, parsed.data);
  if (!card) return c.json({ error: "not_found" }, 404);
  return c.json({ card });
});

cardsRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);
  const card = await updateCard(db(c.env.DB), c.get("userId"), id, { archived: true });
  if (!card) return c.json({ error: "not_found" }, 404);
  return c.json({ card });
});

// GET /api/cards/:id/invoice?month= — itens + total da fatura. month default = fatura
// corrente (calculada de hoje + closingDay).
cardsRoutes.get("/:id/invoice", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);
  const parsed = invoiceQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const database = db(c.env.DB);
  const card = await getUserCard(database, c.get("userId"), id);
  if (!card) return c.json({ error: "not_found" }, 404);
  const month = parsed.data.month ?? computeInvoiceMonth(todaySaoPaulo(), card.closingDay);
  const invoice = await getInvoice(database, c.get("userId"), id, month);
  return c.json({ invoice });
});

// POST /api/cards/:id/pay-invoice { month } — debita a conta pagadora e quita os itens.
cardsRoutes.post("/:id/pay-invoice", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);
  const body = await c.req.json().catch(() => null);
  const parsed = payInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const result = await payInvoice(db(c.env.DB), c.get("userId"), id, parsed.data.month);
  if (!result.ok) return c.json({ error: result.reason }, 409);
  return c.json({
    payment: result.payment,
    totalCents: result.totalCents,
    count: result.count,
  });
});
