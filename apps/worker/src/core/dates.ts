// Datas sempre como text. "Hoje" e o mês de referência são resolvidos no fuso de
// São Paulo, independentemente do fuso do runtime (Workers roda em UTC).

const SP_TZ = "America/Sao_Paulo";

// en-CA formata como YYYY-MM-DD.
const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: SP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todaySaoPaulo(): string {
  return dateFmt.format(new Date());
}

// Mês de referência "YYYY-MM" de uma data "YYYY-MM-DD".
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

// Mês atual "YYYY-MM" em São Paulo.
export function currentMonth(): string {
  return monthOf(todaySaoPaulo());
}

// Soma `delta` meses a um "YYYY-MM" (delta pode ser negativo). Retorna "YYYY-MM".
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const zero = y * 12 + (m - 1) + delta;
  const ny = Math.floor(zero / 12);
  const nm = zero % 12;
  return `${String(ny).padStart(4, "0")}-${String(nm + 1).padStart(2, "0")}`;
}
