<script setup lang="ts">
type Category = {
  id: number; name: string; kind: string; color: string | null;
  keywords: string; isSystem: boolean;
};

const api = useApi();
const { data, refresh } = await useAsyncData("cats", () =>
  api.get<{ categories: Category[] }>("categories"),
);

const kwOf = (c: Category): string => {
  try { return (JSON.parse(c.keywords) as string[]).join(", "); } catch { return ""; }
};
function parseKw(s: string): string[] {
  return s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
}

async function saveKeywords(c: Category, value: string) {
  await api.patch(`categories/${c.id}`, { keywords: parseKw(value) });
  await refresh();
}

const novo = reactive({ name: "", kind: "saida", keywords: "" });
async function add() {
  if (!novo.name) return;
  await api.post("categories", { name: novo.name, kind: novo.kind, keywords: parseKw(novo.keywords) });
  novo.name = ""; novo.keywords = "";
  await refresh();
}
async function remove(c: Category) {
  if (!confirm(`Excluir categoria "${c.name}"?`)) return;
  try {
    await api.del(`categories/${c.id}`);
    await refresh();
  } catch {
    alert("Categorias do sistema (outros/renda) não podem ser excluídas.");
  }
}
</script>

<template>
  <div>
    <h1>Categorias</h1>
    <p class="muted">As <b>keywords</b> alimentam a categorização automática do bot. Editar aqui melhora o bot sem deploy.</p>

    <div class="panel">
      <h3>Nova categoria</h3>
      <div class="row">
        <input v-model="novo.name" placeholder="Nome" />
        <select v-model="novo.kind"><option value="saida">Saída</option><option value="entrada">Entrada</option><option value="ambas">Ambas</option></select>
        <input v-model="novo.keywords" placeholder="keywords separadas por vírgula" style="flex: 1; min-width: 200px" />
        <button class="primary" @click="add">Criar</button>
      </div>
    </div>

    <div class="panel">
      <table>
        <thead><tr><th>Categoria</th><th>Tipo</th><th style="width: 50%">Keywords</th><th></th></tr></thead>
        <tbody>
          <tr v-for="c in data?.categories" :key="c.id">
            <td><span class="pill" :style="{ borderColor: c.color ?? 'var(--line)' }">{{ c.name }}</span></td>
            <td class="muted">{{ c.kind }}</td>
            <td>
              <input :value="kwOf(c)" style="width: 100%"
                @change="(e) => saveKeywords(c, (e.target as HTMLInputElement).value)" />
            </td>
            <td>
              <button v-if="!c.isSystem" class="danger" @click="remove(c)">✕</button>
              <span v-else class="muted" title="indeletável">🔒</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
