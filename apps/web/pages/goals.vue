<script setup lang="ts">
import { formatBRL, reaisToCents, centsToInput } from "~/utils/format";

type Goal = { id: number; name: string; targetCents: number; savedCents: number; deadline: string | null };

const api = useApi();
const { data, refresh } = await useAsyncData("goals", () =>
  api.get<{ goals: Goal[] }>("goals"),
);

const novo = reactive({ name: "", target: "", deadline: "" });
async function add() {
  if (!novo.name || !novo.target) return;
  await api.post("goals", {
    name: novo.name,
    targetCents: reaisToCents(novo.target),
    deadline: novo.deadline || undefined,
  });
  novo.name = ""; novo.target = ""; novo.deadline = "";
  await refresh();
}
async function saveSaved(g: Goal, value: string) {
  await api.patch(`goals/${g.id}`, { savedCents: reaisToCents(value) });
  await refresh();
}
async function remove(g: Goal) {
  if (!confirm(`Excluir a meta "${g.name}"?`)) return;
  await api.del(`goals/${g.id}`);
  await refresh();
}
const pct = (g: Goal) => (g.targetCents > 0 ? Math.min(100, Math.round((g.savedCents / g.targetCents) * 100)) : 0);
</script>

<template>
  <div>
    <h1>Metas</h1>

    <div class="panel">
      <h3>Nova meta</h3>
      <div class="row">
        <input v-model="novo.name" placeholder="Nome (ex: Reserva)" />
        <input v-model="novo.target" placeholder="Alvo (ex: 10000)" style="width: 130px" />
        <input v-model="novo.deadline" type="date" />
        <button class="primary" @click="add">Criar</button>
      </div>
    </div>

    <div class="cards">
      <div v-for="g in data?.goals" :key="g.id" class="card">
        <div class="row" style="justify-content: space-between">
          <b>{{ g.name }}</b>
          <button class="danger" @click="remove(g)">✕</button>
        </div>
        <div class="value pos" style="font-size: 1.2rem">{{ formatBRL(g.savedCents) }} <span class="muted" style="font-size: .85rem">/ {{ formatBRL(g.targetCents) }}</span></div>
        <div class="bar" style="margin: .4rem 0"><span :style="{ width: pct(g) + '%' }" /></div>
        <div class="row" style="justify-content: space-between">
          <span class="muted">{{ pct(g) }}%<template v-if="g.deadline"> · até {{ g.deadline }}</template></span>
        </div>
        <label class="muted" style="display: block; margin-top: .5rem">Guardado (R$):
          <input :value="centsToInput(g.savedCents)" style="width: 110px"
            @change="(e) => saveSaved(g, (e.target as HTMLInputElement).value)" />
        </label>
      </div>
      <p v-if="!data?.goals.length" class="muted">Nenhuma meta ainda.</p>
    </div>
  </div>
</template>
