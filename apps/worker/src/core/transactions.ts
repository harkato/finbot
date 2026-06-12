import type {
  CreateTransaction,
  PatchTransaction,
  TransactionQuery,
} from "@finbot/shared";
import { and, desc, eq, like } from "drizzle-orm";
import type { Db } from "../db/client";
import { transactions, type Transaction } from "../db/schema";
import { getDefaultAccountId, getUserAccount } from "./accounts";
import { computeInvoiceMonth, getUserCard } from "./cards";
import { categorize } from "./categorize";
import { getUserCategory, listUserCategories } from "./categories";
import { todaySaoPaulo } from "./dates";
import { HttpError } from "./errors";

// Resolve a categoria de uma transação: usa a explícita (validando posse) ou cai na
// categorização automática por keywords (seção 6.1).
async function resolveCategoryId(
  database: Db,
  userId: number,
  description: string,
  type: CreateTransaction["type"],
  explicitId: number | undefined,
): Promise<number> {
  if (explicitId !== undefined) {
    const cat = await getUserCategory(database, userId, explicitId);
    if (!cat) throw new HttpError(422, "invalid_category", "categoria inexistente");
    return cat.id;
  }
  const cats = await listUserCategories(database, userId);
  const chosen = categorize(description, type, cats);
  if (chosen === null) {
    throw new HttpError(500, "no_fallback_category", "seed de categorias ausente");
  }
  return chosen;
}

export async function createTransaction(
  database: Db,
  userId: number,
  input: CreateTransaction,
): Promise<Transaction> {
  const date = input.date ?? todaySaoPaulo();
  const categoryId = await resolveCategoryId(
    database,
    userId,
    input.description,
    input.type,
    input.categoryId,
  );

  // Resolve conta/cartão (invariante: exatamente um). Gasto em cartão não toca conta,
  // entra na fatura invoiceMonth e nasce paid:false (seção 6.2). Sem indicação ⇒ conta
  // padrão (Carteira).
  let accountId = input.accountId ?? null;
  const cardId = input.cardId ?? null;
  let invoiceMonth = input.invoiceMonth ?? null;
  let paid = input.paid;

  if (accountId !== null && cardId !== null) {
    throw new HttpError(422, "account_xor_card", "informe conta OU cartão, não ambos");
  }

  if (cardId !== null) {
    const card = await getUserCard(database, userId, cardId);
    if (!card) throw new HttpError(422, "invalid_card", "cartão inexistente");
    invoiceMonth = invoiceMonth ?? computeInvoiceMonth(date, card.closingDay);
    paid = paid ?? false; // gasto em cartão nasce a pagar
  } else {
    if (accountId !== null) {
      const acc = await getUserAccount(database, userId, accountId);
      if (!acc) throw new HttpError(422, "invalid_account", "conta inexistente");
    } else {
      accountId = await getDefaultAccountId(database, userId);
    }
  }

  const inserted = await database
    .insert(transactions)
    .values({
      userId,
      type: input.type,
      amountCents: input.amountCents,
      description: input.description,
      categoryId,
      accountId,
      cardId,
      invoiceMonth,
      date,
      paid: paid ?? true,
      tags: JSON.stringify(input.tags ?? []),
      source: input.source,
    })
    .returning();

  const tx = inserted[0];
  if (!tx) throw new HttpError(500, "insert_failed", "falha ao inserir transação");
  return tx;
}

export async function listTransactions(
  database: Db,
  userId: number,
  q: TransactionQuery,
): Promise<Transaction[]> {
  const conds = [eq(transactions.userId, userId)];
  if (q.month) conds.push(like(transactions.date, `${q.month}-%`));
  if (q.categoryId) conds.push(eq(transactions.categoryId, q.categoryId));
  if (q.accountId) conds.push(eq(transactions.accountId, q.accountId));
  if (q.cardId) conds.push(eq(transactions.cardId, q.cardId));
  if (q.type) conds.push(eq(transactions.type, q.type));
  if (q.paid !== undefined) conds.push(eq(transactions.paid, q.paid));
  // tags é JSON string[]; match aproximado por "valor" entre aspas.
  if (q.tag) conds.push(like(transactions.tags, `%"${q.tag}"%`));

  return database
    .select()
    .from(transactions)
    .where(and(...conds))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(q.limit)
    .offset(q.offset);
}

export async function getUserTransaction(
  database: Db,
  userId: number,
  id: number,
): Promise<Transaction | null> {
  const row = await database.query.transactions.findFirst({
    where: and(eq(transactions.userId, userId), eq(transactions.id, id)),
  });
  return row ?? null;
}

export async function updateTransaction(
  database: Db,
  userId: number,
  id: number,
  patch: PatchTransaction,
): Promise<Transaction | null> {
  const existing = await getUserTransaction(database, userId, id);
  if (!existing) return null;

  if (patch.categoryId !== undefined) {
    const cat = await getUserCategory(database, userId, patch.categoryId);
    if (!cat) throw new HttpError(422, "invalid_category", "categoria inexistente");
  }

  const values: Partial<typeof transactions.$inferInsert> = {};
  if (patch.type !== undefined) values.type = patch.type;
  if (patch.amountCents !== undefined) values.amountCents = patch.amountCents;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.date !== undefined) values.date = patch.date;
  if (patch.categoryId !== undefined) values.categoryId = patch.categoryId;
  if (patch.accountId !== undefined) values.accountId = patch.accountId;
  if (patch.cardId !== undefined) values.cardId = patch.cardId;
  if (patch.invoiceMonth !== undefined) values.invoiceMonth = patch.invoiceMonth;
  if (patch.paid !== undefined) values.paid = patch.paid;
  if (patch.tags !== undefined) values.tags = JSON.stringify(patch.tags);

  await database
    .update(transactions)
    .set(values)
    .where(and(eq(transactions.userId, userId), eq(transactions.id, id)));

  return getUserTransaction(database, userId, id);
}

export async function deleteTransaction(
  database: Db,
  userId: number,
  id: number,
): Promise<boolean> {
  const deleted = await database
    .delete(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.id, id)))
    .returning({ id: transactions.id });
  return deleted.length > 0;
}

// Última transação de um source (usado pelo /desfazer do bot — Fase 2).
export async function lastTransactionBySource(
  database: Db,
  userId: number,
  source: Transaction["source"],
): Promise<Transaction | null> {
  const row = await database.query.transactions.findFirst({
    where: and(eq(transactions.userId, userId), eq(transactions.source, source)),
    orderBy: [desc(transactions.id)],
  });
  return row ?? null;
}
