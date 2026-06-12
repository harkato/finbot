import { Hono } from "hono";
import { listUserCategories } from "../core/categories";
import { db } from "../db/client";
import type { AppEnv } from "../env";
import { internalAuth } from "../middleware/auth";

// GET /api/categories — categorias do usuário (o editor de keywords/CRUD completo chega
// na Fase 6, dashboard).
export const categoriesRoutes = new Hono<AppEnv>();

categoriesRoutes.use("*", internalAuth);

categoriesRoutes.get("/", async (c) => {
  const categories = await listUserCategories(db(c.env.DB), c.get("userId"));
  return c.json({ categories });
});
