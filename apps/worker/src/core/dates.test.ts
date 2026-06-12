import { describe, expect, it } from "bun:test";
import { addMonths, monthOf } from "./dates";

describe("monthOf", () => {
  it("extrai YYYY-MM de uma data", () => {
    expect(monthOf("2026-06-12")).toBe("2026-06");
  });
});

describe("addMonths", () => {
  it("soma e subtrai meses", () => {
    expect(addMonths("2026-06", 1)).toBe("2026-07");
    expect(addMonths("2026-06", -1)).toBe("2026-05");
  });

  it("vira o ano", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("salta vários meses", () => {
    expect(addMonths("2026-06", -5)).toBe("2026-01");
    expect(addMonths("2026-06", 8)).toBe("2027-02");
  });
});
