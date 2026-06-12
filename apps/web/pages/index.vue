<script setup lang="ts">
import { formatBRL, formatMonth, currentMonth } from "~/utils/format";

type CatSum = { name: string; color: string | null; type: string; totalCents: number };
type Summary = { entradas: number; saidas: number; saldo: number; porCategoria: CatSum[] };
type Cashflow = { cashflow: { month: string; entradas: number; saidas: number; saldo: number }[] };
type Budget = { categoryName: string; spentCents: number; monthlyLimitCents: number; ratio: number };
type Account = { name: string; balanceCents: number };

const api = useApi();
const month = currentMonth();

const { data } = await useAsyncData("overview", async () => {
  const [summary, cashflow, budgets, accounts] = await Promise.all([
    api.get<Summary>(`summary?month=${month}`),
    api.get<Cashflow>("cashflow?months=6"),
    api.get<{ budgets: Budget[] }>(`budgets?month=${month}`),
    api.get<{ accounts: Account[] }>("accounts"),
  ]);
  return { summary, cashflow: cashflow.cashflow, budgets: budgets.budgets, accounts: accounts.accounts };
});

const saldoTotal = computed(() =>
  (data.value?.accounts ?? []).reduce((a, x) => a + x.balanceCents, 0),
);

const pieOption = computed(() => {
  const cats = (data.value?.summary.porCategoria ?? []).filter((c) => c.type === "saida");
  return {
    tooltip: { trigger: "item", formatter: (p: any) => `${p.name}: ${formatBRL(p.value)} (${p.percent}%)` },
    legend: { textStyle: { color: "#94a3b8" }, type: "scroll", bottom: 0 },
    series: [{
      type: "pie", radius: ["45%", "70%"], center: ["50%", "45%"],
      label: { color: "#e2e8f0" },
      data: cats.map((c) => ({ name: c.name, value: c.totalCents, itemStyle: { color: c.color ?? undefined } })),
    }],
  };
});

const lineOption = computed(() => {
  const cf = data.value?.cashflow ?? [];
  return {
    tooltip: { trigger: "axis", valueFormatter: (v: any) => formatBRL(v) },
    legend: { textStyle: { color: "#94a3b8" }, top: 0 },
    grid: { left: 60, right: 20, top: 30, bottom: 30 },
    xAxis: { type: "category", data: cf.map((p) => formatMonth(p.month)), axisLabel: { color: "#94a3b8" } },
    yAxis: { type: "value", axisLabel: { color: "#94a3b8", formatter: (v: number) => `R$${(v / 100).toFixed(0)}` } },
    series: [
      { name: "Entradas", type: "line", smooth: true, data: cf.map((p) => p.entradas), itemStyle: { color: "#22c55e" } },
      { name: "Saídas", type: "line", smooth: true, data: cf.map((p) => p.saidas), itemStyle: { color: "#ef4444" } },
    ],
  };
});
</script>

<template>
  <div>
    <h1>Visão geral <span class="muted" style="font-size: 1rem">{{ formatMonth(month) }}</span></h1>

    <div class="cards">
      <div class="card"><div class="label">Saldo total</div><div class="value" :class="saldoTotal >= 0 ? 'pos' : 'neg'">{{ formatBRL(saldoTotal) }}</div></div>
      <div class="card"><div class="label">Entradas (mês)</div><div class="value pos">{{ formatBRL(data?.summary.entradas ?? 0) }}</div></div>
      <div class="card"><div class="label">Saídas (mês)</div><div class="value neg">{{ formatBRL(data?.summary.saidas ?? 0) }}</div></div>
      <div class="card"><div class="label">Saldo (mês)</div><div class="value" :class="(data?.summary.saldo ?? 0) >= 0 ? 'pos' : 'neg'">{{ formatBRL(data?.summary.saldo ?? 0) }}</div></div>
    </div>

    <div class="grid2">
      <div class="panel">
        <h3>Gastos por categoria</h3>
        <ClientOnly><VChart class="chart" :option="pieOption" autoresize /></ClientOnly>
      </div>
      <div class="panel">
        <h3>Fluxo de caixa (6 meses)</h3>
        <ClientOnly><VChart class="chart" :option="lineOption" autoresize /></ClientOnly>
      </div>
    </div>

    <div class="panel">
      <h3>Orçamentos do mês</h3>
      <p v-if="!data?.budgets.length" class="muted">Nenhum orçamento definido.</p>
      <div v-for="b in data?.budgets" :key="b.categoryName" style="margin-bottom: .9rem">
        <div class="row" style="justify-content: space-between">
          <span>{{ b.categoryName }}</span>
          <span class="muted">{{ formatBRL(b.spentCents) }} / {{ formatBRL(b.monthlyLimitCents) }} ({{ Math.round(b.ratio * 100) }}%)</span>
        </div>
        <div class="bar" :class="{ over: b.ratio >= 1, warn: b.ratio >= 0.8 && b.ratio < 1 }">
          <span :style="{ width: Math.min(100, b.ratio * 100) + '%' }" />
        </div>
      </div>
    </div>
  </div>
</template>
