/**
 * Paleta canónica de símbolos geométricos usada por los listados de admin /
 * founder para representar estados (pendiente / parcial / cerrado-positivo /
 * cerrado-negativo / etc.) sin depender de color.
 *
 * Cada página tiene su propio enum de estado (Application, Lead, Milestone,
 * PendingAssignment, ...) y por lo tanto su propio mapa `STATUS_SYMBOL`. Para
 * evitar duplicar los símbolos literales en 5+ archivos, exportamos el
 * palette aquí y los importers arman su map referenciando `SYMBOL.<key>`.
 *
 * Convención visual:
 *   open   ○  estado abierto / sin actividad (PENDING / OPEN / PLANNED)
 *   half   ◐  conversación en curso (CONTACTED)
 *   thrq   ◑  avanzando hacia cierre (INTERVIEWING)
 *   prog   ◐  trabajo en marcha — alias de half para milestones (IN_PROGRESS)
 *   done   ●  cierre positivo (APPROVED / ACHIEVED / CONVERTED)
 *   reject ✕  cierre negativo (REJECTED / CANCELLED / DISMISSED)
 *   delay  ◇  con problemas / atrasado (DELAYED)
 *   expire ▪  caducado por timeout (EXPIRED)
 *   fallback "·" cuando no hay match — los caller usan `?? "·"` al leer.
 */
export const SYMBOL = {
  open: "○",
  half: "◐",
  thrq: "◑",
  prog: "◐",
  done: "●",
  reject: "✕",
  delay: "◇",
  expire: "▪",
  fallback: "·",
} as const;

export type SymbolKey = keyof typeof SYMBOL;
