<script setup lang="ts">
import { formatBRL, reaisToCents, currentMonth } from "~/utils/format";

type Budget = { id: number; categoryId: number; categoryName: string; monthlyLimitCents: number; spentCents: number; ratio: number };
type Category = { id: number; name: string; kind: string };

const api = useApi();
const month = currentMonth();
const { data, refresh } = await useAsyncData("budgets", async () => {
  const [budgets, cats] = await Promise.all([
    api.get<{ budgets: Budget[] }>(`budgets?month=${month}`),
    api.get<{ categories: Category[] }>("categories"),
  ]);
  return { budgets: budgets.budgets, cats: cats.categories };
});

const novo = reactive({ categoryId: "", limit: "" });
async function add() {
  if (!novo.categoryId || !novo.limit) return;
  await api.post("budgets", { categoryId: Number(novo.categoryId), monthlyLimitCents: reaisToCents(novo.limit) });
  novo.categoryId = ""; novo.limit = "";
  await refresh();
}
async function remove(b: Budget) {
  await api.del(`budgets/${b.id}`);
  await refresh();
}
</script>

<template>
  <div>
    <h1>Orçamentos</h1>

    <div class="panel">
      <h3>Novo orçamento</h3>
      <div class="row">
        <select v-model="novo.categoryId">
          <option value="">Categoria…</option>
          <option v-for="c in data?.cats.filter((x) => x.kind !== 'entrada')" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <input v-model="novo.limit" placeholder="Teto mensal (ex: 800)" style="width: 140px" />
        <button class="primary" @click="add">Definir</button>
      </div>
    </div>

    <div class="panel">
      <p v-if="!data?.budgets.length" class="muted">Nenhum orçamento definido.</p>
      <div v-for="b in data?.budgets" :key="b.id" style="margin-bottom: 1rem">
        <div class="row" style="justify-content: space-between">
          <b>{{ b.categoryName }}</b>
          <span class="row">
            <span class="muted">{{ formatBRL(b.spentCents) }} / {{ formatBRL(b.monthlyLimitCents) }} ({{ Math.round(b.ratio * 100) }}%)</span>
            <button class="danger" @click="remove(b)">✕</button>
          </span>
        </div>
        <div class="bar" :class="{ over: b.ratio >= 1, warn: b.ratio >= 0.8 && b.ratio < 1 }">
          <span :style="{ width: Math.min(100, b.ratio * 100) + '%' }" />
        </div>
      </div>
    </div>
  </div>
</template>
