import type { TransactionType } from "@finbot/shared";

// Normaliza para matching: minúsculas, sem acentos, pontuação vira espaço, espaços
// colapsados. A remoção dos diacríticos (combining marks) acontece ANTES de trocar
// pontuação por espaço, senão "alimentação" viraria "alimenta c a o".
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export type Categorizable = {
  id: number;
  name: string;
  keywords: string; // JSON string[]
};

function parseKeywords(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

// Nomes das categorias-fallback indeletáveis (seção 6.1).
export const FALLBACK_SAIDA = "outros";
export const FALLBACK_ENTRADA = "renda";

// Escolhe a categoria: primeira (na ordem dada) cujo array `keywords` contenha um termo
// presente na descrição (match por palavra). Fallback: "outros" (saída) / "renda" (entrada).
// Retorna null se nem o fallback existir (não deveria acontecer após o seed).
export function categorize(
  description: string,
  type: TransactionType,
  categories: readonly Categorizable[],
): number | null {
  const haystack = ` ${normalize(description)} `;

  for (const cat of categories) {
    for (const kw of parseKeywords(cat.keywords)) {
      const needle = normalize(kw);
      if (needle.length > 0 && haystack.includes(` ${needle} `)) {
        return cat.id;
      }
    }
  }

  const fallbackName = type === "entrada" ? FALLBACK_ENTRADA : FALLBACK_SAIDA;
  const fallback = categories.find((c) => c.name === fallbackName);
  return fallback?.id ?? null;
}
