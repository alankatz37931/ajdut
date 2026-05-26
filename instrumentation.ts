/**
 * Next.js instrumentation hook. Se ejecuta una sola vez por proceso en el
 * arranque del servidor (Node y Edge runtimes). Punto de entrada estándar para
 * Sentry / OpenTelemetry / logging estructurado.
 *
 * Por ahora es un stub: existe para que Next.js no se queje de su ausencia y
 * para que la próxima ola de observability pueda enchufar Sentry sin tener
 * que tocar entrypoints de la app. Cuando se active Sentry, este archivo
 * deberá hacer `await import("./sentry.server.config")` según runtime.
 *
 * Ref: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // TODO: habilitar Sentry / structured logging en la próxima ola de infra.
  // Mantener el stub vacío evita el warning de Next.js y deja un anclaje
  // claro para futuras integraciones de observability.
}
