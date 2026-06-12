import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { categories, users, type User } from "../db/schema";
import { DEFAULT_CATEGORIES } from "./seed";

export async function getUserByTelegramId(
  database: Db,
  telegramId: number,
): Promise<User | null> {
  const row = await database.query.users.findFirst({
    where: eq(users.telegramId, telegramId),
  });
  return row ?? null;
}

export async function getUserById(
  database: Db,
  id: number,
): Promise<User | null> {
  const row = await database.query.users.findFirst({
    where: eq(users.id, id),
  });
  return row ?? null;
}

export async function listUsers(database: Db): Promise<User[]> {
  return database.query.users.findMany({ orderBy: users.id });
}

// Cria o usuário e roda o seed de categorias (seção 6.0). Reutilizado pelo fluxo de
// convite do bot (Fase 2). Se o usuário do telegramId já existir, retorna-o sem duplicar.
export async function createUserWithSeed(
  database: Db,
  params: { telegramId: number; name: string; isAdmin?: boolean },
): Promise<User> {
  const existing = await getUserByTelegramId(database, params.telegramId);
  if (existing) return existing;

  const inserted = await database
    .insert(users)
    .values({
      telegramId: params.telegramId,
      name: params.name,
      isAdmin: params.isAdmin ?? false,
    })
    .returning();
  const user = inserted[0];
  if (!user) throw new Error("falha ao criar usuário");

  await database.insert(categories).values(
    DEFAULT_CATEGORIES.map((c) => ({
      userId: user.id,
      name: c.name,
      kind: c.kind,
      color: c.color,
      keywords: JSON.stringify(c.keywords),
      isSystem: c.isSystem ?? false,
    })),
  );

  return user;
}
