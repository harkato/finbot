const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: number): string {
  return brl.format((cents ?? 0) / 100);
}

// "1.234,56" / "1234,56" / "50" → centavos. Para inputs do dashboard.
export function reaisToCents(input: string): number {
  const t = input.trim().replace(/\./g, "").replace(",", ".");
  const v = Number.parseFloat(t);
  return Number.isFinite(v) ? Math.round(v * 100) : 0;
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

const monthNames = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${monthNames[m - 1] ?? m}/${y}`;
}

export function currentMonth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}
