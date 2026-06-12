import { and, desc, eq, like } from "drizzle-orm";
import type { Db } from "../db/client";
import { accounts, categories, creditCards, transactions } from "../db/schema";

function csvCell(value: string): string {
  // separador é ';'; escapa aspas e envolve se necessário.
  if (/[";\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function reais(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

// Gera um CSV (separador ';', decimal vírgula — amigável ao Excel BR) das transações do
// usuário, opcionalmente filtradas por mês.
export async function exportTransactionsCsv(
  database: Db,
  userId: number,
  month?: string,
): Promise<string> {
  const conds = [eq(transactions.userId, userId)];
  if (month) conds.push(like(transactions.date, `${month}-%`));

  const rows = await database
    .select({
      date: transactions.date,
      type: transactions.type,
      amountCents: transactions.amountCents,
      description: transactions.description,
      category: categories.name,
      account: accounts.name,
      card: creditCards.name,
      paid: transactions.paid,
      tags: transactions.tags,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(creditCards, eq(creditCards.id, transactions.cardId))
    .where(and(...conds))
    .orderBy(desc(transactions.date), desc(transactions.id));

  const header = [
    "Data", "Tipo", "Valor", "Descrição", "Categoria", "Conta/Cartão", "Pago", "Tags",
  ].join(";");

  const lines = rows.map((r) => {
    let tags = "";
    try {
      const arr: unknown = JSON.parse(r.tags);
      if (Array.isArray(arr)) tags = arr.join(", ");
    } catch {
      tags = "";
    }
    return [
      r.date,
      r.type,
      reais(r.amountCents),
      r.description,
      r.category ?? "",
      r.card ? `Cartão ${r.card}` : (r.account ?? ""),
      r.paid ? "sim" : "não",
      tags,
    ]
      .map((c) => csvCell(String(c)))
      .join(";");
  });

  return [header, ...lines].join("\r\n");
}
