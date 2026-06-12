// Aceite da Fase 5: status de orçamento síncrono no POST, ⚠️ em 80% / 🚨 em 100% na
// confirmação do bot, /orcamento e /api/alerts/preview (pendências, fatura, estouro).
// Uso: BASE=... TOKEN=... bun scripts/acceptance-phase5.ts  (D1 limpo + wrangler dev)

const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const TOKEN = process.env.TOKEN ?? "dev-api-token";
const A = 8001;
const B = 8002;

let failures = 0;
let updateId = 3000;
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
async function botCommand(tgId: number, name: string, cmd: string): Promise<string> {
  const message = { message_id: messageId++, from: { id: tgId, is_bot: false, first_name: name }, chat: { id: tgId, type: "private", first_name: name }, date: 0, text: `/${cmd}`, entities: [{ type: "bot_command", offset: 0, length: cmd.length + 1 }] };
  const r = (await (await fetch(`${BASE}/webhook/telegram`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ update_id: updateId++, message }) })).json()) as { sent: { text: string }[] };
  return r.sent.map((s) => s.text).join("\n");
}

// Data de hoje em São Paulo + (hoje+2) p/ alinhar com o worker.
const spFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const today = spFmt.format(new Date());
const plus2 = new Date(new Date(`${today}T12:00:00Z`).getTime() + 2 * 86400000).toISOString().slice(0, 10);
const closingDayIn2 = Number(plus2.slice(8, 10));

type Category = { id: number; name: string };

await createUser(A, "Ana");
await createUser(B, "Beto");

// Orçamento de R$ 100 em alimentação.
const cats = (await getJson<{ categories: Category[] }>("/api/categories", A)).categories;
const alimentacao = cats.find((c) => c.name === "alimentação")!;
check("GET categories traz alimentação", alimentacao !== undefined);
await post("/api/budgets", A, { categoryId: alimentacao.id, monthlyLimitCents: 10000 });

// Bot: gasto que leva a 85% → ⚠️.
const r85 = await botText(A, "Ana", "mercado 85");
check("bot: 85% do orçamento gera ⚠️", r85.includes("⚠️") && /85%/.test(r85), r85);

// Bot: mais um gasto estoura → 🚨.
const r115 = await botText(A, "Ana", "ifood 30");
check("bot: estouro do orçamento gera 🚨", r115.includes("🚨"), r115);

// POST API devolve o status do orçamento.
const apiResp = (await (await post("/api/transactions", A, { type: "saida", amountCents: 500, description: "padaria", source: "web" })).json()) as {
  budget: { spentCents: number; limitCents: number; ratio: number } | null;
};
check("POST devolve budget com spent/limit/ratio", apiResp.budget !== null && apiResp.budget.limitCents === 10000, apiResp.budget);
check("budget.ratio > 1 (estourado)", (apiResp.budget?.ratio ?? 0) > 1, apiResp.budget);

// entrada NÃO traz budget.
const entradaResp = (await (await post("/api/transactions", A, { type: "entrada", amountCents: 1000, description: "troco", source: "web" })).json()) as { budget: unknown };
check("entrada não traz budget (null)", entradaResp.budget === null, entradaResp.budget);

// /orcamento mostra 🚨.
const orc = await botCommand(A, "Ana", "orcamento");
check("/orcamento lista alimentação estourada", /aliment/i.test(orc) && orc.includes("🚨"), orc);

// Alertas: pendência vencendo hoje.
await post("/api/transactions", A, { type: "saida", amountCents: 7000, description: "aluguel", date: today, paid: false, source: "web" });
// Alertas: cartão fechando em 2 dias.
if (closingDayIn2 <= 28) {
  await post("/api/cards", A, { name: "VisaTest", limitCents: 100000, closingDay: closingDayIn2, dueDay: 1 });
}
const preview = (await getJson<{ alerts: string[] }>("/api/alerts/preview", A)).alerts;
check("preview: pendência vencendo hoje", preview.some((a) => a.includes("aluguel") && a.includes("hoje")), preview);
check("preview: orçamento estourado hoje", preview.some((a) => /Orçamento estourado/.test(a) && /aliment/i.test(a)), preview);
if (closingDayIn2 <= 28) {
  check("preview: fatura fechando em 2 dias", preview.some((a) => a.includes("VisaTest") && a.includes("2 dias")), preview);
}

// Isolamento: B não tem orçamentos nem alertas.
const bBudgets = (await getJson<{ budgets: unknown[] }>("/api/budgets", B)).budgets;
check("B não vê orçamentos do A", bBudgets.length === 0, bBudgets);
const bPreview = (await getJson<{ alerts: string[] }>("/api/alerts/preview", B)).alerts;
check("B não tem alertas", bPreview.length === 0, bPreview);

console.log(failures === 0 ? "\nTODOS OS CHECKS PASSARAM ✅" : `\n${failures} CHECK(S) FALHARAM ❌`);
process.exit(failures === 0 ? 0 : 1);
