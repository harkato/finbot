import { z } from "zod";

// ── Enums de domínio ────────────────────────────────────────────────────────
export const transactionTypeSchema = z.enum(["entrada", "saida"]);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const transactionSourceSchema = z.enum(["telegram", "web"]);
export type TransactionSource = z.infer<typeof transactionSourceSchema>;

export const categoryKindSchema = z.enum(["entrada", "saida", "ambas"]);
export type CategoryKind = z.infer<typeof categoryKindSchema>;

// ── Primitivos ──────────────────────────────────────────────────────────────
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "data deve ser YYYY-MM-DD");
const isoMonth = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "mês deve ser YYYY-MM");
const positiveInt = z.number().int().positive();
const amountCents = z
  .number()
  .int("valor deve ser em centavos inteiros")
  .positive("valor deve ser positivo"); // o sinal vem de `type`

// ── POST /api/transactions ────────────────────────────────────────────────────
export const createTransactionSchema = z.object({
  type: transactionTypeSchema,
  amountCents,
  description: z.string().trim().min(1, "descrição obrigatória"),
  date: isoDate.optional(), // default = hoje (resolvido na API)
  categoryId: positiveInt.optional(), // ausente ⇒ categorização automática
  accountId: positiveInt.optional(),
  cardId: positiveInt.optional(),
  invoiceMonth: isoMonth.optional(),
  paid: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  source: transactionSourceSchema,
});
export type CreateTransaction = z.infer<typeof createTransactionSchema>;

// ── PATCH /api/transactions/:id (edição parcial) ──────────────────────────────
export const patchTransactionSchema = z
  .object({
    type: transactionTypeSchema,
    amountCents,
    description: z.string().trim().min(1),
    date: isoDate,
    categoryId: positiveInt,
    accountId: positiveInt.nullable(),
    cardId: positiveInt.nullable(),
    invoiceMonth: isoMonth.nullable(),
    paid: z.boolean(),
    tags: z.array(z.string().trim().min(1)),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "nada para atualizar",
  });
export type PatchTransaction = z.infer<typeof patchTransactionSchema>;

// ── GET /api/transactions (filtros via query string) ──────────────────────────
export const transactionQuerySchema = z.object({
  month: isoMonth.optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  accountId: z.coerce.number().int().positive().optional(),
  cardId: z.coerce.number().int().positive().optional(),
  type: transactionTypeSchema.optional(),
  tag: z.string().trim().min(1).optional(),
  paid: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  limit: z.coerce.number().int().positive().max(500).optional().default(100),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;

// ── GET /api/summary e /api/cashflow ──────────────────────────────────────────
export const summaryQuerySchema = z.object({
  month: isoMonth.optional(),
});
export const cashflowQuerySchema = z.object({
  months: z.coerce.number().int().positive().max(36).optional().default(6),
});

// ── Status de orçamento (anexado à resposta do POST; Fase 5) ───────────────────
export type BudgetStatus = {
  spentCents: number;
  limitCents: number;
  ratio: number;
} | null;
