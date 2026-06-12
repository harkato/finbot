import { and, eq, gte, like, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { categories, transactions } from "../db/schema";
import { addMonths, currentMonth } from "./dates";

export type CategorySummary = {
  categoryId: number;
  name: string;
  color: string | null;
  type: "entrada" | "saida";
  totalCents: number;
};

export type Summary = {
  month: string;
  entradas: number;
  saidas: number;
  saldo: number;
  porCategoria: CategorySummary[];
};

// Resumo do mês: totais de entrada/saída, saldo e quebra por categoria.
export async function getSummary(
  database: Db,
  userId: number,
  month: string,
): Promise<Summary> {
  const rows = await database
    .select({
      categoryId: transactions.categoryId,
      name: categories.name,
      color: categories.color,
      type: transactions.type,
      totalCents: sql<number>`sum(${transactions.amountCents})`,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, userId),
        like(transactions.date, `${month}-%`),
      ),
    )
    .groupBy(transactions.categoryId, transactions.type)
    .orderBy(sql`sum(${transactions.amountCents}) desc`);

  let entradas = 0;
  let saidas = 0;
  const porCategoria: CategorySummary[] = rows.map((r) => {
    const totalCents = Number(r.totalCents);
    if (r.type === "entrada") entradas += totalCents;
    else saidas += totalCents;
    return {
      categoryId: r.categoryId,
      name: r.name,
      color: r.color,
      type: r.type,
      totalCents,
    };
  });

  return { month, entradas, saidas, saldo: entradas - saidas, porCategoria };
}

export type CashflowPoint = {
  month: string;
  entradas: number;
  saidas: number;
  saldo: number;
};

// Fluxo de caixa dos últimos N meses (inclui o atual), em ordem ascendente.
export async function getCashflow(
  database: Db,
  userId: number,
  months: number,
): Promise<CashflowPoint[]> {
  const start = addMonths(currentMonth(), -(months - 1));
  const startDay = `${start}-01`;

  const rows = await database
    .select({
      month: sql<string>`substr(${transactions.date}, 1, 7)`,
      type: transactions.type,
      totalCents: sql<number>`sum(${transactions.amountCents})`,
    })
    .from(transactions)
    .where(
      and(eq(transactions.userId, userId), gte(transactions.date, startDay)),
    )
    .groupBy(sql`substr(${transactions.date}, 1, 7)`, transactions.type);

  const acc = new Map<string, { entradas: number; saidas: number }>();
  for (const r of rows) {
    const point = acc.get(r.month) ?? { entradas: 0, saidas: 0 };
    if (r.type === "entrada") point.entradas += Number(r.totalCents);
    else point.saidas += Number(r.totalCents);
    acc.set(r.month, point);
  }

  const out: CashflowPoint[] = [];
  for (let i = 0; i < months; i++) {
    const month = addMonths(start, i);
    const point = acc.get(month) ?? { entradas: 0, saidas: 0 };
    out.push({
      month,
      entradas: point.entradas,
      saidas: point.saidas,
      saldo: point.entradas - point.saidas,
    });
  }
  return out;
}
