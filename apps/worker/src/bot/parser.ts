import type { TransactionType } from "@finbot/shared";
import { normalize } from "../core/categorize";

// Palavras que marcam uma ENTRADA (além do prefixo "+"). O prefixo "-" força saída.
const ENTRADA_KEYWORDS = [
  "recebi", "recebido", "recebimento", "salario", "ganhei", "entrada",
  "deposito", "rendimento", "freela", "freelance", "reembolso", "vale",
  "pix recebido", "caiu", "pagamento recebido",
];

export type ParsedEntry = {
  type: TransactionType;
  amountCents: number;
  description: string;
  tags: string[];
};

// Extrai #tags do texto (ex.: "uber 20 #trabalho #viagem").
function extractTags(text: string): string[] {
  const matches = text.match(/#([\p{L}\p{N}_-]+)/gu);
  if (!matches) return [];
  return [...new Set(matches.map((t) => t.slice(1).toLowerCase()))];
}

// Converte um token "dinheiro" BR em centavos. Regras:
//   - vírgula presente ⇒ separador decimal; pontos são milhar ("1.234,56" → 123456)
//   - sem vírgula, com ponto ⇒ ponto é decimal só se a última parte não tiver 3 dígitos
//     ("12.50" → 1250; "1.234" → 123400; "100.000" → 10000000)
//   - inteiro puro ⇒ reais ("50" → 5000)
// Retorna null se o token não for um número válido > 0.
export function parseMoneyToken(token: string): number | null {
  const t = token.replace(/[^\d.,]/g, "");
  if (!/\d/.test(t)) return null;

  let reais: number;
  if (t.includes(",")) {
    const normalized = t.replace(/\./g, "").replace(",", ".");
    reais = Number.parseFloat(normalized);
  } else if (t.includes(".")) {
    const lastDot = t.lastIndexOf(".");
    const after = t.slice(lastDot + 1);
    if (after.length === 3) {
      // todos os pontos são milhar
      reais = Number.parseFloat(t.replace(/\./g, ""));
    } else {
      // último ponto é decimal; pontos anteriores são milhar
      const intPart = t.slice(0, lastDot).replace(/\./g, "");
      reais = Number.parseFloat(`${intPart}.${after}`);
    }
  } else {
    reais = Number.parseInt(t, 10);
  }

  if (!Number.isFinite(reais) || reais <= 0) return null;
  return Math.round(reais * 100);
}

// Encontra todos os tokens que parecem dinheiro no texto.
function findMoneyTokens(text: string): string[] {
  const matches = text.match(/\d[\d.,]*/g);
  return matches ?? [];
}

// Parseia uma mensagem livre em { type, amountCents, description }. Retorna null se não
// houver valor reconhecível (o bot então responde que não entendeu).
export function parseEntry(text: string): ParsedEntry | null {
  const raw = text.trim();
  if (raw.length === 0) return null;

  let type: TransactionType = "saida";
  let body = raw;
  let explicitSign = false;
  if (body.startsWith("+")) {
    type = "entrada";
    body = body.slice(1).trim();
    explicitSign = true;
  } else if (body.startsWith("-")) {
    type = "saida";
    body = body.slice(1).trim();
    explicitSign = true;
  }

  // Escolhe o valor: prioriza um token com vírgula (decimal explícito); senão o primeiro.
  const tokens = findMoneyTokens(body);
  if (tokens.length === 0) return null;
  const chosen =
    tokens.find((t) => t.includes(",")) ?? tokens.find((t) => parseMoneyToken(t) !== null);
  if (!chosen) return null;
  const amountCents = parseMoneyToken(chosen);
  if (amountCents === null) return null;

  const tags = extractTags(raw);

  // Descrição = corpo sem o token do valor e sem as #tags, colapsado.
  const description = body
    .replace(chosen, " ")
    .replace(/#([\p{L}\p{N}_-]+)/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Detecção de entrada por keyword (só quando não houve sinal explícito + / -).
  if (!explicitSign) {
    const norm = ` ${normalize(raw)} `;
    if (ENTRADA_KEYWORDS.some((kw) => norm.includes(` ${normalize(kw)} `))) {
      type = "entrada";
    }
  }

  return {
    type,
    amountCents,
    description: description.length > 0 ? description : raw,
    tags,
  };
}

export type CardLike = { id: number; name: string };

// Detecta o cartão no lançamento pela sintaxe "... no <cartão>" / nome do cartão
// (match fuzzy simples por nome normalizado). Retorna o cardId e a descrição limpa.
export function matchCard(
  description: string,
  cards: readonly CardLike[],
): { cardId: number; description: string } | null {
  const hay = ` ${normalize(description)} `;
  let best: { card: CardLike; needle: string } | null = null;
  for (const card of cards) {
    const needle = normalize(card.name);
    if (needle.length === 0) continue;
    if (hay.includes(` ${needle} `) && (!best || needle.length > best.needle.length)) {
      best = { card, needle };
    }
  }
  if (!best) return null;

  const cleaned = ` ${normalize(description)} `
    .replace(` no ${best.needle} `, " ")
    .replace(` na ${best.needle} `, " ")
    .replace(` ${best.needle} `, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    cardId: best.card.id,
    description: cleaned.length > 0 ? cleaned : description,
  };
}
