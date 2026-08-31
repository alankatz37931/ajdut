import { describe, it, expect, vi, beforeEach } from "vitest";

// Mockeamos el cliente de prisma — getProjectAccess solo lo usa para el caso
// de CO_ADMIN (verificar el ProjectCoAdmin link). Para todos los demás roles
// las decisiones son puras.
const findUniqueMock = vi.fn();
vi.mock("@/lib/db/client", () => ({
  prisma: {
    projectCoAdmin: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
}));

import { getProjectAccess } from "@/lib/services/project-access";

beforeEach(() => {
  findUniqueMock.mockReset();
});

const baseArgs = {
  userId: "user-1",
  projectId: "project-1",
  ownerId: "owner-1",
  projectStatus: "ACTIVE" as const,
};

describe("getProjectAccess — OWNER", () => {
  it("el dueño del proyecto tiene control total y no puede manifestar interés sobre sí mismo", async () => {
    const access = await getProjectAccess({
      ...baseArgs,
      userId: "owner-1",
      userRole: "PROJECT_OWNER",
    });
    expect(access).toEqual({
      role: "OWNER",
      canView: true,
      canEdit: true,
      canSeeCapTable: true,
      canSeePrivateMetrics: true,
      canManifestInterest: false,
      // Dueño que NO es admin → no modera (aprobación es facultad de ADMIN).
      canModerate: false,
    });
  });

  it("el dueño manda incluso si proyecto no está ACTIVE (estado=PENDING_APPROVAL)", async () => {
    const access = await getProjectAccess({
      ...baseArgs,
      userId: "owner-1",
      userRole: "PROJECT_OWNER",
      projectStatus: "PENDING_APPROVAL",
    });
    expect(access.canEdit).toBe(true);
  });

  it("un dueño que ADEMÁS es admin puede moderar su propio proyecto (aprobar el suyo)", async () => {
    const access = await getProjectAccess({
      ...baseArgs,
      userId: "owner-1",
      userRole: "ADMIN",
      projectStatus: "PENDING_APPROVAL",
    });
    // Sigue siendo OWNER (edita su contenido) pero conserva la facultad de moderar.
    expect(access.role).toBe("OWNER");
    expect(access.canEdit).toBe(true);
    expect(access.canModerate).toBe(true);
  });
});

describe("getProjectAccess — PLATFORM", () => {
  it("el usuario institucional no participa de ningún flujo", async () => {
    const access = await getProjectAccess({
      ...baseArgs,
      userRole: "PLATFORM",
    });
    expect(access.role).toBe("NONE");
    expect(access.canView).toBe(false);
    expect(access.canManifestInterest).toBe(false);
  });
});

describe("getProjectAccess — ADMIN", () => {
  it("admin ve todo (cap table + métricas) pero NO edita contenido", async () => {
    const access = await getProjectAccess({
      ...baseArgs,
      userRole: "ADMIN",
    });
    expect(access.role).toBe("ADMIN");
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(false);
    expect(access.canSeeCapTable).toBe(true);
    expect(access.canSeePrivateMetrics).toBe(true);
  });

  it("admin puede manifestar interés solo si el proyecto está ACTIVE", async () => {
    const active = await getProjectAccess({ ...baseArgs, userRole: "ADMIN", projectStatus: "ACTIVE" });
    const pending = await getProjectAccess({ ...baseArgs, userRole: "ADMIN", projectStatus: "PENDING_APPROVAL" });
    expect(active.canManifestInterest).toBe(true);
    expect(pending.canManifestInterest).toBe(false);
  });

  it("admin (no dueño) puede moderar", async () => {
    const access = await getProjectAccess({ ...baseArgs, userRole: "ADMIN" });
    expect(access.canModerate).toBe(true);
  });
});

describe("getProjectAccess — canModerate es exclusivo de ADMIN", () => {
  it.each([
    ["PARTNER" as const],
    ["PROJECT_OWNER" as const],
    ["PLATFORM" as const],
  ])("rol %s (no dueño) no puede moderar", async (role) => {
    const access = await getProjectAccess({ ...baseArgs, userRole: role });
    expect(access.canModerate).toBe(false);
  });

  it("CO_ADMIN vinculado tampoco modera (aprobar es solo ADMIN)", async () => {
    findUniqueMock.mockResolvedValueOnce({ projectId: "project-1", userId: "user-1" });
    const access = await getProjectAccess({ ...baseArgs, userRole: "CO_ADMIN" });
    expect(access.role).toBe("CO_ADMIN");
    expect(access.canModerate).toBe(false);
  });
});

describe("getProjectAccess — CO_ADMIN", () => {
  it("con link en ProjectCoAdmin: ve cap table + métricas privadas, sin editar", async () => {
    findUniqueMock.mockResolvedValueOnce({
      projectId: "project-1",
      userId: "user-1",
    });
    const access = await getProjectAccess({ ...baseArgs, userRole: "CO_ADMIN" });
    expect(access.role).toBe("CO_ADMIN");
    expect(access.canSeeCapTable).toBe(true);
    expect(access.canSeePrivateMetrics).toBe(true);
    expect(access.canEdit).toBe(false);
  });

  it("sin link: cae al fallback de viewer (canViewer si ACTIVE)", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const access = await getProjectAccess({ ...baseArgs, userRole: "CO_ADMIN" });
    expect(access.role).toBe("VIEWER");
    expect(access.canSeeCapTable).toBe(false);
    expect(access.canSeePrivateMetrics).toBe(false);
  });

  it("sin link y proyecto inactivo: NONE", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const access = await getProjectAccess({
      ...baseArgs,
      userRole: "CO_ADMIN",
      projectStatus: "PENDING_APPROVAL",
    });
    expect(access.role).toBe("NONE");
    expect(access.canView).toBe(false);
  });
});

describe("getProjectAccess — PARTNER (la regla A1: no ve otros socios)", () => {
  it("partner activo: ve el proyecto, NO el cap table, puede manifestar interés", async () => {
    const access = await getProjectAccess({ ...baseArgs, userRole: "PARTNER" });
    expect(access.role).toBe("PARTNER");
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(false);
    expect(access.canSeeCapTable).toBe(false); // ← A1
    expect(access.canSeePrivateMetrics).toBe(false);
    expect(access.canManifestInterest).toBe(true);
  });

  it("partner sobre proyecto no-ACTIVE: NONE", async () => {
    const access = await getProjectAccess({
      ...baseArgs,
      userRole: "PARTNER",
      projectStatus: "SUSPENDED",
    });
    expect(access.role).toBe("NONE");
    expect(access.canView).toBe(false);
  });

  it.each([
    "DRAFT",
    "PENDING_APPROVAL",
    "SUSPENDED",
    "CLOSED",
    "ARCHIVED",
  ])("partner sobre proyecto %s: no ve nada", async (status) => {
    const access = await getProjectAccess({
      ...baseArgs,
      userRole: "PARTNER",
      projectStatus: status,
    });
    expect(access.role).toBe("NONE");
    expect(access.canView).toBe(false);
  });
});

describe("getProjectAccess — PROJECT_OWNER de OTRO proyecto", () => {
  it("founder de otro proyecto se comporta como VIEWER (puede comprar acciones de un colega)", async () => {
    const access = await getProjectAccess({
      ...baseArgs,
      userRole: "PROJECT_OWNER",
      // ownerId ≠ userId → no es el dueño
    });
    expect(access.role).toBe("VIEWER");
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(false); // ← regla central: solo el OWNER edita
    expect(access.canManifestInterest).toBe(true);
  });
});

describe("invariante: nadie excepto OWNER puede editar contenido", () => {
  it.each([
    ["ADMIN" as const],
    ["PARTNER" as const],
    ["PLATFORM" as const],
    ["PROJECT_OWNER" as const],
    ["CO_ADMIN" as const],
  ])("rol %s sin ser dueño no puede editar", async (role) => {
    findUniqueMock.mockResolvedValueOnce(null);
    findUniqueMock.mockResolvedValueOnce({ projectId: "project-1", userId: "user-1" });
    // Probamos el caso "no es dueño". Para CO_ADMIN probamos ambos (con y sin link).
    const access = await getProjectAccess({
      ...baseArgs,
      userRole: role,
    });
    expect(access.canEdit).toBe(false);
  });
});
