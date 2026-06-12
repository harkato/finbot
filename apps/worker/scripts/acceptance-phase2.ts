// Aceite da Fase 2: cadastro por convite e isolamento, dirigindo o webhook com updates
// simulados do Telegram (MOCK_TELEGRAM=1 → o bot devolve no corpo as mensagens enviadas).
// Requer wrangler dev rodando com D1 local LIMPO e ADMIN_TELEGRAM_ID=5001.
// Uso: BASE=http://127.0.0.1:8787 TOKEN=dev-api-token bun scripts/acceptance-phase2.ts

const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const TOKEN = process.env.TOKEN ?? "dev-api-token";
const ADMIN = 5001;
const FRIEND = 5002;

let failures = 0;
let updateId = 1000;
let messageId = 1;

function check(label: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) {
    failures++;
    if (detail !== undefined) console.log("   detalhe:", JSON.stringify(detail));
  }
}

type WebhookResult = { ok: boolean; sent: { text: string }[] };

async function sendUpdate(update: unknown): Promise<WebhookResult> {
  const res = await fetch(`${BASE}/webhook/telegram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  return (await res.json()) as WebhookResult;
}

function baseMessage(tgId: number, name: string, text: string) {
  return {
    message_id: messageId++,
    from: { id: tgId, is_bot: false, first_name: name },
    chat: { id: tgId, type: "private", first_name: name },
    date: 0,
    text,
  };
}

async function command(tgId: number, name: string, cmd: string, arg = ""): Promise<string> {
  const text = arg ? `/${cmd} ${arg}` : `/${cmd}`;
  const message = {
    ...baseMessage(tgId, name, text),
    entities: [{ type: "bot_command", offset: 0, length: cmd.length + 1 }],
  };
  const r = await sendUpdate({ update_id: updateId++, message });
  return r.sent.map((s) => s.text).join("\n---\n");
}

async function text(tgId: number, name: string, body: string): Promise<string> {
  const r = await sendUpdate({ update_id: updateId++, message: baseMessage(tgId, name, body) });
  return r.sent.map((s) => s.text).join("\n---\n");
}

async function apiGet(path: string, tgId: number) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, "X-Telegram-Id": String(tgId) },
  });
  return res;
}

// 1) Admin se cadastra (bootstrap por ADMIN_TELEGRAM_ID).
const adminStart = await command(ADMIN, "Alice", "start");
check("admin /start → bootstrap admin", /admin/i.test(adminStart) && /cadastrad/i.test(adminStart), adminStart);

// 2) Admin gera convite.
const conviteMsg = await command(ADMIN, "Alice", "convite");
const codeMatch = conviteMsg.match(/Código:\s*([A-Z0-9]+)/);
check("admin /convite → gera código", codeMatch !== null, conviteMsg);
const code = codeMatch?.[1] ?? "";

// 3) Amigo NÃO cadastrado é ignorado (antes do convite).
const friendBefore = await text(FRIEND, "Bob", "mercado 50");
check("amigo sem cadastro é ignorado (sem resposta)", friendBefore === "", friendBefore);

// 4) Amigo entra pelo convite.
const friendStart = await command(FRIEND, "Bob", "start", code);
check("amigo /start <code> → cadastrado", /bem-vindo/i.test(friendStart), friendStart);

// 5) Amigo lança gastos.
const ifood = await text(FRIEND, "Bob", "almoço no ifood 32,50");
check("amigo: saída ifood registrada", /Saída registrada/.test(ifood) && /R\$\s?32,50/.test(ifood), ifood);
check("amigo: categorizado como alimentação", /aliment/i.test(ifood), ifood);

const freela = await text(FRIEND, "Bob", "+5000 freelance");
check("amigo: entrada freelance (categoria renda)", /Entrada registrada/.test(freela) && /renda/i.test(freela), freela);

// 6) Admin lança uma entrada.
const salario = await text(ADMIN, "Alice", "salário 8000");
check("admin: salário vira entrada", /Entrada registrada/.test(salario), salario);

// 7) /resumo do amigo.
const resumo = await command(FRIEND, "Bob", "resumo");
check("amigo /resumo: entradas 5000 e saídas 32,50", /R\$\s?5\.000,00/.test(resumo) && /R\$\s?32,50/.test(resumo), resumo);

// 8) Isolamento via API.
const friendList = (await (await apiGet("/api/transactions", FRIEND)).json()) as {
  transactions: Array<{ description: string }>;
};
const adminList = (await (await apiGet("/api/transactions", ADMIN)).json()) as {
  transactions: Array<{ description: string }>;
};
check("amigo vê 2 transações", friendList.transactions.length === 2, friendList.transactions.map((t) => t.description));
check("admin vê 1 transação", adminList.transactions.length === 1, adminList.transactions.map((t) => t.description));
check(
  "admin NÃO vê transações do amigo",
  !adminList.transactions.some((t) => t.description.includes("ifood") || t.description.includes("freelance")),
);

// 9) /desfazer remove a última do amigo (a entrada freelance).
const desfazer = await command(FRIEND, "Bob", "desfazer");
check("amigo /desfazer remove a última", /Desfeito/.test(desfazer) && /freelance/i.test(desfazer), desfazer);
const friendAfter = (await (await apiGet("/api/transactions", FRIEND)).json()) as {
  transactions: unknown[];
};
check("amigo fica com 1 transação após desfazer", friendAfter.transactions.length === 1, friendAfter);

// 10) Update de telegramId sem usuário é ignorado.
const ghost = await text(9999, "Ghost", "mercado 999");
check("telegramId desconhecido é ignorado", ghost === "", ghost);

console.log(failures === 0 ? "\nTODOS OS CHECKS PASSARAM ✅" : `\n${failures} CHECK(S) FALHARAM ❌`);
process.exit(failures === 0 ? 0 : 1);
