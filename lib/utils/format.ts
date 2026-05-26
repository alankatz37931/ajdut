/**
 * Formateo coherente con la voz de AJDUT:
 * - Cifras siempre con su unidad o contexto.
 * - Deltas direccionales con caracteres monoespaciados (▲ ▼ −), no color emoji.
 */

// Locale por defecto para formato de números, moneda y fechas. Los call
// sites más nuevos pueden pasar "en-US" (o cualquier BCP-47) cuando la
// preferencia del viewer es inglés. Los call sites históricos siguen sin
// pasar locale y respetan "es-MX" para no romper layouts existentes.
const DEFAULT_LOCALE = "es-MX";

/**
 * Resuelve el locale recibido y, en dev, avisa si el call site lo omitió.
 * No cambiamos el comportamiento (sigue cayendo a es-MX) para no romper la
 * API pública; solo dejamos un breadcrumb que ayuda a detectar drift cuando
 * agregamos soporte i18n a nuevas pantallas.
 */
function localeOrWarn(locale: string | undefined): string {
  if (locale == null && process.env.NODE_ENV !== "production") {
    console.warn(
      "[format] called without locale; falling back to es-MX. Pass locale explicitly for accurate formatting."
    );
  }
  return locale ?? DEFAULT_LOCALE;
}

export function formatNumber(
  n: number | string | bigint,
  options?: Intl.NumberFormatOptions,
  locale?: string
): string {
  const value = typeof n === "bigint" ? Number(n) : typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat(localeOrWarn(locale), {
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
}

export function formatPercent(
  n: number,
  fractionDigits = 2,
  locale?: string
): string {
  return `${formatNumber(
    n,
    { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits },
    localeOrWarn(locale)
  )}%`;
}

export function formatCurrency(
  amount: number | string,
  currency = "USD",
  fractionDigits = 2,
  locale?: string
): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat(localeOrWarn(locale), {
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

export function formatDate(
  d: Date | string,
  locale?: string
): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(localeOrWarn(locale), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatDateTime(
  d: Date | string,
  locale?: string
): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(localeOrWarn(locale), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Tipo de cambio USD → MXN fijo (hard-coded, configurable).
 * Lo usamos solo como display secundario cuando la preferencia del viewer es MXN
 * y el monto original viene en USD. No reemplaza la moneda original.
 */
export const USD_TO_MXN = 18;

/**
 * Devuelve un par {primary, secondary} para mostrar un monto USD con su
 * equivalente MXN como segunda línea (cuando la preferencia del viewer es MXN).
 *
 *  - primary: siempre el monto original ya formateado en USD.
 *  - secondary: "≈ MXN X" si prefersMxn=true; null si no aplica.
 */
export function formatDualCurrency(
  amountUsd: number,
  prefersMxn: boolean,
  fractionDigits = 2
): { primary: string; secondary: string | null } {
  const primary = formatCurrency(amountUsd, "USD", fractionDigits);
  if (!prefersMxn) return { primary, secondary: null };
  const mxn = amountUsd * USD_TO_MXN;
  const formattedMxn = formatCurrency(mxn, "MXN", fractionDigits);
  return { primary, secondary: `≈ ${formattedMxn}` };
}
