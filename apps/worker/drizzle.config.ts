import { defineConfig } from "drizzle-kit";

// Geração de migrations a partir de src/db/schema.ts.
// `drizzle-kit generate` produz os arquivos em ./drizzle; a APLICAÇÃO é feita pelo
// wrangler (`wrangler d1 migrations apply finbot --local|--remote`), não pelo drizzle-kit.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
