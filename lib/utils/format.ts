/**
 * Formateo coherente con la voz de AJDUT:
 * - Cifras siempre con su unidad o contexto.
 * - Deltas direccionales con caracteres monoespaciados (▲ ▼ −), no color emoji.
 */

export function formatNumber(n: number | string | bigint, options?: Intl.NumberFormatOptions): string {
  const value = typeof n === "bigint" ? Number(n) : typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
}

export function formatPercent(n: number, fractionDigits = 2): string {
  return `${formatNumber(n, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}%`;
}

export function formatCurrency(
  amount: number | string,
  currency = "USD",
  fractionDigits = 2
): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export type Delta = {
  value: number;
  context: string;
};

export function formatDeltaSymbol(delta: number | null | undefined): "▲" | "▼" | "−" {
  if (delta === null || delta === undefined || delta === 0) return "−";
  return delta > 0 ? "▲" : "▼";
}

export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
