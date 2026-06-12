import { Hono } from "hono";
import { health } from "./api/health";
import { internalRoutes } from "./api/internal";
import { reportsRoutes } from "./api/reports";
import { transactionsRoutes } from "./api/transactions";
import { HttpError } from "./core/errors";
import type { AppEnv } from "./env";

// App Hono do Worker. Rotas REST sob /api; o webhook do Telegram (Fase 2) será montado
// fora do middleware de bearer.
export const app = new Hono<AppEnv>();

app.route("/api", health);
app.route("/api/internal", internalRoutes);
app.route("/api/transactions", transactionsRoutes);
app.route("/api", reportsRoutes);

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.code, message: err.message }, err.status);
  }
  console.error("unhandled error", err);
  return c.json({ error: "internal_error" }, 500);
});
