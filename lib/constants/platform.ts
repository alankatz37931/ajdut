/**
 * Constantes del usuario institucional AJDUT Platform.
 * Este usuario representa a AJDUT como stakeholder de proyectos legacy donde
 * se acordó participación económica directa. No se autentica; sus credenciales
 * son inutilizables.
 *
 * Para proyectos nuevos, AJDUT NO toma stake institucional por defecto.
 */
export const PLATFORM_USER_EMAIL = "platform@ajdut.internal";
export const PLATFORM_USER_NAME = "AJDUT Platform";
export const PLATFORM_LOCKED_PASSWORD_HASH = "__locked__";

/**
 * Porcentaje del stake institucional por defecto. AJDUT ya NO retiene equity
 * automáticamente en proyectos nuevos: el default es 0%. Si en el futuro se
 * acuerda un stake con un founder específico, se documenta y emite por fuera
 * del flujo de aprobación.
 */
export const DEFAULT_PLATFORM_EQUITY_PERCENT = 0;

/**
 * Tiempo de expiración por defecto de un Lead sin respuesta del founder.
 */
export const LEAD_EXPIRATION_DAYS = 30;

/**
 * TTL de URLs firmadas para descarga de documentos privados.
 */
export const SIGNED_URL_TTL_SECONDS = 15 * 60;
