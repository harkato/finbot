import { Hono } from "hono";
import { accountsRoutes } from "./api/accounts";
import { alertsRoutes } from "./api/alerts";
import { budgetsRoutes } from "./api/budgets";
import { cardsRoutes } from "./api/cards";
import { categoriesRoutes } from "./api/categories";
import { goalsRoutes } from "./api/goals";
import { meRoutes } from "./api/me";
import { recurrencesRoutes } from "./api/recurrences";
import { health } from "./api/health";
import { internalRoutes } from "./api/internal";
import { reportsRoutes } from "./api/reports";
import { transactionsRoutes } from "./api/transactions";
import { handleTelegramWebhook } from "./bot/bot";
import { HttpError } from "./core/errors";
import type { AppEnv } from "./env";

// App Hono do Worker. Rotas REST sob /api; o webhook do Telegram fica fora do bearer.
export const app = new Hono<AppEnv>();

// Webhook do Telegram — FORA do middleware de bearer (valida o secret token interno).
app.post("/webhook/telegram", (c) => handleTelegramWebhook(c));

app.route("/api", health);
app.route("/api/internal", internalRoutes);
app.route("/api/me", meRoutes);
app.route("/api/transactions", transactionsRoutes);
app.route("/api/accounts", accountsRoutes);
app.route("/api/cards", cardsRoutes);
app.route("/api/categories", categoriesRoutes);
app.route("/api/budgets", budgetsRoutes);
app.route("/api/goals", goalsRoutes);
app.route("/api/recurrences", recurrencesRoutes);
app.route("/api/alerts", alertsRoutes);
app.route("/api", reportsRoutes);

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.code, message: err.message }, err.status);
  }
  console.error("unhandled error", err);
  return c.json({ error: "internal_error" }, 500);
});
