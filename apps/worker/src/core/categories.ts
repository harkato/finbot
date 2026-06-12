import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { categories, type Category } from "../db/schema";

// Todas as categorias do usuário, em ordem de id (ordem usada pela categorização).
export async function listUserCategories(
  database: Db,
  userId: number,
): Promise<Category[]> {
  return database.query.categories.findMany({
    where: eq(categories.userId, userId),
    orderBy: categories.id,
  });
}

// Busca uma categoria do usuário pelo nome exato (ex.: "fatura cartão", "outros").
export async function getUserCategoryByName(
  database: Db,
  userId: number,
  name: string,
): Promise<Category | null> {
  const row = await database.query.categories.findFirst({
    where: and(eq(categories.userId, userId), eq(categories.name, name)),
  });
  return row ?? null;
}

// Verifica se uma categoria pertence ao usuário (escopo multi-tenant).
export async function getUserCategory(
  database: Db,
  userId: number,
  categoryId: number,
): Promise<Category | null> {
  const row = await database.query.categories.findFirst({
    where: and(eq(categories.userId, userId), eq(categories.id, categoryId)),
  });
  return row ?? null;
}
