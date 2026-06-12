import { createGoalSchema, patchGoalSchema } from "@finbot/shared";
import { Hono } from "hono";
import { createGoal, deleteGoal, listGoals, updateGoal } from "../core/goals";
import { db } from "../db/client";
import type { AppEnv } from "../env";
import { internalAuth } from "../middleware/auth";

export const goalsRoutes = new Hono<AppEnv>();
goalsRoutes.use("*", internalAuth);

goalsRoutes.get("/", async (c) =>
  c.json({ goals: await listGoals(db(c.env.DB), c.get("userId")) }),
);

goalsRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createGoalSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const goal = await createGoal(db(c.env.DB), c.get("userId"), parsed.data);
  return c.json({ goal }, 201);
});

goalsRoutes.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);
  const body = await c.req.json().catch(() => null);
  const parsed = patchGoalSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const goal = await updateGoal(db(c.env.DB), c.get("userId"), id, parsed.data);
  if (!goal) return c.json({ error: "not_found" }, 404);
  return c.json({ goal });
});

goalsRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);
  const ok = await deleteGoal(db(c.env.DB), c.get("userId"), id);
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ deleted: true });
});
