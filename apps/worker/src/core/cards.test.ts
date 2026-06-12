import { describe, expect, it } from "bun:test";
import { computeInvoiceMonth } from "./cards";

describe("computeInvoiceMonth", () => {
  it("dia <= fechamento → fatura do mês corrente", () => {
    expect(computeInvoiceMonth("2026-06-10", 15)).toBe("2026-06");
    expect(computeInvoiceMonth("2026-06-15", 15)).toBe("2026-06");
  });
  it("dia > fechamento → fatura do mês seguinte", () => {
    expect(computeInvoiceMonth("2026-06-20", 15)).toBe("2026-07");
  });
  it("vira o ano", () => {
    expect(computeInvoiceMonth("2026-12-31", 28)).toBe("2027-01");
  });
});
