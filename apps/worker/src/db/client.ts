import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// Cria o client Drizzle a partir do binding D1. `env` só existe dentro do handler,
// então o client é criado por request (barato — não abre conexão).
export function db(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof db>;
