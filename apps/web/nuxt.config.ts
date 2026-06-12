// Nuxt 4 — dashboard do finbot (deploy na Vercel; preset auto-detectado).
export default defineNuxtConfig({
  compatibilityDate: "2025-01-01",
  devtools: { enabled: false },
  ssr: true,
  css: ["~/assets/main.css"],

  runtimeConfig: {
    // server-only (nunca expostos ao browser): o proxy roda no servidor do Nitro.
    apiBaseUrl: process.env.API_BASE_URL ?? "http://127.0.0.1:8787",
    sessionSecret: process.env.SESSION_SECRET ?? "dev-session-secret",
  },

  app: {
    head: {
      title: "finbot",
      meta: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
      htmlAttrs: { lang: "pt-BR" },
    },
  },

  // vue-echarts importa "echarts/core" — evita problemas de SSR transpilando.
  build: { transpile: ["echarts", "vue-echarts"] },
});
