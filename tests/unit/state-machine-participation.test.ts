import { describe, it, expect } from "vitest";
import {
  canTransition,
  nextStatus,
  TRANSITIONS,
  type ParticipationEventType,
} from "@/lib/state-machine/participation";
import type { ParticipationStatus } from "@prisma/client";

describe("canTransition — solo permite transiciones declaradas en TRANSITIONS", () => {
  describe("AVAILABLE", () => {
    it("solo permite LEAD_CREATED", () => {
      expect(canTransition("AVAILABLE", "LEAD_CREATED")).toBe(true);
    });

    it.each<ParticipationEventType>([
      "LEAD_DISMISSED",
      "ASSIGNMENT_VALIDATED",
      "RESALE_LISTED",
      "RESALE_CANCELLED",
      "RESALE_DEAL_CLOSED",
      "TRANSFER_VALIDATED",
      "TRANSFER_REJECTED",
    ])("rechaza %s", (ev) => {
      expect(canTransition("AVAILABLE", ev)).toBe(false);
    });
  });

  describe("IN_NEGOTIATION", () => {
    it("permite LEAD_DISMISSED y ASSIGNMENT_VALIDATED", () => {
      expect(canTransition("IN_NEGOTIATION", "LEAD_DISMISSED")).toBe(true);
      expect(canTransition("IN_NEGOTIATION", "ASSIGNMENT_VALIDATED")).toBe(true);
    });

    it("rechaza LEAD_CREATED (no se puede crear otro lead estando ya en negociación)", () => {
      expect(canTransition("IN_NEGOTIATION", "LEAD_CREATED")).toBe(false);
    });
  });

  describe("ASSIGNED", () => {
    it("solo permite RESALE_LISTED", () => {
      expect(canTransition("ASSIGNED", "RESALE_LISTED")).toBe(true);
    });

    it("no permite LEAD_CREATED (no se puede manifestar interés sobre algo ya asignado a otro dueño)", () => {
      expect(canTransition("ASSIGNED", "LEAD_CREATED")).toBe(false);
    });
  });

  describe("IN_RESALE", () => {
    it("permite cancelar o cerrar deal", () => {
      expect(canTransition("IN_RESALE", "RESALE_CANCELLED")).toBe(true);
      expect(canTransition("IN_RESALE", "RESALE_DEAL_CLOSED")).toBe(true);
    });

    it("no permite re-listar (ya está listada)", () => {
      expect(canTransition("IN_RESALE", "RESALE_LISTED")).toBe(false);
    });
  });

  describe("TRANSFER_PENDING", () => {
    it("admin valida o rechaza la transferencia", () => {
      expect(canTransition("TRANSFER_PENDING", "TRANSFER_VALIDATED")).toBe(true);
      expect(canTransition("TRANSFER_PENDING", "TRANSFER_REJECTED")).toBe(true);
    });
  });
});

describe("nextStatus — destino según el evento", () => {
  it.each<[ParticipationEventType, ParticipationStatus]>([
    ["LEAD_CREATED", "IN_NEGOTIATION"],
    ["LEAD_DISMISSED", "AVAILABLE"],
    ["ASSIGNMENT_VALIDATED", "ASSIGNED"],
    ["RESALE_LISTED", "IN_RESALE"],
    ["RESALE_CANCELLED", "ASSIGNED"],
    ["RESALE_DEAL_CLOSED", "TRANSFER_PENDING"],
    ["TRANSFER_VALIDATED", "ASSIGNED"],
    ["TRANSFER_REJECTED", "IN_RESALE"],
  ])("%s → %s", (ev, expected) => {
    expect(nextStatus(ev)).toBe(expected);
  });
});

describe("Invariantes globales de la state machine", () => {
  it("cada estado en TRANSITIONS tiene al menos un evento legal", () => {
    for (const [status, events] of Object.entries(TRANSITIONS)) {
      expect(events.length, `estado ${status} sin transiciones`).toBeGreaterThan(0);
    }
  });

  it("toda transición declarada termina en un estado conocido", () => {
    const known: ParticipationStatus[] = [
      "AVAILABLE",
      "IN_NEGOTIATION",
      "ASSIGNED",
      "IN_RESALE",
      "TRANSFER_PENDING",
    ];
    for (const events of Object.values(TRANSITIONS)) {
      for (const ev of events) {
        expect(known).toContain(nextStatus(ev));
      }
    }
  });

  it("ningún estado se transiciona a sí mismo (sería redundante)", () => {
    for (const [status, events] of Object.entries(TRANSITIONS) as Array<
      [ParticipationStatus, ParticipationEventType[]]
    >) {
      for (const ev of events) {
        const target = nextStatus(ev);
        // Excepción válida: ASSIGNED → RESALE_CANCELLED → ASSIGNED (loop back),
        // y TRANSFER_PENDING → TRANSFER_REJECTED → IN_RESALE (no es loop a sí mismo).
        // Solo verificamos que ningún estado X tenga un evento que vuelva a X.
        if (status === "ASSIGNED" && ev === "RESALE_LISTED") {
          // ASSIGNED → IN_RESALE (no es self-loop)
          continue;
        }
        expect(
          target,
          `${status} transiciona a sí mismo vía ${ev}`
        ).not.toBe(status);
      }
    }
  });
});
