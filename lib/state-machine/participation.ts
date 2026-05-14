import type { ParticipationStatus } from "@prisma/client";

/**
 * Eventos del ciclo de vida de una Participation.
 *
 * Disparados:
 *   - LEAD_CREATED          → PARTNER manifiesta interés sobre una participación AVAILABLE
 *   - LEAD_DISMISSED        → PROJECT_OWNER o ADMIN descarta el lead o expira
 *   - ASSIGNMENT_VALIDATED  → ADMIN valida la asignación inicial (génesis o post-lead)
 *   - RESALE_LISTED         → currentOwner lista la participación en el tablón
 *   - RESALE_CANCELLED      → currentOwner o ADMIN cancela la reventa
 *   - RESALE_DEAL_CLOSED    → currentOwner declara acuerdo offline; pasa a TRANSFER_PENDING
 *   - TRANSFER_VALIDATED    → ADMIN ejecuta el cambio de titularidad (con co-firma si es stake institucional)
 *   - TRANSFER_REJECTED     → ADMIN rechaza la validación; vuelve a IN_RESALE
 */
export type ParticipationEventType =
  | "LEAD_CREATED"
  | "LEAD_DISMISSED"
  | "ASSIGNMENT_VALIDATED"
  | "RESALE_LISTED"
  | "RESALE_CANCELLED"
  | "RESALE_DEAL_CLOSED"
  | "TRANSFER_VALIDATED"
  | "TRANSFER_REJECTED";

export const TRANSITIONS: Record<ParticipationStatus, ParticipationEventType[]> = {
  AVAILABLE: ["LEAD_CREATED"],
  IN_NEGOTIATION: ["LEAD_DISMISSED", "ASSIGNMENT_VALIDATED"],
  ASSIGNED: ["RESALE_LISTED"],
  IN_RESALE: ["RESALE_CANCELLED", "RESALE_DEAL_CLOSED"],
  TRANSFER_PENDING: ["TRANSFER_VALIDATED", "TRANSFER_REJECTED"],
};

export function canTransition(
  from: ParticipationStatus,
  event: ParticipationEventType
): boolean {
  return TRANSITIONS[from]?.includes(event) ?? false;
}

/**
 * Estado de destino dado un evento legal. Para `TRANSFER_VALIDATED` el destino
 * es ASSIGNED bajo un NUEVO dueño — la transición no se "queda" en VALIDADA;
 * VALIDADA es un evento, no un estado.
 */
export function nextStatus(event: ParticipationEventType): ParticipationStatus {
  switch (event) {
    case "LEAD_CREATED":
      return "IN_NEGOTIATION";
    case "LEAD_DISMISSED":
      return "AVAILABLE";
    case "ASSIGNMENT_VALIDATED":
      return "ASSIGNED";
    case "RESALE_LISTED":
      return "IN_RESALE";
    case "RESALE_CANCELLED":
      return "ASSIGNED";
    case "RESALE_DEAL_CLOSED":
      return "TRANSFER_PENDING";
    case "TRANSFER_VALIDATED":
      return "ASSIGNED";
    case "TRANSFER_REJECTED":
      return "IN_RESALE";
  }
}
