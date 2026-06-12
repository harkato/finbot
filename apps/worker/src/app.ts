import { Hono } from "hono";
import type { AppBindings } from "./env";
import { health } from "./api/health";

// App Hono do Worker. Rotas REST sob /api; o webhook do Telegram (Fase 2) será montado
// fora do middleware de bearer.
export const app = new Hono<AppBindings>();

app.route("/api", health);

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  console.error("unhandled error", err);
  return c.json({ error: "internal_error" }, 500);
});
