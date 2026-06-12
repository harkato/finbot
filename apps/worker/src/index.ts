import { app } from "./app";
import type { Env } from "./env";

// Entrypoint do Worker: um único Worker contém API (Hono) e, a partir da Fase 2, o bot,
// e a partir da Fase 5, o cron de alertas (scheduled).
export default {
  fetch: app.fetch,

  async scheduled(
    _event: ScheduledController,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    // Cron de alertas — implementado na Fase 5.
  },
} satisfies ExportedHandler<Env>;
