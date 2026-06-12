// Aceite da Fase 3: saldo derivado = initialBalanceCents + Σ entradas pagas − Σ saídas
// pagas; conta padrão (Carteira) para lançamentos sem indicação; isolamento.
// Uso: BASE=http://127.0.0.1:8787 TOKEN=dev-api-token bun scripts/acceptance-phase3.ts
// Requer D1 local LIMPO + wrangler dev.

const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const TOKEN = process.env.TOKEN ?? "dev-api-token";
const A = 6001;
const B = 6002;

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) {
    failures++;
    if (detail !== undefined) console.log("   detalhe:", JSON.stringify(detail));
  }
}

function headers(tgId?: number): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  };
  if (tgId !== undefined) h["X-Telegram-Id"] = String(tgId);
  return h;
}

async function createUser(telegramId: number, name: string) {
  return fetch(`${BASE}/api/internal/users`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ telegramId, name }),
  });
}
async function post(path: string, tgId: number, body: unknown) {
  return fetch(`${BASE}${path}`, { method: "POST", headers: headers(tgId), body: JSON.stringify(body) });
}
async function getJson<T>(path: string, tgId: number): Promise<T> {
  return (await (await fetch(`${BASE}${path}`, { headers: headers(tgId) })).json()) as T;
}

type Account = { id: number; name: string; type: string; balanceCents: number };

await createUser(A, "Ana");
await createUser(B, "Beto");

// 1) Seed criou a Carteira (saldo 0).
let accs = (await getJson<{ accounts: Account[] }>("/api/accounts", A)).accounts;
const carteira = accs.find((a) => a.type === "carteira");
check("seed criou conta Carteira", carteira !== undefined, accs);
check("Carteira começa com saldo 0", carteira?.balanceCents === 0, carteira);

// 2) Cria uma conta "Banco" com saldo inicial R$ 1.000,00.
const bancoRes = await post("/api/accounts", A, {
  name: "Banco",
  type: "corrente",
  initialBalanceCents: 100000,
});
const banco = ((await bancoRes.json()) as { account: Account }).account;
check("cria conta Banco (201)", bancoRes.status === 201);

// 3) Lançamentos.
await post("/api/transactions", A, { type: "entrada", amountCents: 500000, description: "salário", accountId: banco.id, source: "web" });
await post("/api/transactions", A, { type: "saida", amountCents: 5000, description: "conta de luz", accountId: banco.id, source: "web" });
// sem accountId → cai na Carteira (conta padrão)
const semConta = await post("/api/transactions", A, { type: "saida", amountCents: 3000, description: "pão", source: "telegram" });
const semContaTx = ((await semConta.json()) as { transaction: { accountId: number } }).transaction;
check("lançamento sem conta vai para a Carteira", semContaTx.accountId === carteira?.id, semContaTx);
// pendente (não pago) NÃO afeta saldo
await post("/api/transactions", A, { type: "saida", amountCents: 99999, description: "fatura futura", accountId: banco.id, paid: false, source: "web" });

// 4) Saldos derivados.
accs = (await getJson<{ accounts: Account[] }>("/api/accounts", A)).accounts;
const bancoNow = accs.find((a) => a.id === banco.id);
const carteiraNow = accs.find((a) => a.id === carteira?.id);
check("Banco = R$ 1.000 + R$ 5.000 − R$ 50 = R$ 5.950,00", bancoNow?.balanceCents === 100000 + 500000 - 5000, bancoNow);
check("pendente não entrou no saldo do Banco", bancoNow?.balanceCents === 595000, bancoNow);
check("Carteira = −R$ 30,00", carteiraNow?.balanceCents === -3000, carteiraNow);

// 5) Isolamento: B não vê contas do A.
const bAccs = (await getJson<{ accounts: Account[] }>("/api/accounts", B)).accounts;
check("B só vê a própria Carteira", bAccs.length === 1 && bAccs[0]?.type === "carteira", bAccs);
check("B não vê a conta Banco do A", !bAccs.some((a) => a.name === "Banco"));

// 6) Escopo: A não pode lançar na conta do B.
const crossAccount = bAccs[0]!.id;
const cross = await post("/api/transactions", A, { type: "saida", amountCents: 100, description: "x", accountId: crossAccount, source: "web" });
check("A lançar na conta do B → 422", cross.status === 422, await cross.clone().json());

console.log(failures === 0 ? "\nTODOS OS CHECKS PASSARAM ✅" : `\n${failures} CHECK(S) FALHARAM ❌`);
process.exit(failures === 0 ? 0 : 1);
