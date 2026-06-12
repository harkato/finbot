// Aceite da Fase 4: invoiceMonth (fechamento), gasto no cartão não afeta conta, pagar
// fatura debita a conta pagadora e quita os itens, sintaxe "no <cartão>" no bot.
// Uso: BASE=... TOKEN=... bun scripts/acceptance-phase4.ts  (D1 limpo + wrangler dev)

const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const TOKEN = process.env.TOKEN ?? "dev-api-token";
const A = 7001;
const B = 7002;

let failures = 0;
let updateId = 2000;
let messageId = 1;
function check(label: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) {
    failures++;
    if (detail !== undefined) console.log("   detalhe:", JSON.stringify(detail));
  }
}
function headers(tgId?: number): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
  if (tgId !== undefined) h["X-Telegram-Id"] = String(tgId);
  return h;
}
const createUser = (telegramId: number, name: string) =>
  fetch(`${BASE}/api/internal/users`, { method: "POST", headers: headers(), body: JSON.stringify({ telegramId, name }) });
const post = (path: string, tgId: number, body: unknown) =>
  fetch(`${BASE}${path}`, { method: "POST", headers: headers(tgId), body: JSON.stringify(body) });
async function getJson<T>(path: string, tgId: number): Promise<T> {
  return (await (await fetch(`${BASE}${path}`, { headers: headers(tgId) })).json()) as T;
}
async function botText(tgId: number, name: string, text: string): Promise<string> {
  const message = { message_id: messageId++, from: { id: tgId, is_bot: false, first_name: name }, chat: { id: tgId, type: "private", first_name: name }, date: 0, text };
  const r = (await (await fetch(`${BASE}/webhook/telegram`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ update_id: updateId++, message }) })).json()) as { sent: { text: string }[] };
  return r.sent.map((s) => s.text).join("\n");
}

type Account = { id: number; name: string; type: string; balanceCents: number };
type Card = { id: number; name: string };

await createUser(A, "Ana");
await createUser(B, "Beto");

// Conta pagadora + cartão.
const banco = ((await (await post("/api/accounts", A, { name: "Banco", type: "corrente", initialBalanceCents: 0 })).json()) as { account: Account }).account;
const cardRes = await post("/api/cards", A, { name: "Itaú", limitCents: 500000, closingDay: 15, dueDay: 22, payFromAccountId: banco.id });
const card = ((await cardRes.json()) as { card: Card }).card;
check("cria cartão Itaú (201)", cardRes.status === 201);

// Compra DEPOIS do fechamento (dia 20 > 15) → fatura do mês seguinte.
const afterClose = await post("/api/transactions", A, { type: "saida", amountCents: 10000, description: "compra grande", cardId: card.id, date: "2026-06-20", source: "web" });
const afterTx = ((await afterClose.json()) as { transaction: { invoiceMonth: string; paid: boolean; accountId: number | null; cardId: number } }).transaction;
check("compra após fechamento → fatura 2026-07", afterTx.invoiceMonth === "2026-07", afterTx);
check("gasto no cartão nasce a pagar (paid=false)", afterTx.paid === false, afterTx);
check("gasto no cartão não tem conta (accountId null)", afterTx.accountId === null, afterTx);

// Compra ANTES do fechamento (dia 10 <= 15) → fatura do mês corrente.
const beforeClose = await post("/api/transactions", A, { type: "saida", amountCents: 5000, description: "compra pequena", cardId: card.id, date: "2026-06-10", source: "web" });
const beforeTx = ((await beforeClose.json()) as { transaction: { invoiceMonth: string } }).transaction;
check("compra antes do fechamento → fatura 2026-06", beforeTx.invoiceMonth === "2026-06", beforeTx);

// Gasto no cartão NÃO afeta saldo da conta.
let accs = (await getJson<{ accounts: Account[] }>("/api/accounts", A)).accounts;
check("Banco continua com saldo 0 (cartão não debita conta)", accs.find((a) => a.id === banco.id)?.balanceCents === 0, accs);

// Fatura 2026-07.
const inv = (await getJson<{ invoice: { totalCents: number; items: unknown[]; paid: boolean } }>(`/api/cards/${card.id}/invoice?month=2026-07`, A)).invoice;
check("fatura 2026-07 total = R$ 100,00", inv.totalCents === 10000, inv);
check("fatura 2026-07 tem 1 item em aberto", inv.items.length === 1 && inv.paid === false, inv);

// Paga a fatura 2026-07.
const pay = await post(`/api/cards/${card.id}/pay-invoice`, A, { month: "2026-07" });
const payBody = (await pay.json()) as { totalCents: number; count: number };
check("pagar fatura 2026-07 (200, total 10000)", pay.status === 200 && payBody.totalCents === 10000, payBody);

// Conta pagadora debitada.
accs = (await getJson<{ accounts: Account[] }>("/api/accounts", A)).accounts;
check("Banco debitado em R$ 100,00 (saldo −10000)", accs.find((a) => a.id === banco.id)?.balanceCents === -10000, accs);

// Itens da fatura quitados.
const invAfter = (await getJson<{ invoice: { paid: boolean } }>(`/api/cards/${card.id}/invoice?month=2026-07`, A)).invoice;
check("fatura 2026-07 agora está paga", invAfter.paid === true, invAfter);

// Pagar de novo → 409 (nada em aberto).
const payAgain = await post(`/api/cards/${card.id}/pay-invoice`, A, { month: "2026-07" });
check("pagar fatura já paga → 409", payAgain.status === 409, await payAgain.clone().json());

// Invariante conta XOR cartão.
const both = await post("/api/transactions", A, { type: "saida", amountCents: 100, description: "x", accountId: banco.id, cardId: card.id, source: "web" });
check("conta + cartão juntos → 422", both.status === 422, await both.clone().json());

// Bot: sintaxe "no <cartão>".
const botReply = await botText(A, "Ana", "mercado 80 no itau");
check("bot: lançamento no cartão Itaú", /cartão Itaú/i.test(botReply) && /fatura/i.test(botReply), botReply);
const cardTxs = (await getJson<{ transactions: Array<{ description: string; cardId: number | null }> }>(`/api/transactions?cardId=${card.id}`, A)).transactions;
check("bot: transação ficou no cartão", cardTxs.some((t) => t.description.includes("mercado") && t.cardId === card.id), cardTxs.map((t) => t.description));

// Isolamento: B não vê o cartão do A.
const bCards = (await getJson<{ cards: Card[] }>("/api/cards", B)).cards;
check("B não vê cartões do A", bCards.length === 0, bCards);

console.log(failures === 0 ? "\nTODOS OS CHECKS PASSARAM ✅" : `\n${failures} CHECK(S) FALHARAM ❌`);
process.exit(failures === 0 ? 0 : 1);
