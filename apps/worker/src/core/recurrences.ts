import type { CreateRecurrence, PatchRecurrence } from "@finbot/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { recurrences, type Recurrence, type Transaction } from "../db/schema";
import { monthOf } from "./dates";
import { HttpError } from "./errors";
import { createTransaction } from "./transactions";

export async function listRecurrences(
  database: Db,
  userId: number,
): Promise<Recurrence[]> {
  return database.query.recurrences.findMany({
    where: eq(recurrences.userId, userId),
    orderBy: recurrences.id,
  });
}

export async function getUserRecurrence(
  database: Db,
  userId: number,
  id: number,
): Promise<Recurrence | null> {
  const row = await database.query.recurrences.findFirst({
    where: and(eq(recurrences.userId, userId), eq(recurrences.id, id)),
  });
  return row ?? null;
}

export async function createRecurrence(
  database: Db,
  userId: number,
  input: CreateRecurrence,
): Promise<Recurrence> {
  const inserted = await database
    .insert(recurrences)
    .values({
      userId,
      description: input.description,
      type: input.type,
      amountCents: input.amountCents,
      categoryId: input.categoryId ?? null,
      accountId: input.accountId ?? null,
      cardId: input.cardId ?? null,
      dayOfMonth: input.dayOfMonth,
    })
    .returning();
  const rec = inserted[0];
  if (!rec) throw new HttpError(500, "insert_failed", "falha ao criar recorrência");
  return rec;
}

export async function updateRecurrence(
  database: Db,
  userId: number,
  id: number,
  patch: PatchRecurrence,
): Promise<Recurrence | null> {
  const existing = await getUserRecurrence(database, userId, id);
  if (!existing) return null;
  const values: Partial<typeof recurrences.$inferInsert> = {};
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.type !== undefined) values.type = patch.type;
  if (patch.amountCents !== undefined) values.amountCents = patch.amountCents;
  if (patch.categoryId !== undefined) values.categoryId = patch.categoryId;
  if (patch.accountId !== undefined) values.accountId = patch.accountId;
  if (patch.cardId !== undefined) values.cardId = patch.cardId;
  if (patch.dayOfMonth !== undefined) values.dayOfMonth = patch.dayOfMonth;
  if (patch.active !== undefined) values.active = patch.active;
  await database
    .update(recurrences)
    .set(values)
    .where(and(eq(recurrences.userId, userId), eq(recurrences.id, id)));
  return getUserRecurrence(database, userId, id);
}

export async function deleteRecurrence(
  database: Db,
  userId: number,
  id: number,
): Promise<boolean> {
  const deleted = await database
    .delete(recurrences)
    .where(and(eq(recurrences.userId, userId), eq(recurrences.id, id)))
    .returning({ id: recurrences.id });
  return deleted.length > 0;
}

// Materializa as recorrências vencidas do usuário (cron). Cria a transação no dia
// `dayOfMonth` e marca `lastRunMonth` para não duplicar no mesmo mês.
export async function runDueRecurrences(
  database: Db,
  userId: number,
  today: string,
): Promise<Transaction[]> {
  const month = monthOf(today);
  const day = Number(today.slice(8, 10));
  const due = await database.query.recurrences.findMany({
    where: and(eq(recurrences.userId, userId), eq(recurrences.active, true)),
  });

  const created: Transaction[] = [];
  for (const rec of due) {
    if (rec.dayOfMonth !== day) continue;
    if (rec.lastRunMonth === month) continue; // já rodou este mês

    const tx = await createTransaction(database, userId, {
      type: rec.type,
      amountCents: rec.amountCents,
      description: rec.description,
      categoryId: rec.categoryId ?? undefined,
      accountId: rec.accountId ?? undefined,
      cardId: rec.cardId ?? undefined,
      date: today,
      source: "web",
    });
    await database
      .update(recurrences)
      .set({ lastRunMonth: month })
      .where(eq(recurrences.id, rec.id));
    created.push(tx);
  }
  return created;
}
