import { Hono } from "hono";
import type { AppEnv } from "../env";
import { internalAuth } from "../middleware/auth";

// GET /api/me — usuário autenticado (modo sessão ou interno).
export const meRoutes = new Hono<AppEnv>();
meRoutes.use("*", internalAuth);

meRoutes.get("/", (c) => {
  const u = c.get("user");
  return c.json({ user: { id: u.id, name: u.name, isAdmin: u.isAdmin } });
});
