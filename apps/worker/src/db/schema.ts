// Schema Drizzle (D1 / SQLite). Construído por fases — ver seção 5 e 12 do contexto.
//
// Convenções:
//   - valores monetários SEMPRE em centavos (integer)
//   - datas como text ISO "YYYY-MM-DD"; mês de referência como text "YYYY-MM"
//   - booleans como integer({ mode: "boolean" })
//   - TODA tabela de dados tem userId; TODA query é escopada pelo usuário autenticado
//
// Fase 0: schema vazio (baseline). As tabelas users/invites/categories/transactions
// chegam na Fase 1.

export {};
