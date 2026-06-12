import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { transactions, type User } from "../db/schema";
import { budgetsCrossedToday } from "./budgets";
import { listUserCards } from "./cards";
import { addDays } from "./dates";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (cents: number) => brl.format(cents / 100);

// Monta as linhas de alerta de um usuário para a data `today` (seção 9):
//   1. pendências (paid:false) vencendo hoje/amanhã
//   2. faturas fechando em 2 dias
//   3. orçamentos que cruzaram 100% hoje
// Lista vazia ⇒ nada a enviar (silêncio é o padrão).
export async function buildAlertsForUser(
  database: Db,
  user: User,
  today: string,
): Promise<string[]> {
  const lines: string[] = [];
  const tomorrow = addDays(today, 1);

  // 1) pendências vencendo hoje/amanhã
  const pendentes = await database.query.transactions.findMany({
    where: and(
      eq(transactions.userId, user.id),
      eq(transactions.paid, false),
      inArray(transactions.date, [today, tomorrow]),
    ),
    orderBy: transactions.date,
  });
  for (const p of pendentes) {
    const quando = p.date === today ? "hoje" : "amanhã";
    const verbo = p.type === "entrada" ? "A receber" : "A pagar";
    lines.push(`⏰ ${verbo} ${quando}: ${p.description} — ${money(p.amountCents)}`);
  }

  // 2) faturas fechando em 2 dias
  const target = addDays(today, 2);
  const targetDay = Number(target.slice(8, 10));
  const cards = await listUserCards(database, user.id);
  for (const card of cards) {
    if (card.closingDay === targetDay) {
      lines.push(`📅 A fatura do cartão ${card.name} fecha em 2 dias (dia ${card.closingDay}).`);
    }
  }

  // 3) orçamentos que cruzaram 100% hoje
  const crossed = await budgetsCrossedToday(database, user.id, today);
  for (const b of crossed) {
    lines.push(
      `🚨 Orçamento estourado: ${b.categoryName} — ${money(b.spentCents)} de ${money(b.monthlyLimitCents)}.`,
    );
  }

  return lines;
}

// Envia uma mensagem ao Telegram via API HTTP (não precisa do grammY no cron).
export async function sendTelegramMessage(
  token: string,
  chatId: number,
  text: string,
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return res.ok;
  } catch (err) {
    console.error("sendTelegramMessage failed", err);
    return false;
  }
}
