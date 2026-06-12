import type { CreateCategory, PatchCategory } from "@finbot/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { categories, type Category } from "../db/schema";
import { HttpError } from "./errors";

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

export async function createCategory(
  database: Db,
  userId: number,
  input: CreateCategory,
): Promise<Category> {
  const inserted = await database
    .insert(categories)
    .values({
      userId,
      name: input.name,
      kind: input.kind ?? "saida",
      color: input.color ?? null,
      keywords: JSON.stringify(input.keywords ?? []),
    })
    .returning();
  const cat = inserted[0];
  if (!cat) throw new HttpError(500, "insert_failed", "falha ao criar categoria");
  return cat;
}

export async function updateCategory(
  database: Db,
  userId: number,
  id: number,
  patch: PatchCategory,
): Promise<Category | null> {
  const existing = await getUserCategory(database, userId, id);
  if (!existing) return null;
  const values: Partial<typeof categories.$inferInsert> = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.kind !== undefined) values.kind = patch.kind;
  if (patch.color !== undefined) values.color = patch.color;
  if (patch.keywords !== undefined) values.keywords = JSON.stringify(patch.keywords);
  await database
    .update(categories)
    .set(values)
    .where(and(eq(categories.userId, userId), eq(categories.id, id)));
  return getUserCategory(database, userId, id);
}

// Remove categoria. As de sistema ("outros"/"renda") são indeletáveis (seção 6.1).
export async function deleteCategory(
  database: Db,
  userId: number,
  id: number,
): Promise<boolean> {
  const existing = await getUserCategory(database, userId, id);
  if (!existing) return false;
  if (existing.isSystem) {
    throw new HttpError(409, "system_category", "categoria indeletável");
  }
  await database
    .delete(categories)
    .where(and(eq(categories.userId, userId), eq(categories.id, id)));
  return true;
}
