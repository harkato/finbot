import { Bot, type Context, type Transformer, webhookCallback } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import type { Context as HonoContext } from "hono";
import { listUserAccounts } from "../core/accounts";
import {
  computeInvoiceMonth,
  getInvoice,
  listUserCards,
} from "../core/cards";
import { getUserCategory } from "../core/categories";
import { currentMonth, todaySaoPaulo } from "../core/dates";
import { createInvite, consumeInvite } from "../core/invites";
import { getCashflow, getSummary } from "../core/reports";
import {
  createTransaction,
  deleteTransaction,
  lastTransactionBySource,
  listTransactions,
} from "../core/transactions";
import { createUserWithSeed, getUserByTelegramId, listUsers } from "../core/users";
import { db } from "../db/client";
import type { AppEnv, Env } from "../env";
import { formatBRL, formatDayMonth, formatMonth } from "./format";
import { matchCard, parseEntry } from "./parser";

// botInfo é estável; cacheado em escopo de módulo para evitar um getMe por update
// (gotcha do Workers — seção 8). STUB é usado no modo mock (testes locais sem token).
let cachedBotInfo: UserFromGetMe | undefined;

const STUB_BOT_INFO: UserFromGetMe = {
  id: 7654321,
  is_bot: true,
  first_name: "finbot",
  username: "finbot_local_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  can_manage_bots: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
};

function registerHandlers(bot: Bot, env: Env): void {
  const database = db(env.DB);

  // resolve o usuário do update; null = não cadastrado.
  const userOf = (ctx: Context) =>
    ctx.from ? getUserByTelegramId(database, ctx.from.id) : Promise.resolve(null);

  // /id — funciona para qualquer um (útil p/ descobrir o ADMIN_TELEGRAM_ID).
  bot.command("id", async (ctx) => {
    await ctx.reply(`Seu Telegram ID é ${ctx.from?.id ?? "?"}`);
  });

  // /start [convite] — cadastro por convite (seção 6.0).
  bot.command("start", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const code = ctx.match.trim();

    const existing = await getUserByTelegramId(database, from.id);
    if (existing) {
      await ctx.reply(`Você já está cadastrado, ${existing.name}! Manda seus gastos que eu registro 😉`);
      return;
    }

    if (code) {
      const r = await consumeInvite(database, code, {
        telegramId: from.id,
        name: from.first_name ?? "amigo",
      });
      if (r.ok) {
        await ctx.reply(
          `Bem-vindo(a), ${r.user.name}! 🎉 Cadastro concluído.\n\n` +
            `Me mande seus gastos em linguagem natural, ex.:\n` +
            `• "mercado 80"\n• "almoço no ifood 32,50"\n• "+5000 salário"\n\n` +
            `Comandos: /resumo /fluxo /extrato /desfazer`,
        );
        return;
      }
      if (r.reason === "already_used") {
        await ctx.reply("Esse convite já foi usado. Peça um novo ao admin. 🙏");
        return;
      }
      // invalid_code cai no fluxo genérico abaixo
    }

    if (String(from.id) === env.ADMIN_TELEGRAM_ID) {
      const admin = await createUserWithSeed(database, {
        telegramId: from.id,
        name: from.first_name ?? "admin",
        isAdmin: true,
      });
      await ctx.reply(`Admin ${admin.name} cadastrado! ✅ Use /convite para liberar acesso aos amigos.`);
      return;
    }

    await ctx.reply("Olá! Este bot é fechado e o acesso é por convite. Peça um link a quem te indicou. 🙂");
  });

  // /convite — admin gera código + deep link (seção 6.0).
  bot.command("convite", async (ctx) => {
    const user = await userOf(ctx);
    if (!user || !user.isAdmin) return; // ignora não-admin
    const invite = await createInvite(database, user.id);
    const link = `https://t.me/${ctx.me.username}?start=${invite.code}`;
    await ctx.reply(`Convite criado! 🎟️\nCódigo: ${invite.code}\nLink: ${link}`);
  });

  // /usuarios — admin lista quem está cadastrado.
  bot.command("usuarios", async (ctx) => {
    const user = await userOf(ctx);
    if (!user || !user.isAdmin) return;
    const all = await listUsers(database);
    const lines = all.map((u) => `• ${u.name}${u.isAdmin ? " (admin)" : ""} — ${u.telegramId}`);
    await ctx.reply(`👥 Usuários (${all.length}):\n${lines.join("\n")}`);
  });

  // /resumo — totais do mês.
  bot.command("resumo", async (ctx) => {
    const user = await userOf(ctx);
    if (!user) return;
    const month = currentMonth();
    const s = await getSummary(database, user.id, month);
    const cats = s.porCategoria
      .filter((c) => c.type === "saida")
      .slice(0, 8)
      .map((c) => `  • ${c.name}: ${formatBRL(c.totalCents)}`);
    await ctx.reply(
      `📊 Resumo de ${formatMonth(month)}\n` +
        `Entradas: ${formatBRL(s.entradas)}\n` +
        `Saídas: ${formatBRL(s.saidas)}\n` +
        `Saldo: ${formatBRL(s.saldo)}` +
        (cats.length ? `\n\nGastos por categoria:\n${cats.join("\n")}` : ""),
    );
  });

  // /fluxo — fluxo de caixa dos últimos 6 meses.
  bot.command("fluxo", async (ctx) => {
    const user = await userOf(ctx);
    if (!user) return;
    const cf = await getCashflow(database, user.id, 6);
    const lines = cf.map(
      (p) => `${formatMonth(p.month)}: ${formatBRL(p.entradas)} − ${formatBRL(p.saidas)} = ${formatBRL(p.saldo)}`,
    );
    await ctx.reply(`📈 Fluxo de caixa (6 meses)\n${lines.join("\n")}`);
  });

  // /extrato — últimas transações.
  bot.command("extrato", async (ctx) => {
    const user = await userOf(ctx);
    if (!user) return;
    const items = await listTransactions(database, user.id, { limit: 10, offset: 0 });
    if (items.length === 0) {
      await ctx.reply("Nenhuma transação ainda. Me manda um gasto! 😉");
      return;
    }
    const lines = items.map((t) => {
      const sign = t.type === "entrada" ? "🟢 +" : "🔴 −";
      return `${formatDayMonth(t.date)} ${sign}${formatBRL(t.amountCents)} — ${t.description}`;
    });
    await ctx.reply(`🧾 Últimas transações\n${lines.join("\n")}`);
  });

  // /contas — saldos de cada conta.
  bot.command("contas", async (ctx) => {
    const user = await userOf(ctx);
    if (!user) return;
    const list = await listUserAccounts(database, user.id);
    if (list.length === 0) {
      await ctx.reply("Você ainda não tem contas. (A Carteira é criada no cadastro.)");
      return;
    }
    const total = list.reduce((acc, a) => acc + a.balanceCents, 0);
    const lines = list.map((a) => `• ${a.name}: ${formatBRL(a.balanceCents)}`);
    await ctx.reply(`💳 Saldos\n${lines.join("\n")}\n\nTotal: ${formatBRL(total)}`);
  });

  // /fatura — fatura aberta (corrente) de cada cartão.
  bot.command("fatura", async (ctx) => {
    const user = await userOf(ctx);
    if (!user) return;
    const cards = await listUserCards(database, user.id);
    if (cards.length === 0) {
      await ctx.reply("Você ainda não tem cartões cadastrados.");
      return;
    }
    const lines: string[] = [];
    for (const card of cards) {
      const month = computeInvoiceMonth(todaySaoPaulo(), card.closingDay);
      const inv = await getInvoice(database, user.id, card.id, month);
      lines.push(
        `💳 ${card.name} — fatura ${formatMonth(month)}: ${formatBRL(inv.totalCents)}` +
          (inv.paid ? " ✅" : ""),
      );
    }
    await ctx.reply(lines.join("\n"));
  });

  // /desfazer — remove a última transação vinda do bot.
  bot.command("desfazer", async (ctx) => {
    const user = await userOf(ctx);
    if (!user) return;
    const last = await lastTransactionBySource(database, user.id, "telegram");
    if (!last) {
      await ctx.reply("Não há nada para desfazer. 🤷");
      return;
    }
    await deleteTransaction(database, user.id, last.id);
    await ctx.reply(`Desfeito: ${last.description} (${formatBRL(last.amountCents)}). ✅`);
  });

  // Texto livre = lançamento.
  bot.on("message:text", async (ctx) => {
    const user = await userOf(ctx);
    if (!user) return; // ignora não cadastrados (seção 8)
    const parsed = parseEntry(ctx.message.text);
    if (!parsed) {
      await ctx.reply('Não entendi 🤔. Tente algo como "mercado 50" ou "+1000 salário".');
      return;
    }

    // Sintaxe "... no <cartão>": detecta o cartão e limpa a descrição.
    let cardId: number | undefined;
    let description = parsed.description;
    const cards = await listUserCards(database, user.id);
    if (cards.length > 0) {
      const m = matchCard(parsed.description, cards);
      if (m) {
        cardId = m.cardId;
        description = m.description;
      }
    }

    const tx = await createTransaction(database, user.id, {
      type: parsed.type,
      amountCents: parsed.amountCents,
      description,
      cardId,
      source: "telegram",
    });
    const cat = await getUserCategory(database, user.id, tx.categoryId);
    const emoji = parsed.type === "entrada" ? "🟢" : "🔴";
    const label = parsed.type === "entrada" ? "Entrada" : "Saída";

    if (cardId !== undefined) {
      const card = cards.find((c) => c.id === cardId);
      await ctx.reply(
        `${emoji} ${label} no cartão ${card?.name ?? ""}: ${formatBRL(tx.amountCents)}\n` +
          `${tx.description} • ${cat?.name ?? "—"} • fatura ${formatMonth(tx.invoiceMonth ?? "")}`,
      );
    } else {
      await ctx.reply(
        `${emoji} ${label} registrada: ${formatBRL(tx.amountCents)}\n${tx.description} • ${cat?.name ?? "—"}`,
      );
    }
  });
}

// Webhook do Telegram. Montado FORA do middleware de bearer. Valida o secret token.
// Em modo mock (MOCK_TELEGRAM=1, dev local) intercepta as chamadas à API do Telegram e
// devolve no corpo da resposta as mensagens que teriam sido enviadas (p/ testes).
export async function handleTelegramWebhook(c: HonoContext<AppEnv>): Promise<Response> {
  const env = c.env;
  const mock = env.MOCK_TELEGRAM === "1";

  if (!mock) {
    const secret = c.req.header("X-Telegram-Bot-Api-Secret-Token");
    if (!env.TELEGRAM_WEBHOOK_SECRET || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return c.json({ error: "forbidden" }, 401);
    }
  }

  const sent: { text: string }[] = [];
  const botInfo = cachedBotInfo ?? (mock ? STUB_BOT_INFO : undefined);
  const bot = new Bot(env.BOT_TOKEN, botInfo ? { botInfo } : undefined);

  if (mock) {
    const capture: Transformer = (_prev, method, payload) => {
      if (method === "sendMessage") {
        sent.push({ text: String((payload as { text?: string }).text ?? "") });
      }
      return Promise.resolve({ ok: true, result: undefined as never });
    };
    bot.api.config.use(capture);
  }

  registerHandlers(bot, env);

  if (!botInfo) {
    await bot.init();
    cachedBotInfo = bot.botInfo;
  }

  const res = await webhookCallback(bot, "hono")(c);
  if (mock) return c.json({ ok: true, sent });
  return res;
}
