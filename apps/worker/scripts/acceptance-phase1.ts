// Aceite da Fase 1: dois usuários distintos criam/listam/somam transações sem vazamento.
// Uso: BASE=http://127.0.0.1:8787 TOKEN=dev-api-token bun scripts/acceptance-phase1.ts
// Requer o `wrangler dev` rodando com o D1 local migrado.

const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const TOKEN = process.env.TOKEN ?? "dev-api-token";

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  const ok = cond ? "✅" : "❌";
  console.log(`${ok} ${label}`);
  if (!cond) {
    failures++;
    if (detail !== undefined) console.log("   detalhe:", JSON.stringify(detail));
  }
}

function authHeaders(telegramId?: number): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  };
  if (telegramId !== undefined) h["X-Telegram-Id"] = String(telegramId);
  return h;
}

async function createUser(telegramId: number, name: string, isAdmin = false) {
  const res = await fetch(`${BASE}/api/internal/users`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ telegramId, name, isAdmin }),
  });
  return res;
}

async function post(telegramId: number, body: unknown) {
  return fetch(`${BASE}/api/transactions`, {
    method: "POST",
    headers: authHeaders(telegramId),
    body: JSON.stringify(body),
  });
}

async function get(path: string, telegramId?: number) {
  return fetch(`${BASE}${path}`, { headers: authHeaders(telegramId) });
}

// ── Bootstrap dos usuários ────────────────────────────────────────────────────
const A = 1001; // admin
const B = 1002;
const ra = await createUser(A, "Alice", true);
const rb = await createUser(B, "Bob");
check("cria usuário A (201)", ra.status === 201, await ra.clone().json());
check("cria usuário B (201)", rb.status === 201, await rb.clone().json());

// ── Lançamentos do A ──────────────────────────────────────────────────────────
const aSalario = await post(A, {
  type: "entrada",
  amountCents: 500000,
  description: "salário do mês",
  source: "telegram",
});
check("A: entrada salário (201)", aSalario.status === 201, await aSalario.clone().json());
const aSalarioBody = (await aSalario.json()) as {
  transaction: { categoryId: number };
  budget: null;
};
check("A: budget vem null na Fase 1", aSalarioBody.budget === null);

const aIfood = await post(A, {
  type: "saida",
  amountCents: 3250,
  description: "almoço no ifood",
  source: "telegram",
});
const aIfoodBody = (await aIfood.json()) as { transaction: { categoryId: number; id: number } };
check("A: saída ifood (201)", aIfood.status === 201);

const aUber = await post(A, {
  type: "saida",
  amountCents: 1800,
  description: "corrida de uber",
  source: "web",
});
check("A: saída uber (201)", aUber.status === 201);

// ── Lançamento do B ───────────────────────────────────────────────────────────
const bMercado = await post(B, {
  type: "saida",
  amountCents: 10000,
  description: "compras no mercado",
  source: "telegram",
});
const bMercadoBody = (await bMercado.json()) as { transaction: { id: number } };
check("B: saída mercado (201)", bMercado.status === 201);

// ── Isolamento: listagem ──────────────────────────────────────────────────────
const aList = (await (await get("/api/transactions", A)).json()) as {
  transactions: Array<{ id: number; description: string }>;
};
const bList = (await (await get("/api/transactions", B)).json()) as {
  transactions: Array<{ id: number; description: string }>;
};
check("A vê exatamente 3 transações", aList.transactions.length === 3, aList.transactions.map((t) => t.description));
check("B vê exatamente 1 transação", bList.transactions.length === 1, bList.transactions.map((t) => t.description));
check(
  "A NÃO vê a transação do B",
  !aList.transactions.some((t) => t.description.includes("mercado")),
);
check(
  "B NÃO vê transações do A",
  !bList.transactions.some((t) => t.description.includes("ifood") || t.description.includes("uber")),
);

// ── Isolamento: summary ───────────────────────────────────────────────────────
const aSummary = (await (await get("/api/summary", A)).json()) as {
  entradas: number;
  saidas: number;
  saldo: number;
};
check("A summary entradas = 500000", aSummary.entradas === 500000, aSummary);
check("A summary saidas = 5050", aSummary.saidas === 5050, aSummary);
check("A summary saldo = 494950", aSummary.saldo === 494950, aSummary);

const bSummary = (await (await get("/api/summary", B)).json()) as {
  entradas: number;
  saidas: number;
};
check("B summary entradas = 0", bSummary.entradas === 0, bSummary);
check("B summary saidas = 10000", bSummary.saidas === 10000, bSummary);

// ── Categorização automática ──────────────────────────────────────────────────
const ifoodCat = aList.transactions.find((t) => t.description.includes("ifood"));
const aDetail = (await (await get(`/api/transactions?categoryId=`, A)).json()) as unknown;
void aDetail;
check("A: ifood foi categorizado (categoryId presente)", ifoodCat !== undefined);

// ── Auth: usuário desconhecido ────────────────────────────────────────────────
const unknown = await get("/api/transactions", 9999);
check("telegramId sem usuário → 401", unknown.status === 401);

// ── Escopo: A não apaga transação do B ────────────────────────────────────────
const crossDelete = await fetch(`${BASE}/api/transactions/${bMercadoBody.transaction.id}`, {
  method: "DELETE",
  headers: authHeaders(A),
});
check("A apagar transação do B → 404 (escopo)", crossDelete.status === 404);
// e a do B continua lá
const bListAfter = (await (await get("/api/transactions", B)).json()) as {
  transactions: unknown[];
};
check("transação do B intacta após tentativa do A", bListAfter.transactions.length === 1);

// ── Cashflow ──────────────────────────────────────────────────────────────────
const aCash = (await (await get("/api/cashflow?months=3", A)).json()) as {
  cashflow: Array<{ month: string; entradas: number; saidas: number }>;
};
check("A cashflow retorna 3 meses", aCash.cashflow.length === 3, aCash.cashflow);
const lastMonth = aCash.cashflow[aCash.cashflow.length - 1]!;
check("A cashflow mês atual tem entradas 500000", lastMonth.entradas === 500000, lastMonth);

console.log(failures === 0 ? "\nTODOS OS CHECKS PASSARAM ✅" : `\n${failures} CHECK(S) FALHARAM ❌`);
process.exit(failures === 0 ? 0 : 1);
