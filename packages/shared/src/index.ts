// @finbot/shared — contratos Zod e tipos compartilhados entre Worker, bot e proxy do Nuxt.
// Os schemas dos contratos da API chegam na Fase 1. Por ora exportamos só metadados do pacote
// para validar o wiring do monorepo (workspaces + resolução de tipos) na Fase 0.

export const SHARED_PACKAGE = "@finbot/shared" as const;
