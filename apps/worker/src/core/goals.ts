import type { CreateGoal, PatchGoal } from "@finbot/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { goals, type Goal } from "../db/schema";
import { HttpError } from "./errors";

export async function listGoals(database: Db, userId: number): Promise<Goal[]> {
  return database.query.goals.findMany({
    where: eq(goals.userId, userId),
    orderBy: goals.id,
  });
}

export async function getUserGoal(
  database: Db,
  userId: number,
  id: number,
): Promise<Goal | null> {
  const row = await database.query.goals.findFirst({
    where: and(eq(goals.userId, userId), eq(goals.id, id)),
  });
  return row ?? null;
}

export async function createGoal(
  database: Db,
  userId: number,
  input: CreateGoal,
): Promise<Goal> {
  const inserted = await database
    .insert(goals)
    .values({
      userId,
      name: input.name,
      targetCents: input.targetCents,
      savedCents: input.savedCents ?? 0,
      deadline: input.deadline ?? null,
    })
    .returning();
  const goal = inserted[0];
  if (!goal) throw new HttpError(500, "insert_failed", "falha ao criar meta");
  return goal;
}

export async function updateGoal(
  database: Db,
  userId: number,
  id: number,
  patch: PatchGoal,
): Promise<Goal | null> {
  const existing = await getUserGoal(database, userId, id);
  if (!existing) return null;
  const values: Partial<typeof goals.$inferInsert> = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.targetCents !== undefined) values.targetCents = patch.targetCents;
  if (patch.savedCents !== undefined) values.savedCents = patch.savedCents;
  if (patch.deadline !== undefined) values.deadline = patch.deadline;
  await database
    .update(goals)
    .set(values)
    .where(and(eq(goals.userId, userId), eq(goals.id, id)));
  return getUserGoal(database, userId, id);
}

export async function deleteGoal(
  database: Db,
  userId: number,
  id: number,
): Promise<boolean> {
  const deleted = await database
    .delete(goals)
    .where(and(eq(goals.userId, userId), eq(goals.id, id)))
    .returning({ id: goals.id });
  return deleted.length > 0;
}
