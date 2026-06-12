import type { CategoryKind } from "@finbot/shared";

export type SeedCategory = {
  name: string;
  kind: CategoryKind;
  color: string;
  keywords: string[];
  isSystem?: boolean;
};

// Categorias padrão criadas no seed por usuário (seção 6.0/6.1). As keywords alimentam a
// categorização automática; editá-las pelo dashboard melhora o bot sem deploy.
// "outros" e "renda" são fallback e indeletáveis (isSystem).
export const DEFAULT_CATEGORIES: readonly SeedCategory[] = [
  {
    name: "alimentação",
    kind: "saida",
    color: "#ef4444",
    keywords: [
      "mercado", "supermercado", "ifood", "restaurante", "almoço", "almoco",
      "janta", "jantar", "lanche", "padaria", "comida", "feira", "açougue",
      "hortifruti", "rappi",
    ],
  },
  {
    name: "transporte",
    kind: "saida",
    color: "#f97316",
    keywords: [
      "uber", "99", "gasolina", "combustível", "combustivel", "alcool", "etanol",
      "ônibus", "onibus", "metrô", "metro", "passagem", "estacionamento",
      "pedágio", "pedagio", "bilhete",
    ],
  },
  {
    name: "moradia",
    kind: "saida",
    color: "#22c55e",
    keywords: [
      "aluguel", "condomínio", "condominio", "luz", "energia", "água", "agua",
      "gás", "gas", "internet", "iptu", "faxina", "diarista",
    ],
  },
  {
    name: "saúde",
    kind: "saida",
    color: "#06b6d4",
    keywords: [
      "farmácia", "farmacia", "remédio", "remedio", "médico", "medico",
      "consulta", "exame", "dentista", "psicólogo", "psicologo", "academia",
    ],
  },
  {
    name: "lazer",
    kind: "saida",
    color: "#a855f7",
    keywords: [
      "cinema", "netflix", "spotify", "show", "bar", "cerveja", "viagem",
      "jogo", "steam", "ingresso", "festa",
    ],
  },
  {
    name: "educação",
    kind: "saida",
    color: "#3b82f6",
    keywords: ["curso", "livro", "faculdade", "escola", "mensalidade", "udemy"],
  },
  {
    name: "compras",
    kind: "saida",
    color: "#ec4899",
    keywords: [
      "roupa", "calçado", "calcado", "amazon", "mercado livre", "shopping",
      "presente", "shopee", "aliexpress",
    ],
  },
  {
    name: "assinaturas",
    kind: "saida",
    color: "#8b5cf6",
    keywords: ["assinatura", "plano", "icloud", "youtube premium", "chatgpt"],
  },
  {
    // usada pelo pagamento de fatura (seção 6.2, Fase 4).
    name: "fatura cartão",
    kind: "saida",
    color: "#64748b",
    keywords: ["fatura", "fatura cartão", "fatura cartao"],
  },
  {
    name: "salário",
    kind: "entrada",
    color: "#16a34a",
    keywords: ["salário", "salario", "pagamento", "holerite", "adiantamento"],
  },
  {
    name: "outros",
    kind: "saida",
    color: "#94a3b8",
    keywords: [],
    isSystem: true,
  },
  {
    name: "renda",
    kind: "entrada",
    color: "#15803d",
    keywords: ["freela", "freelance", "renda", "extra", "rendimento", "pix recebido"],
    isSystem: true,
  },
];
