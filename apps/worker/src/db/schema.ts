// Schema Drizzle (D1 / SQLite). Construído por fases — ver seção 5 e 12 do contexto.
//
// Convenções:
//   - valores monetários SEMPRE em centavos (integer)
//   - datas como text ISO "YYYY-MM-DD"; mês de referência como text "YYYY-MM"
//   - booleans como integer({ mode: "boolean" })
//   - TODA tabela de dados tem userId; TODA query é escopada pelo usuário autenticado
//
// Fase 1: users, invites, categories, transactions (multi-tenancy desde o dia 1).
// accounts/cards entram nas Fases 3/4 — por isso accountId/cardId/invoiceMonth já existem
// como colunas nuláveis aqui, mas a FK e o CHECK "exatamente um (conta|cartão)" só são
// aplicados quando aquelas tabelas existirem (rebuild da tabela na migration daquela fase).

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`;

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  telegramId: integer("telegram_id").notNull().unique(),
  name: text("name").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(nowIso),
});

export const invites = sqliteTable("invites", {
  code: text("code").primaryKey(),
  createdByUserId: integer("created_by_user_id")
    .notNull()
    .references(() => users.id),
  usedByUserId: integer("used_by_user_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(nowIso),
});

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["entrada", "saida", "ambas"] })
      .notNull()
      .default("saida"),
    color: text("color"),
    // JSON string[] — termos usados pela categorização automática (seção 6.1).
    keywords: text("keywords").notNull().default("[]"),
    // categorias "outros" e "renda" são fallback e indeletáveis (seção 6.1).
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  },
  (t) => ({
    userNameUnique: uniqueIndex("categories_user_name_unique").on(
      t.userId,
      t.name,
    ),
  }),
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type", { enum: ["entrada", "saida"] }).notNull(),
    // sempre positivo; o sinal vem de `type`.
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    // FK p/ accounts adicionada na Fase 3.
    accountId: integer("account_id"),
    // FK p/ creditCards adicionada na Fase 4.
    cardId: integer("card_id"),
    // "YYYY-MM", só quando cardId presente (Fase 4).
    invoiceMonth: text("invoice_month"),
    // "YYYY-MM-DD" — data do fato gerador.
    date: text("date").notNull(),
    // false = a pagar/receber (pendência).
    paid: integer("paid", { mode: "boolean" }).notNull().default(true),
    tags: text("tags").notNull().default("[]"),
    source: text("source", { enum: ["telegram", "web"] }).notNull(),
    createdAt: text("created_at").notNull().default(nowIso),
  },
  (t) => ({
    byUserDate: index("transactions_user_date_idx").on(t.userId, t.date),
    byUserCategory: index("transactions_user_category_idx").on(
      t.userId,
      t.categoryId,
    ),
  }),
);

// Fase 3 — contas. Saldo é SEMPRE derivado (nunca armazenado): initialBalanceCents +
// Σ entradas pagas − Σ saídas pagas da conta.
export const accounts = sqliteTable(
  "accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    type: text("type", { enum: ["carteira", "corrente", "poupanca"] })
      .notNull()
      .default("corrente"),
    initialBalanceCents: integer("initial_balance_cents").notNull().default(0),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  },
  (t) => ({
    byUser: index("accounts_user_idx").on(t.userId),
  }),
);

export type Account = typeof accounts.$inferSelect;

// Fase 4 — cartões de crédito. Gasto no cartão não afeta saldo de conta; entra na fatura
// invoiceMonth (seção 6.2). payFromAccountId = conta que paga a fatura.
export const creditCards = sqliteTable(
  "credit_cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    limitCents: integer("limit_cents").notNull(),
    closingDay: integer("closing_day").notNull(), // 1-28
    dueDay: integer("due_day").notNull(), // 1-28
    payFromAccountId: integer("pay_from_account_id"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  },
  (t) => ({
    byUser: index("credit_cards_user_idx").on(t.userId),
  }),
);

export type CreditCard = typeof creditCards.$inferSelect;

// Fase 5 — orçamentos por categoria (teto mensal recorrente).
export const budgets = sqliteTable(
  "budgets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    monthlyLimitCents: integer("monthly_limit_cents").notNull(),
  },
  (t) => ({
    userCategoryUnique: uniqueIndex("budgets_user_category_unique").on(
      t.userId,
      t.categoryId,
    ),
  }),
);

export type Budget = typeof budgets.$inferSelect;

// Fase 7 — metas de economia.
export const goals = sqliteTable(
  "goals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    targetCents: integer("target_cents").notNull(),
    savedCents: integer("saved_cents").notNull().default(0),
    deadline: text("deadline"), // "YYYY-MM-DD" opcional
  },
  (t) => ({ byUser: index("goals_user_idx").on(t.userId) }),
);

// Fase 7 — recorrências (lançamentos automáticos mensais). O cron materializa a transação
// no dia `dayOfMonth`; `lastRunMonth` evita duplicar no mesmo mês.
export const recurrences = sqliteTable(
  "recurrences",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    description: text("description").notNull(),
    type: text("type", { enum: ["entrada", "saida"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    categoryId: integer("category_id").references(() => categories.id),
    accountId: integer("account_id"),
    cardId: integer("card_id"),
    dayOfMonth: integer("day_of_month").notNull(), // 1-28
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    lastRunMonth: text("last_run_month"), // "YYYY-MM"
  },
  (t) => ({ byUser: index("recurrences_user_idx").on(t.userId) }),
);

export type Goal = typeof goals.$inferSelect;
export type Recurrence = typeof recurrences.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Invite = typeof invites.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
