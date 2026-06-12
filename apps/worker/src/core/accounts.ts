import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { accounts, transactions, type Account } from "../db/schema";
import { HttpError } from "./errors";

export type AccountWithBalance = Account & { balanceCents: number };

// Soma das transações PAGAS por conta e tipo (usada para derivar saldos).
async function paidTotalsByAccount(
  database: Db,
  userId: number,
): Promise<Map<number, { entradas: number; saidas: number }>> {
  const rows = await database
    .select({
      accountId: transactions.accountId,
      type: transactions.type,
      total: sql<number>`sum(${transactions.amountCents})`,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.paid, true)))
    .groupBy(transactions.accountId, transactions.type);

  const map = new Map<number, { entradas: number; saidas: number }>();
  for (const r of rows) {
    if (r.accountId === null) continue;
    const cur = map.get(r.accountId) ?? { entradas: 0, saidas: 0 };
    if (r.type === "entrada") cur.entradas += Number(r.total);
    else cur.saidas += Number(r.total);
    map.set(r.accountId, cur);
  }
  return map;
}

function balanceOf(
  account: Account,
  totals: { entradas: number; saidas: number } | undefined,
): number {
  const e = totals?.entradas ?? 0;
  const s = totals?.saidas ?? 0;
  return account.initialBalanceCents + e - s;
}

export async function listUserAccounts(
  database: Db,
  userId: number,
  opts: { includeArchived?: boolean } = {},
): Promise<AccountWithBalance[]> {
  const rows = await database.query.accounts.findMany({
    where: eq(accounts.userId, userId),
    orderBy: accounts.id,
  });
  const totals = await paidTotalsByAccount(database, userId);
  return rows
    .filter((a) => opts.includeArchived || !a.archived)
    .map((a) => ({ ...a, balanceCents: balanceOf(a, totals.get(a.id)) }));
}

export async function getUserAccount(
  database: Db,
  userId: number,
  id: number,
): Promise<Account | null> {
  const row = await database.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.id, id)),
  });
  return row ?? null;
}

// Conta padrão para lançamentos sem indicação: a "Carteira" (type carteira), senão a
// primeira conta não arquivada.
export async function getDefaultAccountId(
  database: Db,
  userId: number,
): Promise<number | null> {
  const rows = await database.query.accounts.findMany({
    where: eq(accounts.userId, userId),
    orderBy: accounts.id,
  });
  const active = rows.filter((a) => !a.archived);
  const carteira = active.find((a) => a.type === "carteira");
  return (carteira ?? active[0])?.id ?? null;
}

export async function createAccount(
  database: Db,
  userId: number,
  input: {
    name: string;
    type?: Account["type"];
    initialBalanceCents?: number;
  },
): Promise<Account> {
  const inserted = await database
    .insert(accounts)
    .values({
      userId,
      name: input.name,
      type: input.type ?? "corrente",
      initialBalanceCents: input.initialBalanceCents ?? 0,
    })
    .returning();
  const account = inserted[0];
  if (!account) throw new HttpError(500, "insert_failed", "falha ao criar conta");
  return account;
}

export async function updateAccount(
  database: Db,
  userId: number,
  id: number,
  patch: {
    name?: string;
    type?: Account["type"];
    initialBalanceCents?: number;
    archived?: boolean;
  },
): Promise<Account | null> {
  const existing = await getUserAccount(database, userId, id);
  if (!existing) return null;

  const values: Partial<typeof accounts.$inferInsert> = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.type !== undefined) values.type = patch.type;
  if (patch.initialBalanceCents !== undefined)
    values.initialBalanceCents = patch.initialBalanceCents;
  if (patch.archived !== undefined) values.archived = patch.archived;

  await database
    .update(accounts)
    .set(values)
    .where(and(eq(accounts.userId, userId), eq(accounts.id, id)));

  return getUserAccount(database, userId, id);
}
