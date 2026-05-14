/**
 * Constantes del usuario institucional AJDUT Platform.
 * Este usuario representa a AJDUT como stakeholder del 10% en cada startup.
 * No se autentica; sus credenciales son inutilizables.
 */
export const PLATFORM_USER_EMAIL = "platform@ajdut.internal";
export const PLATFORM_USER_NAME = "AJDUT Platform";
export const PLATFORM_LOCKED_PASSWORD_HASH = "__locked__";

/**
 * Porcentaje estándar del stake institucional. Configurable por proyecto a la baja
 * mediante decisión del Admin (nunca por el founder).
 */
export const DEFAULT_PLATFORM_EQUITY_PERCENT = 10.0;

/**
 * Tiempo de expiración por defecto de un Lead sin respuesta del founder.
 */
export const LEAD_EXPIRATION_DAYS = 30;

/**
 * TTL de URLs firmadas para descarga de documentos privados.
 */
export const SIGNED_URL_TTL_SECONDS = 15 * 60;
