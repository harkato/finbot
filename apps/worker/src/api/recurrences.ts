import { createRecurrenceSchema, patchRecurrenceSchema } from "@finbot/shared";
import { Hono } from "hono";
import {
  createRecurrence,
  deleteRecurrence,
  listRecurrences,
  updateRecurrence,
} from "../core/recurrences";
import { db } from "../db/client";
import type { AppEnv } from "../env";
import { internalAuth } from "../middleware/auth";

export const recurrencesRoutes = new Hono<AppEnv>();
recurrencesRoutes.use("*", internalAuth);

recurrencesRoutes.get("/", async (c) =>
  c.json({ recurrences: await listRecurrences(db(c.env.DB), c.get("userId")) }),
);

recurrencesRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createRecurrenceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const recurrence = await createRecurrence(db(c.env.DB), c.get("userId"), parsed.data);
  return c.json({ recurrence }, 201);
});

recurrencesRoutes.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);
  const body = await c.req.json().catch(() => null);
  const parsed = patchRecurrenceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 422);
  }
  const recurrence = await updateRecurrence(db(c.env.DB), c.get("userId"), id, parsed.data);
  if (!recurrence) return c.json({ error: "not_found" }, 404);
  return c.json({ recurrence });
});

recurrencesRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);
  const ok = await deleteRecurrence(db(c.env.DB), c.get("userId"), id);
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ deleted: true });
});
