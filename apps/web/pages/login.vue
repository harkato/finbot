<script setup lang="ts">
definePageMeta({ layout: "blank" });
const route = useRoute();
const error = computed(() => route.query.error === "1");
</script>

<template>
  <div class="login-wrap">
    <div class="login-box">
      <div class="brand" style="font-size: 2rem; margin-bottom: 1rem">
        fin<span>bot</span>
      </div>
      <p v-if="error" style="color: var(--danger)">
        Link inválido ou expirado. Gere um novo.
      </p>
      <p>Para entrar, abra seu bot no Telegram e envie:</p>
      <p style="font-size: 1.4rem; font-weight: 700; color: var(--accent)">/login</p>
      <p class="muted">
        O bot envia um link de acesso de uso único (válido por 10 minutos). Clique nele
        para entrar no painel.
      </p>
    </div>
  </div>
</template>
