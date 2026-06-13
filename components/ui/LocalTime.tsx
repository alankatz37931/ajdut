"use client";

/**
 * Hora local (HH:mm) de un instante ISO, en la zona horaria del navegador.
 *
 * El server no conoce la TZ del viewer: en SSR renderiza la hora del server y
 * el cliente re-pinta con su zona real — `suppressHydrationWarning` silencia
 * ese mismatch esperado.
 */
export function LocalTime({ iso }: { iso: string }) {
  return (
    <span suppressHydrationWarning>
      {new Date(iso).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })}
    </span>
  );
}
