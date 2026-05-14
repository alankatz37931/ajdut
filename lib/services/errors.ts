/**
 * Errores de dominio de AJDUT.
 *
 * Cada error tiene un `code` machine-readable y un `message` legible.
 * Las invariantes violadas usan códigos `INVARIANT_<NN>_<NOMBRE>` para
 * que se puedan correlacionar con la documentación del schema.
 */

export class DomainError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super("NOT_FOUND", `${entity} no encontrado: ${id}`, { entity, id });
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(reason: string) {
    super("FORBIDDEN", reason);
    this.name = "ForbiddenError";
  }
}

export class InvariantViolation extends DomainError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(`INVARIANT_${code}`, message, details);
    this.name = "InvariantViolation";
  }
}

export class IllegalTransition extends DomainError {
  constructor(from: string, event: string, to?: string) {
    const message = to
      ? `Transición ilegal: ${from} → ${to} vía ${event}`
      : `Evento ${event} no aplicable desde estado ${from}`;
    super("ILLEGAL_TRANSITION", message, { from, event, to });
    this.name = "IllegalTransition";
  }
}

export class ValidationError extends DomainError {
  constructor(field: string, message: string) {
    super("VALIDATION", message, { field });
    this.name = "ValidationError";
  }
}
