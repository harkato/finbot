<script setup lang="ts">
import { formatBRL, reaisToCents, currentMonth } from "~/utils/format";

type Tx = {
  id: number; type: "entrada" | "saida"; amountCents: number; description: string;
  categoryId: number; accountId: number | null; cardId: number | null; date: string;
  paid: boolean; tags: string;
};
type Category = { id: number; name: string };
type Account = { id: number; name: string };
type Card = { id: number; name: string };

const api = useApi();
const month = ref(currentMonth());
const typeFilter = ref<"" | "entrada" | "saida">("");

const { data: refs } = await useAsyncData("tx-refs", async () => {
  const [cats, accs, cards] = await Promise.all([
    api.get<{ categories: Category[] }>("categories"),
    api.get<{ accounts: Account[] }>("accounts"),
    api.get<{ cards: Card[] }>("cards"),
  ]);
  return { cats: cats.categories, accs: accs.accounts, cards: cards.cards };
});
const catName = (id: number) => refs.value?.cats.find((c) => c.id === id)?.name ?? "—";
const placeName = (t: Tx) =>
  t.cardId ? `💳 ${refs.value?.cards.find((c) => c.id === t.cardId)?.name ?? ""}`
           : refs.value?.accs.find((a) => a.id === t.accountId)?.name ?? "—";

const { data: txs, refresh } = await useAsyncData(
  "txs",
  () => api.get<{ transactions: Tx[] }>(`transactions?month=${month.value}${typeFilter.value ? `&type=${typeFilter.value}` : ""}&limit=300`),
  { watch: [month, typeFilter] },
);

// formulário de novo lançamento
const form = reactive({ type: "saida" as "entrada" | "saida", amount: "", description: "", date: "", categoryId: "", accountId: "", cardId: "" });
const saving = ref(false);
async function add() {
  if (!form.amount || !form.description) return;
  saving.value = true;
  try {
    await api.post("transactions", {
      type: form.type,
      amountCents: reaisToCents(form.amount),
      description: form.description,
      date: form.date || undefined,
      categoryId: form.categoryId ? Number(form.categoryId) : undefined,
      accountId: form.cardId ? undefined : form.accountId ? Number(form.accountId) : undefined,
      cardId: form.cardId ? Number(form.cardId) : undefined,
      source: "web",
    });
    form.amount = ""; form.description = "";
    await refresh();
  } finally {
    saving.value = false;
  }
}

async function togglePaid(t: Tx) {
  await api.patch(`transactions/${t.id}`, { paid: !t.paid });
  await refresh();
}
async function remove(t: Tx) {
  if (!confirm(`Excluir "${t.description}"?`)) return;
  await api.del(`transactions/${t.id}`);
  await refresh();
}
</script>

<template>
  <div>
    <h1>Transações</h1>

    <div class="panel">
      <h3>Novo lançamento</h3>
      <div class="row">
        <select v-model="form.type"><option value="saida">Saída</option><option value="entrada">Entrada</option></select>
        <input v-model="form.amount" placeholder="Valor (ex: 32,50)" style="width: 120px" />
        <input v-model="form.description" placeholder="Descrição" style="flex: 1; min-width: 160px" />
        <input v-model="form.date" type="date" />
        <select v-model="form.categoryId"><option value="">Categoria (auto)</option><option v-for="c in refs?.cats" :key="c.id" :value="c.id">{{ c.name }}</option></select>
        <select v-model="form.cardId"><option value="">Cartão…</option><option v-for="c in refs?.cards" :key="c.id" :value="c.id">{{ c.name }}</option></select>
        <select v-model="form.accountId" :disabled="!!form.cardId"><option value="">Conta (padrão)</option><option v-for="a in refs?.accs" :key="a.id" :value="a.id">{{ a.name }}</option></select>
        <button class="primary" :disabled="saving" @click="add">Adicionar</button>
      </div>
    </div>

    <div class="row" style="margin-bottom: 1rem">
      <input v-model="month" type="month" />
      <select v-model="typeFilter"><option value="">Todos</option><option value="entrada">Entradas</option><option value="saida">Saídas</option></select>
      <a :href="`/api/transactions/export?month=${month}`" target="_blank"><button class="ghost">⬇ CSV</button></a>
    </div>

    <div class="panel">
      <table>
        <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Conta/Cartão</th><th class="right">Valor</th><th>Pago</th><th></th></tr></thead>
        <tbody>
          <tr v-for="t in txs?.transactions" :key="t.id">
            <td>{{ t.date.slice(8) }}/{{ t.date.slice(5, 7) }}</td>
            <td>{{ t.description }}</td>
            <td>{{ catName(t.categoryId) }}</td>
            <td>{{ placeName(t) }}</td>
            <td class="right" :style="{ color: t.type === 'entrada' ? 'var(--accent)' : 'var(--danger)' }">
              {{ t.type === "entrada" ? "+" : "−" }}{{ formatBRL(t.amountCents) }}
            </td>
            <td><button class="ghost" @click="togglePaid(t)">{{ t.paid ? "✅" : "⏳" }}</button></td>
            <td><button class="danger" @click="remove(t)">✕</button></td>
          </tr>
          <tr v-if="!txs?.transactions.length"><td colspan="7" class="muted">Nenhuma transação neste mês.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
