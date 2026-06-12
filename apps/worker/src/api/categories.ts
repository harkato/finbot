import { createCategorySchema, patchCategorySchema } from "@finbot/shared";
import { Hono } from "hono";
import {
  createCategory,
  deleteCategory,
  listUserCategories,
  updateCategory,
} from "../core/categories";
import { db } from "../db/client";
import type { AppEnv } from "../env";
import { internalAuth } from "../middleware/auth";

export const categoriesRoutes = new Hono<AppEnv>();
categoriesRoutes.use("*", internalAuth);

categoriesRoutes.get("/", async (c) =>
  c.json({ categories: await listUserCategories(db(c.env.DB), c.get("userId")) }),
);

categoriesRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createCategorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const category = await createCategory(db(c.env.DB), c.get("userId"), parsed.data);
  return c.json({ category }, 201);
});

categoriesRoutes.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);
  const body = await c.req.json().catch(() => null);
  const parsed = patchCategorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const category = await updateCategory(db(c.env.DB), c.get("userId"), id, parsed.data);
  if (!category) return c.json({ error: "not_found" }, 404);
  return c.json({ category });
});

categoriesRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);
  const ok = await deleteCategory(db(c.env.DB), c.get("userId"), id);
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ deleted: true });
});
