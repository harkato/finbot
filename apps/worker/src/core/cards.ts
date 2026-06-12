import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  creditCards,
  transactions,
  type CreditCard,
  type Transaction,
} from "../db/schema";
import { getUserCategoryByName } from "./categories";
import { addMonths, todaySaoPaulo } from "./dates";
import { HttpError } from "./errors";

// Mês da fatura: se o dia do gasto for > closingDay, cai na fatura do mês seguinte
// (seção 6.2). date = "YYYY-MM-DD".
export function computeInvoiceMonth(date: string, closingDay: number): string {
  const day = Number(date.slice(8, 10));
  const month = date.slice(0, 7);
  return day > closingDay ? addMonths(month, 1) : month;
}

export async function listUserCards(
  database: Db,
  userId: number,
  opts: { includeArchived?: boolean } = {},
): Promise<CreditCard[]> {
  const rows = await database.query.creditCards.findMany({
    where: eq(creditCards.userId, userId),
    orderBy: creditCards.id,
  });
  return rows.filter((c) => opts.includeArchived || !c.archived);
}

export async function getUserCard(
  database: Db,
  userId: number,
  id: number,
): Promise<CreditCard | null> {
  const row = await database.query.creditCards.findFirst({
    where: and(eq(creditCards.userId, userId), eq(creditCards.id, id)),
  });
  return row ?? null;
}

export async function createCard(
  database: Db,
  userId: number,
  input: {
    name: string;
    limitCents: number;
    closingDay: number;
    dueDay: number;
    payFromAccountId?: number | null;
  },
): Promise<CreditCard> {
  const inserted = await database
    .insert(creditCards)
    .values({
      userId,
      name: input.name,
      limitCents: input.limitCents,
      closingDay: input.closingDay,
      dueDay: input.dueDay,
      payFromAccountId: input.payFromAccountId ?? null,
    })
    .returning();
  const card = inserted[0];
  if (!card) throw new HttpError(500, "insert_failed", "falha ao criar cartão");
  return card;
}

export async function updateCard(
  database: Db,
  userId: number,
  id: number,
  patch: Partial<{
    name: string;
    limitCents: number;
    closingDay: number;
    dueDay: number;
    payFromAccountId: number | null;
    archived: boolean;
  }>,
): Promise<CreditCard | null> {
  const existing = await getUserCard(database, userId, id);
  if (!existing) return null;

  const values: Partial<typeof creditCards.$inferInsert> = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.limitCents !== undefined) values.limitCents = patch.limitCents;
  if (patch.closingDay !== undefined) values.closingDay = patch.closingDay;
  if (patch.dueDay !== undefined) values.dueDay = patch.dueDay;
  if (patch.payFromAccountId !== undefined)
    values.payFromAccountId = patch.payFromAccountId;
  if (patch.archived !== undefined) values.archived = patch.archived;

  await database
    .update(creditCards)
    .set(values)
    .where(and(eq(creditCards.userId, userId), eq(creditCards.id, id)));

  return getUserCard(database, userId, id);
}

export type Invoice = {
  cardId: number;
  month: string;
  items: Transaction[];
  totalCents: number; // saídas − entradas (estornos)
  paid: boolean; // true se não há itens em aberto
};

export async function getInvoice(
  database: Db,
  userId: number,
  cardId: number,
  month: string,
): Promise<Invoice> {
  const items = await database.query.transactions.findMany({
    where: and(
      eq(transactions.userId, userId),
      eq(transactions.cardId, cardId),
      eq(transactions.invoiceMonth, month),
    ),
    orderBy: transactions.date,
  });

  let totalCents = 0;
  let hasOpen = false;
  for (const t of items) {
    totalCents += t.type === "saida" ? t.amountCents : -t.amountCents;
    if (!t.paid) hasOpen = true;
  }

  return { cardId, month, items, totalCents, paid: items.length > 0 && !hasOpen };
}

export type PayInvoiceResult =
  | { ok: true; payment: Transaction; totalCents: number; count: number }
  | { ok: false; reason: "empty" | "no_pay_account" | "no_open_items" };

// Paga a fatura: cria uma saída na payFromAccountId (categoria "fatura cartão") com o
// total em aberto e marca os itens daquela fatura como pagos (seção 6.2). Atômico (batch).
export async function payInvoice(
  database: Db,
  userId: number,
  cardId: number,
  month: string,
): Promise<PayInvoiceResult> {
  const card = await getUserCard(database, userId, cardId);
  if (!card) throw new HttpError(404, "not_found", "cartão inexistente");
  if (card.payFromAccountId === null) return { ok: false, reason: "no_pay_account" };

  const open = await database.query.transactions.findMany({
    where: and(
      eq(transactions.userId, userId),
      eq(transactions.cardId, cardId),
      eq(transactions.invoiceMonth, month),
      eq(transactions.paid, false),
    ),
  });
  if (open.length === 0) return { ok: false, reason: "no_open_items" };

  let totalCents = 0;
  for (const t of open) {
    totalCents += t.type === "saida" ? t.amountCents : -t.amountCents;
  }
  if (totalCents <= 0) return { ok: false, reason: "empty" };

  const faturaCat = await getUserCategoryByName(database, userId, "fatura cartão");
  const today = todaySaoPaulo();

  // saída que debita a conta pagadora
  const insertPayment = database
    .insert(transactions)
    .values({
      userId,
      type: "saida",
      amountCents: totalCents,
      description: `Fatura ${card.name} ${month}`,
      categoryId: faturaCat?.id ?? open[0]!.categoryId,
      accountId: card.payFromAccountId,
      cardId: null,
      date: today,
      paid: true,
      source: "web",
    })
    .returning();

  // marca os itens da fatura como pagos
  const markPaid = database
    .update(transactions)
    .set({ paid: true })
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.cardId, cardId),
        eq(transactions.invoiceMonth, month),
        eq(transactions.paid, false),
      ),
    );

  const [paymentRows] = await database.batch([insertPayment, markPaid]);
  const payment = (paymentRows as Transaction[])[0];
  if (!payment) throw new HttpError(500, "pay_failed", "falha ao pagar fatura");

  return { ok: true, payment, totalCents, count: open.length };
}
