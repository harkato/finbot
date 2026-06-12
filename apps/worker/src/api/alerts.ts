import { Hono } from "hono";
import { buildAlertsForUser } from "../core/alerts";
import { todaySaoPaulo } from "../core/dates";
import { db } from "../db/client";
import type { AppEnv } from "../env";
import { internalAuth } from "../middleware/auth";

export const alertsRoutes = new Hono<AppEnv>();

alertsRoutes.use("*", internalAuth);

// GET /api/alerts/preview — o que o cron enviaria agora para o usuário autenticado (debug).
alertsRoutes.get("/preview", async (c) => {
  const alerts = await buildAlertsForUser(
    db(c.env.DB),
    c.get("user"),
    todaySaoPaulo(),
  );
  return c.json({ alerts });
});
