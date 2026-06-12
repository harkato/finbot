<script setup lang="ts">
import { formatBRL, formatMonth, reaisToCents } from "~/utils/format";

type Card = { id: number; name: string; limitCents: number; closingDay: number; dueDay: number; payFromAccountId: number | null };
type Account = { id: number; name: string };
type Invoice = { cardId: number; month: string; totalCents: number; paid: boolean; items: unknown[] };

const api = useApi();
const { data, refresh } = await useAsyncData("cards", async () => {
  const [cards, accs] = await Promise.all([
    api.get<{ cards: Card[] }>("cards"),
    api.get<{ accounts: Account[] }>("accounts"),
  ]);
  const invoices = await Promise.all(
    cards.cards.map((c) => api.get<{ invoice: Invoice }>(`cards/${c.id}/invoice`).then((r) => r.invoice)),
  );
  return { cards: cards.cards, accs: accs.accounts, invoices };
});
const invOf = (id: number) => data.value?.invoices.find((i) => i.cardId === id);
const accName = (id: number | null) => data.value?.accs.find((a) => a.id === id)?.name ?? "—";

async function pay(c: Card) {
  const inv = invOf(c.id);
  if (!inv || inv.totalCents <= 0) return;
  if (!confirm(`Pagar a fatura de ${formatBRL(inv.totalCents)} debitando ${accName(c.payFromAccountId)}?`)) return;
  try {
    await api.post(`cards/${c.id}/pay-invoice`, { month: inv.month });
    await refresh();
  } catch {
    alert("Não foi possível pagar (sem conta pagadora ou fatura vazia).");
  }
}

const novo = reactive({ name: "", limit: "", closingDay: "1", dueDay: "10", payFromAccountId: "" });
async function add() {
  if (!novo.name || !novo.limit) return;
  await api.post("cards", {
    name: novo.name,
    limitCents: reaisToCents(novo.limit),
    closingDay: Number(novo.closingDay),
    dueDay: Number(novo.dueDay),
    payFromAccountId: novo.payFromAccountId ? Number(novo.payFromAccountId) : undefined,
  });
  novo.name = ""; novo.limit = "";
  await refresh();
}
</script>

<template>
  <div>
    <h1>Cartões</h1>

    <div class="panel">
      <h3>Novo cartão</h3>
      <div class="row">
        <input v-model="novo.name" placeholder="Nome (ex: Nubank)" />
        <input v-model="novo.limit" placeholder="Limite (ex: 5000)" style="width: 120px" />
        <label class="muted">fecha dia <input v-model="novo.closingDay" type="number" min="1" max="28" style="width: 60px" /></label>
        <label class="muted">vence dia <input v-model="novo.dueDay" type="number" min="1" max="28" style="width: 60px" /></label>
        <select v-model="novo.payFromAccountId"><option value="">Conta pagadora…</option><option v-for="a in data?.accs" :key="a.id" :value="a.id">{{ a.name }}</option></select>
        <button class="primary" @click="add">Criar</button>
      </div>
    </div>

    <div class="cards">
      <div v-for="c in data?.cards" :key="c.id" class="card">
        <div class="row" style="justify-content: space-between">
          <b>{{ c.name }}</b>
          <span class="muted">fecha {{ c.closingDay }} · vence {{ c.dueDay }}</span>
        </div>
        <div class="label" style="margin-top: .6rem">Fatura {{ formatMonth(invOf(c.id)?.month ?? "") }}</div>
        <div class="value neg">{{ formatBRL(invOf(c.id)?.totalCents ?? 0) }}</div>
        <div class="muted" style="font-size: .8rem">paga por: {{ accName(c.payFromAccountId) }}</div>
        <button class="primary" style="margin-top: .6rem; width: 100%"
          :disabled="(invOf(c.id)?.totalCents ?? 0) <= 0 || invOf(c.id)?.paid"
          @click="pay(c)">
          {{ invOf(c.id)?.paid ? "Fatura paga ✅" : "Pagar fatura" }}
        </button>
      </div>
      <p v-if="!data?.cards.length" class="muted">Nenhum cartão cadastrado.</p>
    </div>
  </div>
</template>
