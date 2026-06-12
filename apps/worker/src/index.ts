import { app } from "./app";
import { buildAlertsForUser, sendTelegramMessage } from "./core/alerts";
import { todaySaoPaulo } from "./core/dates";
import { runDueRecurrences } from "./core/recurrences";
import { listUsers } from "./core/users";
import { db } from "./db/client";
import { formatBRL } from "./bot/format";
import type { Env } from "./env";

// Entrypoint do Worker: um único Worker contém API (Hono), o bot e o cron de alertas.
export default {
  fetch: app.fetch,

  // Cron de alertas (seção 9). Itera todos os usuários e envia, para cada um, pendências
  // vencendo, faturas fechando e orçamentos estourados hoje. Silêncio se não há nada.
  async scheduled(
    _event: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const database = db(env.DB);
    const today = todaySaoPaulo();
    const users = await listUsers(database);
    for (const user of users) {
      // 1) materializa recorrências vencidas hoje
      const created = await runDueRecurrences(database, user.id, today);
      const lines: string[] = created.map(
        (t) => `🔁 Recorrência: ${t.description} — ${formatBRL(t.amountCents)}`,
      );

      // 2) alertas do dia
      lines.push(...(await buildAlertsForUser(database, user, today)));

      if (lines.length === 0) continue;
      await sendTelegramMessage(
        env.BOT_TOKEN,
        user.telegramId,
        `🔔 finbot — hoje\n\n${lines.join("\n")}`,
      );
    }
  },
} satisfies ExportedHandler<Env>;
