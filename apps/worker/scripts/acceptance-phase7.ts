// Aceite da Fase 7: metas, categorias CRUD, tags no bot, /mes, export CSV e recorrências
// (materializadas pelo cron via /__scheduled). Requer D1 limpo + `wrangler dev --test-scheduled`.

const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const TOKEN = process.env.TOKEN ?? "dev-api-token";
const U = 9001;

let failures = 0;
let updateId = 7000;
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
const post = (path: string, tgId: number, body: unknown) =>
  fetch(`${BASE}${path}`, { method: "POST", headers: headers(tgId), body: JSON.stringify(body) });
const patch = (path: string, tgId: number, body: unknown) =>
  fetch(`${BASE}${path}`, { method: "PATCH", headers: headers(tgId), body: JSON.stringify(body) });
const del = (path: string, tgId: number) =>
  fetch(`${BASE}${path}`, { method: "DELETE", headers: headers(tgId) });
async function getJson<T>(path: string, tgId: number): Promise<T> {
  return (await (await fetch(`${BASE}${path}`, { headers: headers(tgId) })).json()) as T;
}
async function botText(tgId: number, text: string): Promise<string> {
  const message = { message_id: messageId++, from: { id: tgId, is_bot: false, first_name: "Tester" }, chat: { id: tgId, type: "private", first_name: "Tester" }, date: 0, text };
  const r = (await (await fetch(`${BASE}/webhook/telegram`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ update_id: updateId++, message }) })).json()) as { sent: { text: string }[] };
  return r.sent.map((s) => s.text).join("\n");
}
async function botCmd(tgId: number, cmd: string, arg = ""): Promise<string> {
  const text = arg ? `/${cmd} ${arg}` : `/${cmd}`;
  const message = { message_id: messageId++, from: { id: tgId, is_bot: false, first_name: "Tester" }, chat: { id: tgId, type: "private", first_name: "Tester" }, date: 0, text, entities: [{ type: "bot_command", offset: 0, length: cmd.length + 1 }] };
  const r = (await (await fetch(`${BASE}/webhook/telegram`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ update_id: updateId++, message }) })).json()) as { sent: { text: string }[] };
  return r.sent.map((s) => s.text).join("\n");
}

const spFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const today = spFmt.format(new Date());
const todayDay = Number(today.slice(8, 10));
const month = today.slice(0, 7);

await fetch(`${BASE}/api/internal/users`, { method: "POST", headers: headers(), body: JSON.stringify({ telegramId: U, name: "Tester" }) });

// ── Metas (goals) ─────────────────────────────────────────────────────────────
type Goal = { id: number; name: string; savedCents: number; targetCents: number };
const goal = ((await (await post("/api/goals", U, { name: "Reserva", targetCents: 100000 })).json()) as { goal: Goal }).goal;
check("cria meta", goal?.targetCents === 100000);
await patch(`/api/goals/${goal.id}`, U, { savedCents: 60000 });
const goalsList = (await getJson<{ goals: Goal[] }>("/api/goals", U)).goals;
check("meta atualizada para 60%", goalsList[0]?.savedCents === 60000, goalsList);
const metasMsg = await botCmd(U, "metas");
check("/metas mostra progresso 60%", /60%/.test(metasMsg), metasMsg);

// ── Categorias CRUD ───────────────────────────────────────────────────────────
type Category = { id: number; name: string; keywords: string; isSystem?: boolean };
const cat = ((await (await post("/api/categories", U, { name: "pets", keywords: ["petshop", "ração"] })).json()) as { category: Category }).category;
check("cria categoria custom", cat?.name === "pets");
await patch(`/api/categories/${cat.id}`, U, { keywords: ["petshop", "ração", "veterinário"] });
const cats = (await getJson<{ categories: Category[] }>("/api/categories", U)).categories;
const petsNow = cats.find((c) => c.id === cat.id);
check("keywords editadas", petsNow?.keywords.includes("veterinário") ?? false, petsNow);
check("delete categoria custom ok", (await del(`/api/categories/${cat.id}`, U)).status === 200);
const outros = cats.find((c) => c.name === "outros");
check("delete categoria de sistema → 409", (await del(`/api/categories/${outros!.id}`, U)).status === 409);

// ── Tags no bot ───────────────────────────────────────────────────────────────
await botText(U, "uber 20 #trabalho #viagem");
const tagged = (await getJson<{ transactions: Array<{ description: string; tags: string }> }>("/api/transactions?tag=trabalho", U)).transactions;
check("tag filtra a transação", tagged.length === 1 && tagged[0]!.description === "uber", tagged);
check("tags salvas na transação", tagged[0]!.tags.includes("trabalho") && tagged[0]!.tags.includes("viagem"), tagged[0]?.tags);

// ── /mes ──────────────────────────────────────────────────────────────────────
const mesMsg = await botCmd(U, "mes", month);
check("/mes <mês> retorna resumo", /Resumo de/.test(mesMsg), mesMsg);

// ── Export CSV ────────────────────────────────────────────────────────────────
const csvRes = await fetch(`${BASE}/api/transactions/export`, { headers: headers(U) });
const csv = await csvRes.text();
check("CSV tem content-type csv", (csvRes.headers.get("content-type") ?? "").includes("csv"), csvRes.headers.get("content-type"));
check("CSV tem cabeçalho e a linha do uber", csv.includes("Data;Tipo;Valor") && csv.includes("uber"), csv.slice(0, 120));

// ── Recorrências (materializadas pelo cron) ───────────────────────────────────
await post("/api/recurrences", U, { description: "assinatura recorrente", type: "saida", amountCents: 5000, dayOfMonth: todayDay });
// dispara o cron 2x; deve materializar 1 transação só (dedup por lastRunMonth)
await fetch(`${BASE}/__scheduled?cron=0+11+*+*+*`);
await fetch(`${BASE}/__scheduled?cron=0+11+*+*+*`);
const recTx = (await getJson<{ transactions: Array<{ description: string }> }>("/api/transactions?type=saida", U)).transactions.filter((t) => t.description === "assinatura recorrente");
check("recorrência materializada pelo cron (1x)", recTx.length === 1, recTx.map((t) => t.description));

console.log(failures === 0 ? "\nTODOS OS CHECKS PASSARAM ✅" : `\n${failures} CHECK(S) FALHARAM ❌`);
process.exit(failures === 0 ? 0 : 1);
