// Aceite da Fase 6: magic link → cookie de sessão → proxy → isolamento; nenhum segredo no
// browser. Requer: worker em :8787 (D1 limpo) e nuxt dev em :3000, ambos com
// SESSION_SECRET=dev-session-secret e API_BASE_URL=http://127.0.0.1:8787.

import { MAGIC_TTL_SECONDS, signToken } from "@finbot/shared";

const WORKER = "http://127.0.0.1:8787";
const WEB = "http://127.0.0.1:3000";
const SECRET = "dev-session-secret";
const APITOKEN = "dev-api-token";

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) {
    failures++;
    if (detail !== undefined) console.log("   detalhe:", JSON.stringify(detail));
  }
}

async function createUser(telegramId: number, name: string): Promise<number> {
  const r = await fetch(`${WORKER}/api/internal/users`, {
    method: "POST",
    headers: { Authorization: `Bearer ${APITOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ telegramId, name }),
  });
  return ((await r.json()) as { user: { id: number } }).user.id;
}

// Troca o magic token por cookie de sessão (segue o redirect do /auth manualmente).
async function login(uid: number): Promise<string> {
  const magic = await signToken(SECRET, { uid, typ: "magic" }, MAGIC_TTL_SECONDS);
  const r = await fetch(`${WEB}/auth?token=${magic}`, { redirect: "manual" });
  const cookie = r.headers.get("set-cookie") ?? "";
  return cookie.split(";")[0] ?? ""; // finbot_session=...
}

const webFetch = (path: string, cookie: string, init: RequestInit = {}) =>
  fetch(`${WEB}${path}`, { ...init, headers: { ...(init.headers ?? {}), Cookie: cookie } });

// ── Usuários ──────────────────────────────────────────────────────────────────
const aId = await createUser(11001, "Aline");
const bId = await createUser(11002, "Bruno");

// ── Magic link → sessão ───────────────────────────────────────────────────────
const aCookie = await login(aId);
check("magic link gera cookie de sessão", aCookie.startsWith("finbot_session="), aCookie.slice(0, 30));

const me = (await (await webFetch("/api/me", aCookie)).json()) as { user: { id: number } };
check("/api/me retorna o usuário certo via cookie", me.user.id === aId, me);

// ── Sem cookie → 401 no proxy ─────────────────────────────────────────────────
check("proxy sem cookie → 401", (await fetch(`${WEB}/api/me`)).status === 401);

// ── Magic link inválido → redirect /login ─────────────────────────────────────
const bad = await fetch(`${WEB}/auth?token=xxx.yyy`, { redirect: "manual" });
const loc = bad.headers.get("location") ?? "";
check("magic link inválido → /login", loc.includes("/login"), loc);

// ── Lançamento via proxy + isolamento ─────────────────────────────────────────
await webFetch("/api/transactions", aCookie, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ type: "saida", amountCents: 4200, description: "padaria dashboard", source: "web" }),
});
const aList = (await (await webFetch("/api/transactions", aCookie)).json()) as { transactions: { description: string }[] };
check("A vê sua transação criada pelo dashboard", aList.transactions.some((t) => t.description === "padaria dashboard"), aList.transactions.map((t) => t.description));

const bCookie = await login(bId);
const bList = (await (await webFetch("/api/transactions", bCookie)).json()) as { transactions: unknown[] };
check("B (outro usuário) NÃO vê dados do A", bList.transactions.length === 0, bList);

// ── SSR da página protegida ───────────────────────────────────────────────────
const homeAuthed = await webFetch("/", aCookie);
const homeHtml = await homeAuthed.text();
check("home renderiza (SSR) com sessão", homeAuthed.status === 200 && homeHtml.includes("Visão geral"), homeAuthed.status);

const homeAnon = await fetch(`${WEB}/`, { redirect: "manual" });
check("home sem sessão redireciona p/ /login", [301, 302].includes(homeAnon.status) || (homeAnon.headers.get("location") ?? "").includes("/login"), homeAnon.status);

console.log(failures === 0 ? "\nTODOS OS CHECKS PASSARAM ✅" : `\n${failures} CHECK(S) FALHARAM ❌`);
process.exit(failures === 0 ? 0 : 1);
