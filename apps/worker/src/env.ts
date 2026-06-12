// Bindings do Worker (D1, vars e secrets). `env` só existe dentro do handler — nunca
// importar process.env aqui. Secrets ausentes chegam como undefined até serem definidos
// via `wrangler secret put`.

export interface Env {
  // binding
  DB: D1Database;
  // var (wrangler.toml [vars])
  ADMIN_TELEGRAM_ID: string;
  // secrets (wrangler secret put) — usados a partir da Fase 2
  BOT_TOKEN: string;
  API_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  SESSION_SECRET: string;
  // Só local: "1" intercepta as chamadas ao Telegram (testes sem token real).
  MOCK_TELEGRAM?: string;
}

import type { User } from "./db/schema";

// Variáveis de contexto preenchidas pelos middlewares de auth.
export type AppVariables = {
  user: User;
  userId: number;
};

// Tipagem padrão das rotas Hono deste Worker.
export type AppBindings = { Bindings: Env };
export type AppEnv = { Bindings: Env; Variables: AppVariables };
