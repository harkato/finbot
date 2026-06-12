import type { BudgetStatus } from "@finbot/shared";
import { and, eq, like, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  budgets,
  categories,
  transactions,
  type Budget,
  type Transaction,
} from "../db/schema";
import { getUserCategory } from "./categories";
import { monthOf } from "./dates";
import { HttpError } from "./errors";

// Soma das SAÍDAS de uma categoria no mês (opcionalmente só antes de uma data).
async function spentInCategory(
  database: Db,
  userId: number,
  categoryId: number,
  month: string,
  beforeDate?: string,
): Promise<number> {
  const conds = [
    eq(transactions.userId, userId),
    eq(transactions.categoryId, categoryId),
    eq(transactions.type, "saida"),
    like(transactions.date, `${month}-%`),
  ];
  if (beforeDate) conds.push(lt(transactions.date, beforeDate));

  const rows = await database
    .select({ total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)` })
    .from(transactions)
    .where(and(...conds));
  return Number(rows[0]?.total ?? 0);
}

// Status do orçamento de uma categoria num mês: { spentCents, limitCents, ratio } ou null
// se não houver orçamento (seção 6.3).
export async function getBudgetStatus(
  database: Db,
  userId: number,
  categoryId: number,
  month: string,
): Promise<BudgetStatus> {
  const budget = await database.query.budgets.findFirst({
    where: and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId)),
  });
  if (!budget) return null;

  const spentCents = await spentInCategory(database, userId, categoryId, month);
  const limitCents = budget.monthlyLimitCents;
  const ratio = limitCents > 0 ? spentCents / limitCents : 0;
  return { spentCents, limitCents, ratio };
}

// Status do orçamento associado a uma transação (só para saídas; usa o mês da data).
export async function budgetStatusForTransaction(
  database: Db,
  tx: Transaction,
): Promise<BudgetStatus> {
  if (tx.type !== "saida") return null;
  return getBudgetStatus(database, tx.userId, tx.categoryId, monthOf(tx.date));
}

export type BudgetWithStatus = Budget & {
  categoryName: string;
  spentCents: number;
  ratio: number;
};

export async function listBudgetsWithStatus(
  database: Db,
  userId: number,
  month: string,
): Promise<BudgetWithStatus[]> {
  const rows = await database
    .select({
      id: budgets.id,
      userId: budgets.userId,
      categoryId: budgets.categoryId,
      monthlyLimitCents: budgets.monthlyLimitCents,
      categoryName: categories.name,
    })
    .from(budgets)
    .innerJoin(categories, eq(categories.id, budgets.categoryId))
    .where(eq(budgets.userId, userId))
    .orderBy(categories.name);

  const out: BudgetWithStatus[] = [];
  for (const b of rows) {
    const spentCents = await spentInCategory(database, userId, b.categoryId, month);
    out.push({
      ...b,
      spentCents,
      ratio: b.monthlyLimitCents > 0 ? spentCents / b.monthlyLimitCents : 0,
    });
  }
  return out;
}

// Orçamentos que cruzaram 100% HOJE (estavam < limite até ontem e agora ≥ limite).
// Usado pelo cron de alertas (seção 9) — evita repetir o alerta todo dia.
export async function budgetsCrossedToday(
  database: Db,
  userId: number,
  today: string,
): Promise<BudgetWithStatus[]> {
  const month = monthOf(today);
  const all = await listBudgetsWithStatus(database, userId, month);
  const crossed: BudgetWithStatus[] = [];
  for (const b of all) {
    if (b.spentCents < b.monthlyLimitCents) continue; // ainda não estourou
    const before = await spentInCategory(database, userId, b.categoryId, month, today);
    if (before < b.monthlyLimitCents) crossed.push(b); // cruzou hoje
  }
  return crossed;
}

export async function upsertBudget(
  database: Db,
  userId: number,
  input: { categoryId: number; monthlyLimitCents: number },
): Promise<Budget> {
  const cat = await getUserCategory(database, userId, input.categoryId);
  if (!cat) throw new HttpError(422, "invalid_category", "categoria inexistente");

  const existing = await database.query.budgets.findFirst({
    where: and(
      eq(budgets.userId, userId),
      eq(budgets.categoryId, input.categoryId),
    ),
  });

  if (existing) {
    await database
      .update(budgets)
      .set({ monthlyLimitCents: input.monthlyLimitCents })
      .where(eq(budgets.id, existing.id));
    return { ...existing, monthlyLimitCents: input.monthlyLimitCents };
  }

  const inserted = await database
    .insert(budgets)
    .values({
      userId,
      categoryId: input.categoryId,
      monthlyLimitCents: input.monthlyLimitCents,
    })
    .returning();
  const budget = inserted[0];
  if (!budget) throw new HttpError(500, "insert_failed", "falha ao criar orçamento");
  return budget;
}

export async function listBudgets(database: Db, userId: number): Promise<Budget[]> {
  return database.query.budgets.findMany({ where: eq(budgets.userId, userId) });
}

export async function deleteBudget(
  database: Db,
  userId: number,
  id: number,
): Promise<boolean> {
  const deleted = await database
    .delete(budgets)
    .where(and(eq(budgets.userId, userId), eq(budgets.id, id)))
    .returning({ id: budgets.id });
  return deleted.length > 0;
}
