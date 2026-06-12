import { describe, expect, it } from "bun:test";
import { matchCard, parseEntry, parseMoneyToken } from "./parser";

describe("parseMoneyToken", () => {
  it("inteiro puro = reais", () => {
    expect(parseMoneyToken("50")).toBe(5000);
    expect(parseMoneyToken("1000")).toBe(100000);
  });
  it("vírgula decimal BR", () => {
    expect(parseMoneyToken("32,50")).toBe(3250);
    expect(parseMoneyToken("12,5")).toBe(1250);
    expect(parseMoneyToken("1.234,56")).toBe(123456);
  });
  it("ponto como milhar (3 dígitos após)", () => {
    expect(parseMoneyToken("1.234")).toBe(123400);
    expect(parseMoneyToken("1.500")).toBe(150000);
    expect(parseMoneyToken("100.000")).toBe(10000000);
  });
  it("ponto como decimal (≠3 dígitos após)", () => {
    expect(parseMoneyToken("12.50")).toBe(1250);
    expect(parseMoneyToken("12.5")).toBe(1250);
  });
  it("inválido", () => {
    expect(parseMoneyToken("abc")).toBeNull();
    expect(parseMoneyToken("0")).toBeNull();
  });
});

describe("parseEntry", () => {
  it("saída simples", () => {
    expect(parseEntry("almoço no ifood 32,50")).toEqual({
      type: "saida",
      amountCents: 3250,
      description: "almoço no ifood",
    });
  });
  it("entrada por prefixo +", () => {
    expect(parseEntry("+5000 freelance")).toEqual({
      type: "entrada",
      amountCents: 500000,
      description: "freelance",
    });
  });
  it("entrada por keyword", () => {
    const r = parseEntry("salário 5000");
    expect(r?.type).toBe("entrada");
    expect(r?.amountCents).toBe(500000);
  });
  it("saída por prefixo - mesmo com keyword", () => {
    const r = parseEntry("-recebi 100");
    expect(r?.type).toBe("saida");
  });
  it("prioriza número com vírgula", () => {
    const r = parseEntry("conta de luz 150 e troco 2,50");
    expect(r?.amountCents).toBe(250);
  });
  it("sem valor → null", () => {
    expect(parseEntry("oi tudo bem")).toBeNull();
  });
});

describe("matchCard", () => {
  const cards = [
    { id: 1, name: "Itaú" },
    { id: 2, name: "Nubank" },
  ];
  it('detecta "no <cartão>" (acento-insensível) e limpa a descrição', () => {
    expect(matchCard("mercado no itau", cards)).toEqual({ cardId: 1, description: "mercado" });
  });
  it("detecta nome do cartão sem 'no'", () => {
    expect(matchCard("uber nubank", cards)).toEqual({ cardId: 2, description: "uber" });
  });
  it("sem cartão → null", () => {
    expect(matchCard("mercado", cards)).toBeNull();
  });
});
