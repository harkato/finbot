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
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Invite = typeof invites.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
