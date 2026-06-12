# Contexto — finbot v2 (para Claude Code)

> Documento de contexto persistente do projeto. Leia integralmente antes de qualquer implementação.
> Trabalhe **uma fase por vez** (seção 12) e não avance sem os critérios de aceite da fase atual.

## 1. O que é o projeto

Bot pessoal de controle financeiro no Telegram + dashboard web, inspirado nas funções do Mobills (sem Open Finance): entradas e saídas em linguagem natural, contas, cartões de crédito com fatura, orçamentos por categoria com alertas, metas e relatórios de fluxo de caixa.

**Multi-user, pequeno e fechado.** O app atende o dono (admin) e um grupo de amigos convidados — produto gratuito, sem monetização. Multi-tenancy num banco só: **toda** tabela de dados tem `userId` e **toda** query é escopada pelo usuário autenticado. Cadastro apenas por convite (seção 6.0); não existe signup aberto.

Existe um **v1 funcional** (bot grammY + SQLite + long polling) cujo parser (`src/parser.ts`) e formatadores (`src/format.ts`) devem ser **portados, não reescritos** — a lógica de parse de valores BR ("1.234,56"), detecção de entrada por `+`/keywords e prioridade de número com vírgula já está testada.

## 2. Arquitetura alvo

Hospedagem 100% em free tier: **Cloudflare** (backend) + **Vercel** (frontend).

```
Telegram ──webhook──▶ ┌─────────────────────────────┐
                      │  Worker único (Cloudflare)  │ ──▶ D1 (SQLite)
Nuxt (Vercel) ──────▶ │  Hono: /api/* + /webhook    │
  via proxy Nitro     │  + scheduled() p/ alertas   │ ──sendMessage──▶ Telegram
                      └─────────────────────────────┘
```

Decisões fechadas (não rediscutir durante implementação):

1. **Um Worker só** contém API e bot. O grammY é montado como rota do Hono via `webhookCallback(bot, "hono")`. Sem long polling — Workers são serverless.
2. **D1** é o banco (SQLite gerenciado). Drizzle ORM com driver `drizzle-orm/d1`.
3. **Cron de alertas** roda no mesmo Worker via Cron Triggers (handler `scheduled`). Expressões cron são **UTC** — 8h de São Paulo = `0 11 * * *`.
4. O **dashboard nunca chama o Worker direto do browser**. As server routes do Nitro (Nuxt) fazem proxy. Login por **magic link emitido pelo bot** (`/login`): o Worker gera um token HMAC de curta duração, o usuário abre o link e o dashboard troca por cookie de sessão (30 dias) que o proxy repassa ao Worker em cada chamada. Sem senhas armazenadas.
5. Alertas síncronos (orçamento) viajam na **resposta do POST /api/transactions**; o cron cobre só o assíncrono (contas a vencer, fatura fechando).
6. **Bun** continua sendo o runtime de dev/tooling local (instalação, scripts, testes). Em produção o runtime é o do Workers — não usar APIs do Node nem filesystem no código do Worker.
7. **Identidade = Telegram.** O `telegramId` é a chave de identidade; o bot é o canal de cadastro (convites) e de login do dashboard (magic link). Não existe e-mail/senha.

## 3. Stack

| Camada | Tecnologia |
|---|---|
| Worker (API + bot) | Hono + grammY + Drizzle (drizzle-orm/d1) + Zod |
| Banco | Cloudflare D1, migrations via drizzle-kit + `wrangler d1 migrations apply` |
| Dashboard | Nuxt 4 (Vercel, preset `vercel`), vue-echarts para gráficos |
| Compartilhado | Schemas Zod + tipos TS em `packages/shared` |
| Tooling | Bun workspaces, wrangler CLI, TypeScript strict |

## 4. Estrutura do monorepo

```
finbot/
├── apps/
│   ├── worker/                 # Cloudflare Worker (API + bot + cron)
│   │   ├── src/
│   │   │   ├── index.ts        # export default { fetch, scheduled }
│   │   │   ├── api/            # rotas Hono (/api/*)
│   │   │   ├── bot/            # grammY: setup, comandos, parser portado do v1
│   │   │   ├── core/           # regras de negócio (categorização, fatura, orçamento)
│   │   │   └── db/             # schema Drizzle + helpers de query
│   │   ├── drizzle/            # migrations geradas
│   │   └── wrangler.toml
│   └── web/                    # Nuxt (Vercel)
│       ├── server/
│       │   ├── api/[...path].ts    # proxy → Worker com Authorization
│       │   └── middleware/auth.ts  # gate de senha + cookie
│       └── app/                # páginas e componentes
├── packages/
│   └── shared/                 # schemas Zod dos contratos + tipos
├── contexto-finbot-v2.md       # este arquivo
└── package.json                # workspaces: apps/*, packages/*
```

## 5. Modelo de dados (Drizzle / D1)

Convenções: valores monetários **sempre em centavos** (`integer`); datas como `text` ISO (`YYYY-MM-DD`); mês de referência como `text` (`YYYY-MM`); booleans como `integer mode boolean`.

```ts
// apps/worker/src/db/schema.ts (resumo do alvo final — criar por fases)

users: {
  id: integer pk autoincrement
  telegramId: integer notNull unique       // identidade vem do Telegram
  name: text notNull
  isAdmin: boolean default false
  createdAt: text default now
}

invites: {
  code: text pk                            // uso único, gerado pelo admin
  createdByUserId: integer fk users notNull
  usedByUserId: integer fk users           // null = ainda disponível
  createdAt: text default now
}

accounts: {
  id: integer pk autoincrement
  userId: integer fk users notNull
  name: text notNull                       // "Nubank", "Carteira"
  type: text enum("carteira","corrente","poupanca") default "corrente"
  initialBalanceCents: integer default 0
  archived: boolean default false
}

creditCards: {
  id: integer pk autoincrement
  userId: integer fk users notNull
  name: text notNull                       // "Itaú Click"
  limitCents: integer notNull
  closingDay: integer notNull              // dia do fechamento (1-28)
  dueDay: integer notNull                  // dia do vencimento (1-28)
  payFromAccountId: integer fk accounts    // conta que paga a fatura
  archived: boolean default false
}

categories: {
  id: integer pk autoincrement
  userId: integer fk users notNull
  name: text notNull                       // "alimentação"; unique(userId, name)
  kind: text enum("entrada","saida","ambas") default "saida"
  color: text                              // hex p/ dashboard
  keywords: text notNull default "[]"      // JSON string[] — usado pela categorização
}

transactions: {
  id: integer pk autoincrement
  userId: integer fk users notNull
  type: text enum("entrada","saida") notNull
  amountCents: integer notNull             // sempre positivo; o sinal vem de `type`
  description: text notNull
  categoryId: integer fk categories notNull
  accountId: integer fk accounts           // nullable
  cardId: integer fk creditCards           // nullable
  invoiceMonth: text                       // "YYYY-MM", só quando cardId presente
  date: text notNull                       // "YYYY-MM-DD" (data do fato gerador)
  paid: boolean default true               // false = a pagar/receber (pendência)
  tags: text default "[]"                  // JSON string[]
  source: text enum("telegram","web") notNull
  createdAt: text default now
  // CHECK na migration: (accountId IS NULL) <> (cardId IS NULL)  — exatamente um
}

budgets: {
  id: integer pk autoincrement
  userId: integer fk users notNull
  categoryId: integer fk categories notNull unique
  monthlyLimitCents: integer notNull       // teto padrão recorrente por mês
}

goals: {
  id: integer pk autoincrement
  userId: integer fk users notNull
  name: text notNull                       // "Reserva pós-CLT"
  targetCents: integer notNull
  savedCents: integer default 0
  deadline: text                           // "YYYY-MM-DD" opcional
}

recurrences: {                             // backlog (fase 7) — não criar antes
  id, userId, description, amountCents, type, categoryId,
  accountId|cardId, dayOfMonth, active
}
```

**Saldo de conta é derivado, nunca armazenado**: `initialBalanceCents + Σ entradas pagas − Σ saídas pagas` da conta. Fatura de cartão idem: soma das transactions do `cardId` + `invoiceMonth`.

## 6. Regras de negócio

### 6.0 Cadastro por convite
O admin (`ADMIN_TELEGRAM_ID`) gera códigos de uso único com `/convite`. Um amigo entra pelo deep link `t.me/<bot>?start=<código>`: o `/start` com payload válido cria o `user`, consome o invite e roda o **seed por usuário** (categorias padrão com keywords; a partir da Fase 3, também a conta "Carteira"). `/start` sem convite válido recebe uma mensagem educada e nada é criado. Qualquer update de telegramId sem usuário registrado é ignorado.

### 6.1 Categorização por keywords (vive na API, não no bot)
Ao criar uma transação sem `categoryId` explícito, a API normaliza a descrição (lowercase, sem acentos) e procura a primeira categoria **do usuário** cujo array `keywords` contenha um termo presente na descrição. Fallback: categoria "outros" (saída) ou "renda" (entrada) — ambas criadas no seed por usuário e indeletáveis. Editar keywords pelo dashboard melhora o bot sem deploy.

### 6.2 Cartão de crédito e fatura
- Gasto com `cardId` não afeta saldo de conta; entra na fatura `invoiceMonth`.
- Cálculo do `invoiceMonth`: se `date.day > closingDay`, fatura do mês seguinte; senão, do mês corrente. Gasto em cartão nasce com `paid: false`.
- `POST /api/cards/:id/pay-invoice { month }`: cria uma saída na `payFromAccountId` (categoria "fatura cartão") no valor da fatura e marca as transações daquela fatura como `paid: true`. Operação em batch/transaction do D1.

### 6.3 Orçamentos (resposta síncrona)
Todo `POST /api/transactions` de saída retorna, junto da transação criada, o status do orçamento da categoria no mês da transação: `{ spentCents, limitCents, ratio }` (ou `null` se não há orçamento). O bot anexa aviso quando `ratio >= 0.8` (⚠️) ou `>= 1.0` (🚨).

### 6.4 Pendências
Transação com `paid: false` e `date` futura/passada é "a pagar"/"a receber". O cron diário avisa vencimentos de hoje e de amanhã, e fatura que fecha em 2 dias.

## 7. API — contratos (prefixo /api; tudo escopado pelo usuário autenticado)

| Método e rota | Descrição |
|---|---|
| POST /api/transactions | Cria lançamento. Body: `{ type, amountCents, description, date?, categoryId?, accountId?, cardId?, paid?, tags?, source }`. Resposta: `{ transaction, budget }` |
| GET /api/transactions | Filtros: `month`, `categoryId`, `accountId`, `cardId`, `type`, `tag`, `paid`, `limit`, `offset` |
| PATCH /api/transactions/:id | Edição parcial |
| DELETE /api/transactions/:id | Remove (bot usa "última do source=telegram" via GET + DELETE) |
| GET /api/summary?month= | `{ entradas, saidas, saldo, porCategoria[] }` |
| GET /api/cashflow?months=6 | `[{ month, entradas, saidas, saldo }]` asc |
| CRUD /api/accounts, /api/categories, /api/cards, /api/budgets, /api/goals | REST padrão; GET /api/accounts inclui `balanceCents` derivado |
| GET /api/cards/:id/invoice?month= | Itens + total da fatura |
| POST /api/cards/:id/pay-invoice | Ver 6.2 |
| GET /api/alerts/preview | Retorna o que o cron enviaria agora (debug) |

**Auth em dois modos**: (a) interno — `Authorization: Bearer <API_TOKEN>` + header `X-Telegram-Id`, usado só pelo bot/cron dentro do próprio Worker, que resolve o usuário pelo telegramId; (b) sessão — token HMAC do magic link (cookie repassado pelo proxy do Nuxt), que carrega o `userId`. **Nunca aceitar `userId` vindo de body ou query.**

Todos os bodies validados com schemas Zod de `packages/shared` (importados também pelo bot e pelo proxy do Nuxt). Erro de validação → 422 com `issues`.

## 8. Bot (grammY via webhook)

- Rota `POST /webhook/telegram` no Hono, **fora** do middleware de bearer. Segurança: ao registrar o webhook, enviar `secret_token`; validar o header `X-Telegram-Bot-Api-Secret-Token` em cada request. Em vez de allowlist fixa, ignorar updates de telegramIds sem `user` registrado (exceto `/start` com convite).
- **Gotcha do Workers**: `env` só existe dentro do handler. Instanciar o `Bot` de forma lazy (cache em variável de módulo) e passar `botInfo` pré-obtido (ou chamar `bot.init()` uma vez e cachear) para evitar um `getMe` a cada update.
- O bot parseia só a sintaxe (valor em centavos, tipo, descrição — portar `parser.ts` do v1 **removendo** o mapa de categorias, que agora é responsabilidade da API) e chama a própria API via `fetch` interno com o bearer.
- Comandos: `/start [convite]`, `/id`, `/login` (magic link do dashboard), `/resumo`, `/fluxo`, `/extrato`, `/desfazer`, `/orcamento` (status dos orçamentos do mês), `/fatura` (fatura aberta de cada cartão), `/contas` (saldos); admin: `/convite` (gera código + deep link) e `/usuarios` (lista). Sintaxe de cartão no lançamento: sufixo com nome do cartão (ex.: "mercado 80 no itau") — match fuzzy simples pelo nome.

## 9. Cron de alertas (scheduled handler)

- `wrangler.toml`: `[triggers] crons = ["0 11 * * *"]` (08:00 América/São_Paulo; **cron é UTC**, documentar conversão num comentário).
- Lógica: **iterar todos os usuários** e, para cada um: pendências vencendo hoje/amanhã, faturas fechando em 2 dias, orçamentos que cruzaram 100% desde ontem. Envia via `https://api.telegram.org/bot<TOKEN>/sendMessage` com `fetch` direto (não precisa do grammY no scheduled).
- Sem alerta a enviar → não envia nada (silêncio é o comportamento padrão).

## 10. Dashboard (Nuxt na Vercel)

- `server/api/[...path].ts`: proxy genérico → `${API_BASE_URL}/api/${path}` repassando o token de sessão do cookie como `Authorization`. Nenhum segredo de serviço chega ao browser.
- Gate de acesso: página `/login` instrui a mandar `/login` para o bot; a rota `/login?token=` valida o magic link no Worker e grava o cookie de sessão. Middleware exige o cookie nas páginas e no proxy.
- Telas (ordem de prioridade): **Visão geral** (saldo total, entradas/saídas/saldo do mês, pizza por categoria, linha de fluxo 6 meses, barras de orçamento), **Transações** (lista com filtros, edição inline, marcar pago), **Categorias** (CRUD + editor de keywords), **Cartões** (fatura aberta, pagar fatura), **Orçamentos**, **Metas**.
- Gráficos com vue-echarts (client-only). Valores formatados pt-BR.

## 11. Variáveis e secrets

| Onde | Nome | Uso |
|---|---|---|
| Worker (secret) | BOT_TOKEN | Token do BotFather |
| Worker (secret) | API_TOKEN | Bearer da API (gerar com `openssl rand -hex 32`) |
| Worker (secret) | TELEGRAM_WEBHOOK_SECRET | Validação do header do webhook |
| Worker (var) | ADMIN_TELEGRAM_ID | Telegram ID do admin (gera convites) |
| Worker (secret) | SESSION_SECRET | Assina magic links e cookies de sessão |
| Worker (binding) | DB | D1 database |
| Vercel | API_BASE_URL | URL pública do Worker |
| Vercel | SESSION_SECRET | Mesmo segredo, p/ validar cookie no middleware |

## 12. Fases de implementação (uma sessão de Claude Code por fase)

**Fase 0 — Fundação.** Monorepo Bun workspaces; `apps/worker` com Hono respondendo `GET /api/health`; D1 criado e bindado; drizzle-kit configurado com uma migration vazia aplicada; deploy via `wrangler deploy` funcionando. ✅ Aceite: `curl https://<worker>/api/health` → 200 em produção.
> **Status: implementado e validado localmente (2026-06-11).** `GET /api/health` → 200 sob `wrangler dev` (Miniflare). Falta só o passo que exige conta Cloudflare: `wrangler d1 create finbot` (colar o `database_id` no `wrangler.toml`) + `wrangler deploy` para fechar o aceite "em produção".
> Decisões: (a) `packages/shared` exporta só um placeholder na Fase 0 — schemas Zod entram na Fase 1; (b) schema Drizzle vazio ⇒ `drizzle-kit generate` não cria arquivo (zero migrations); a primeira migration real nasce na Fase 1, sem baseline manual para não brigar com o journal do drizzle-kit; (c) cron de alertas fica comentado no `wrangler.toml` até a Fase 5; (d) `scheduled` é no-op por ora; (e) testes do Worker (`bun test`) ficam fora do programa do `tsc` para não misturar `bun-types` com `@cloudflare/workers-types`; (f) secrets locais em `apps/worker/.dev.vars` (git-ignored).

**Fase 1 — Transactions core.** Schema `users` + `invites` + `categories` + `transactions` **já com `userId` em tudo** (multi-tenancy desde o dia 1 — retrofit depois custa caro); seed por usuário com as keywords do parser v1; middleware de auth interno; POST/GET/PATCH/DELETE transactions com categorização automática; summary e cashflow. ✅ Aceite: criar/listar/somar via curl para dois usuários distintos sem vazamento entre eles.

**Fase 2 — Bot.** Webhook + secret token; registro por convite (`/convite` do admin, `/start <código>` cria usuário + seed); parser v1 portado; comandos `/start /id /resumo /fluxo /extrato /desfazer`; `setWebhook` registrado. ✅ Aceite: um segundo telegramId entra por convite, lança gastos, e os dados dos dois usuários não se misturam.

**Fase 3 — Contas.** Tabela accounts + CRUD + saldo derivado + conta padrão para lançamentos sem indicação + `/contas` no bot. ✅ Aceite: saldo bate com initialBalance + lançamentos.

**Fase 4 — Cartões.** Tabela creditCards + invoiceMonth + sintaxe "no <cartão>" no bot + GET invoice + pay-invoice + `/fatura`. ✅ Aceite: compra após o fechamento cai na fatura do mês seguinte; pagar fatura debita a conta e quita os itens.

**Fase 5 — Orçamentos e alertas.** Tabela budgets + status síncrono no POST + `/orcamento` + scheduled handler com os três tipos de alerta + `/api/alerts/preview`. ✅ Aceite: estourar 80% de uma categoria gera ⚠️ na confirmação do bot.

**Fase 6 — Dashboard.** Nuxt na Vercel com proxy + login por magic link do bot + telas na ordem da seção 10. ✅ Aceite: dois usuários logados veem cada um apenas os próprios dados; nenhum segredo de serviço aparece no DevTools.

**Fase 7 — Backlog.** Metas (goals), recorrências, export CSV, tags no bot, `/mes YYYY-MM`.

## 13. Comandos úteis

```bash
bun install                                      # raiz do monorepo
cd apps/worker
bunx wrangler d1 create finbot                   # uma vez; copiar database_id pro wrangler.toml
bunx drizzle-kit generate                        # gera migration a partir do schema
bunx wrangler d1 migrations apply finbot --local # aplica no D1 local
bunx wrangler d1 migrations apply finbot --remote
bunx wrangler dev                                # dev local (Miniflare, D1 local)
bunx wrangler deploy
bunx wrangler secret put BOT_TOKEN               # idem API_TOKEN, TELEGRAM_WEBHOOK_SECRET
bunx wrangler tail                               # logs em produção

# registrar webhook (uma vez, após o primeiro deploy):
curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=https://<worker>.workers.dev/webhook/telegram" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

Dev local do bot: `wrangler dev` expõe localhost, que o Telegram não alcança. Testar o webhook com `curl` simulando o payload de update, ou usar `cloudflared tunnel` quando precisar de teste fim-a-fim. O deploy leva segundos — testar em produção é aceitável neste projeto.

## 14. Convenções para o Claude Code

- TypeScript strict em tudo; sem `any`.
- Dinheiro **sempre** em centavos inteiros; formatação BRL só na borda (bot/dashboard), via `toLocaleString("pt-BR")`.
- Nenhuma API do Node (fs, path, process.env fora de tooling) dentro de `apps/worker/src` — só APIs Web/Workers; `env` chega pelo handler.
- Regras de negócio em `core/`, nunca dentro de rota Hono ou handler do bot.
- Toda mudança de schema = migration drizzle-kit nova; nunca editar migration aplicada.
- **Toda query escopada pelo `userId` do usuário autenticado**; jamais confiar em `userId` vindo do cliente. Teste recorrente em toda fase: usuário A não enxerga dados do usuário B.
- Mensagens do bot e UI em pt-BR; código e identificadores em inglês.
- Ao concluir uma fase, atualizar a seção 12 marcando o aceite e registrando decisões tomadas.
