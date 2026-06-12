import { describe, expect, it } from "bun:test";
import {
  type Categorizable,
  categorize,
  normalize,
} from "./categorize";

const cats: Categorizable[] = [
  { id: 1, name: "alimentação", keywords: JSON.stringify(["ifood", "mercado", "padaria"]) },
  { id: 2, name: "transporte", keywords: JSON.stringify(["uber", "99", "gasolina"]) },
  { id: 3, name: "compras", keywords: JSON.stringify(["mercado livre", "amazon"]) },
  { id: 8, name: "outros", keywords: "[]" },
  { id: 9, name: "renda", keywords: JSON.stringify(["freela", "pix recebido"]) },
];

describe("normalize", () => {
  it("remove acentos e pontuação, minúsculo", () => {
    expect(normalize("Alimentação no iFood!!")).toBe("alimentacao no ifood");
    expect(normalize("Pedágio  R$10")).toBe("pedagio r 10");
  });
});

describe("categorize", () => {
  it("casa keyword simples", () => {
    expect(categorize("Almoço no iFood", "saida", cats)).toBe(1);
    expect(categorize("corrida de Uber", "saida", cats)).toBe(2);
  });

  it("casa keyword multi-palavra", () => {
    const multi: Categorizable[] = [
      { id: 1, name: "saúde", keywords: JSON.stringify(["plano de saude"]) },
      { id: 2, name: "outros", keywords: "[]" },
    ];
    expect(categorize("paguei o plano de saude", "saida", multi)).toBe(1);
    expect(categorize("compra qualquer", "saida", multi)).toBe(2);
  });

  it("respeita ordem (primeira categoria que casa vence)", () => {
    // "mercado" casa alimentação (id 1) antes de "mercado livre" (id 3)
    expect(categorize("fui ao mercado", "saida", cats)).toBe(1);
  });

  it("não casa substring no meio de palavra", () => {
    // "99" não deve casar em "1999"
    expect(categorize("show em 1999", "saida", cats)).toBe(8);
  });

  it("cai no fallback por tipo", () => {
    expect(categorize("coisa aleatoria", "saida", cats)).toBe(8); // outros
    expect(categorize("coisa aleatoria", "entrada", cats)).toBe(9); // renda
  });

  it("entrada casa keyword de renda", () => {
    expect(categorize("recebi um freela", "entrada", cats)).toBe(9);
  });
});
