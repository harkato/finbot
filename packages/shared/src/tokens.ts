// Tokens assinados HMAC-SHA256 (Web Crypto — funciona no Workers e no Nitro/Node 20+).
// Usados no magic link do bot e no cookie de sessão do dashboard. Tudo assinado com o
// mesmo SESSION_SECRET, compartilhado entre o Worker e o proxy do Nuxt.

export type TokenType = "magic" | "session";

export type TokenPayload = {
  uid: number; // userId
  typ: TokenType;
  exp: number; // epoch seconds
};

const enc = new TextEncoder();

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function strToB64url(s: string): string {
  return bytesToB64url(enc.encode(s));
}

function b64urlToStr(b64: string): string {
  const pad = b64.replace(/-/g, "+").replace(/_/g, "/");
  return atob(pad);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(secret: string, data: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return bytesToB64url(new Uint8Array(sig));
}

// Cria um token "<payload>.<assinatura>". ttlSeconds define a validade.
export async function signToken(
  secret: string,
  data: { uid: number; typ: TokenType },
  ttlSeconds: number,
  nowMs: number = Date.now(),
): Promise<string> {
  const payload: TokenPayload = {
    uid: data.uid,
    typ: data.typ,
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
  };
  const body = strToB64url(JSON.stringify(payload));
  const sig = await sign(secret, body);
  return `${body}.${sig}`;
}

// Verifica assinatura, expiração e (opcional) o tipo. Retorna o payload ou null.
export async function verifyToken(
  secret: string,
  token: string,
  expectedTyp?: TokenType,
  nowMs: number = Date.now(),
): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];

  const expectedSig = await sign(secret, body);
  // comparação de tempo ~constante
  if (sig.length !== expectedSig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  if (diff !== 0) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(b64urlToStr(body)) as TokenPayload;
  } catch {
    return null;
  }
  if (typeof payload.uid !== "number" || typeof payload.exp !== "number") return null;
  if (payload.exp < Math.floor(nowMs / 1000)) return null;
  if (expectedTyp && payload.typ !== expectedTyp) return null;
  return payload;
}

export const MAGIC_TTL_SECONDS = 10 * 60; // 10 min
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 dias
