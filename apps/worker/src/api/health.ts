import { Hono } from "hono";
import type { AppBindings } from "../env";

// GET /api/health — liveness check. Não toca no banco (Fase 0).
export const health = new Hono<AppBindings>();

health.get("/health", (c) =>
  c.json({ status: "ok", service: "finbot-worker", phase: 0 }),
);
