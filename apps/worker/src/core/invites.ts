import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { invites, type Invite, type User } from "../db/schema";
import { createUserWithSeed, getUserByTelegramId } from "./users";

// Código de convite curto, legível e de uso único.
export function generateInviteCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I
  let code = "";
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

export async function createInvite(
  database: Db,
  adminUserId: number,
): Promise<Invite> {
  const code = generateInviteCode();
  const inserted = await database
    .insert(invites)
    .values({ code, createdByUserId: adminUserId })
    .returning();
  const invite = inserted[0];
  if (!invite) throw new Error("falha ao criar convite");
  return invite;
}

export async function listInvites(
  database: Db,
  adminUserId: number,
): Promise<Invite[]> {
  return database.query.invites.findMany({
    where: eq(invites.createdByUserId, adminUserId),
    orderBy: invites.createdAt,
  });
}

export type ConsumeResult =
  | { ok: true; user: User }
  | { ok: false; reason: "invalid_code" | "already_used" | "already_registered" };

// Consome um convite disponível e cria o usuário (com seed). Atômico: marca o convite
// como usado no mesmo batch da criação. Idempotente quanto a telegramId já cadastrado.
export async function consumeInvite(
  database: Db,
  code: string,
  newUser: { telegramId: number; name: string },
): Promise<ConsumeResult> {
  const existing = await getUserByTelegramId(database, newUser.telegramId);
  if (existing) return { ok: false, reason: "already_registered" };

  const invite = await database.query.invites.findFirst({
    where: eq(invites.code, code),
  });
  if (!invite) return { ok: false, reason: "invalid_code" };
  if (invite.usedByUserId !== null) return { ok: false, reason: "already_used" };

  // Cria usuário + seed e marca o convite. createUserWithSeed faz seus próprios inserts;
  // em seguida amarramos o invite ao usuário condicionando a usedByUserId ainda nulo
  // (evita corrida entre dois /start com o mesmo código).
  const user = await createUserWithSeed(database, {
    telegramId: newUser.telegramId,
    name: newUser.name,
  });

  const claimed = await database
    .update(invites)
    .set({ usedByUserId: user.id })
    .where(and(eq(invites.code, code), isNull(invites.usedByUserId)))
    .returning({ code: invites.code });

  if (claimed.length === 0) {
    // outro update venceu a corrida — o usuário já foi criado, mas o convite não é dele.
    return { ok: false, reason: "already_used" };
  }

  return { ok: true, user };
}
