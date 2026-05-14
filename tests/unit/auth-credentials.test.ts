import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  bcryptCompare: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: { user: mocks.user },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: mocks.bcryptCompare,
    hash: vi.fn(),
  },
}));

import { validateCredentials } from "@/lib/auth/credentials";

function makeUser(overrides: Partial<{
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  deletedAt: Date | null;
  passwordHash: string | null;
}> = {}) {
  return {
    id: "u-1",
    email: "ana@x.com",
    fullName: "Ana Inversor",
    role: "PARTNER",
    isActive: true,
    deletedAt: null,
    passwordHash: "$2b$10$fakehash",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.user.findUnique.mockReset();
  mocks.user.update.mockReset();
  mocks.bcryptCompare.mockReset();
});

describe("validateCredentials — schema (rechazos sin tocar DB)", () => {
  it("rechaza email malformado", async () => {
    const r = await validateCredentials({ email: "no-es-email", password: "passwordlarga" });
    expect(r).toBeNull();
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
  });

  it("rechaza password < 8 caracteres (regla mínima de Auth.js + zod)", async () => {
    const r = await validateCredentials({ email: "ana@x.com", password: "corta" });
    expect(r).toBeNull();
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
  });

  it("rechaza input completamente vacío sin tocar DB", async () => {
    expect(await validateCredentials({})).toBeNull();
    expect(await validateCredentials(null)).toBeNull();
    expect(await validateCredentials(undefined)).toBeNull();
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
  });

  it("normaliza email a lowercase antes de buscar", async () => {
    mocks.user.findUnique.mockResolvedValueOnce(null);
    await validateCredentials({ email: "ANA@X.COM", password: "passwordlarga" });
    expect(mocks.user.findUnique).toHaveBeenCalledWith({
      where: { email: "ana@x.com" },
    });
  });
});

describe("validateCredentials — usuario / cuenta", () => {
  it("usuario no existe → null (sin revelar)", async () => {
    mocks.user.findUnique.mockResolvedValueOnce(null);
    expect(
      await validateCredentials({ email: "ana@x.com", password: "passwordlarga" })
    ).toBeNull();
    expect(mocks.bcryptCompare).not.toHaveBeenCalled();
  });

  it("usuario INACTIVO → null", async () => {
    mocks.user.findUnique.mockResolvedValueOnce(makeUser({ isActive: false }));
    expect(
      await validateCredentials({ email: "ana@x.com", password: "passwordlarga" })
    ).toBeNull();
    expect(mocks.bcryptCompare).not.toHaveBeenCalled();
  });

  it("usuario DELETED (deletedAt seteado) → null", async () => {
    mocks.user.findUnique.mockResolvedValueOnce(makeUser({ deletedAt: new Date() }));
    expect(
      await validateCredentials({ email: "ana@x.com", password: "passwordlarga" })
    ).toBeNull();
    expect(mocks.bcryptCompare).not.toHaveBeenCalled();
  });

  it("rol PLATFORM bloqueado (no es humano real)", async () => {
    mocks.user.findUnique.mockResolvedValueOnce(makeUser({ role: "PLATFORM" }));
    expect(
      await validateCredentials({ email: "platform@ajdut.io", password: "passwordlarga" })
    ).toBeNull();
    expect(mocks.bcryptCompare).not.toHaveBeenCalled();
  });

  it("usuario sin passwordHash (recién aprobado, no completó setup) → null", async () => {
    mocks.user.findUnique.mockResolvedValueOnce(makeUser({ passwordHash: null }));
    expect(
      await validateCredentials({ email: "ana@x.com", password: "passwordlarga" })
    ).toBeNull();
    expect(mocks.bcryptCompare).not.toHaveBeenCalled();
  });
});

describe("validateCredentials — bcrypt", () => {
  it("password INCORRECTA → null", async () => {
    mocks.user.findUnique.mockResolvedValueOnce(makeUser());
    mocks.bcryptCompare.mockResolvedValueOnce(false);

    expect(
      await validateCredentials({ email: "ana@x.com", password: "incorrectopero8" })
    ).toBeNull();
    expect(mocks.user.update).not.toHaveBeenCalled(); // NO se updatea lastLoginAt en fallido
  });

  it("password CORRECTA → devuelve el user con shape de JWT", async () => {
    mocks.user.findUnique.mockResolvedValueOnce(
      makeUser({
        id: "u-123",
        email: "ana@x.com",
        fullName: "Ana Inversor",
        role: "PARTNER",
      })
    );
    mocks.bcryptCompare.mockResolvedValueOnce(true);
    mocks.user.update.mockResolvedValueOnce({});

    const r = await validateCredentials({ email: "ana@x.com", password: "correctapwd" });
    expect(r).toEqual({
      id: "u-123",
      email: "ana@x.com",
      name: "Ana Inversor",
      role: "PARTNER",
    });
  });
});

describe("validateCredentials — efectos del happy path", () => {
  it("actualiza lastLoginAt al loguear con éxito", async () => {
    mocks.user.findUnique.mockResolvedValueOnce(makeUser({ id: "u-x" }));
    mocks.bcryptCompare.mockResolvedValueOnce(true);
    mocks.user.update.mockResolvedValueOnce({});

    await validateCredentials({ email: "ana@x.com", password: "correctapwd" });

    expect(mocks.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u-x" },
        data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
      })
    );
  });

  it("compara contra el hash de la DB, no contra el plain", async () => {
    mocks.user.findUnique.mockResolvedValueOnce(
      makeUser({ passwordHash: "$2b$10$el-hash-real" })
    );
    mocks.bcryptCompare.mockResolvedValueOnce(true);
    mocks.user.update.mockResolvedValueOnce({});

    await validateCredentials({ email: "ana@x.com", password: "passwordreal" });

    expect(mocks.bcryptCompare).toHaveBeenCalledWith("passwordreal", "$2b$10$el-hash-real");
  });
});

describe("validateCredentials — invariantes de seguridad", () => {
  it("la salida nunca incluye passwordHash", async () => {
    mocks.user.findUnique.mockResolvedValueOnce(makeUser());
    mocks.bcryptCompare.mockResolvedValueOnce(true);
    mocks.user.update.mockResolvedValueOnce({});

    const r = await validateCredentials({ email: "ana@x.com", password: "passwordlarga" });
    expect(r).not.toHaveProperty("passwordHash");
  });

  it("todos los caminos de error devuelven exactamente null (no exception, no leak)", async () => {
    const cases: Array<{ desc: string; setup: () => void }> = [
      {
        desc: "user no existe",
        setup: () => mocks.user.findUnique.mockResolvedValueOnce(null),
      },
      {
        desc: "user inactivo",
        setup: () => mocks.user.findUnique.mockResolvedValueOnce(makeUser({ isActive: false })),
      },
      {
        desc: "PLATFORM",
        setup: () => mocks.user.findUnique.mockResolvedValueOnce(makeUser({ role: "PLATFORM" })),
      },
      {
        desc: "sin password",
        setup: () => mocks.user.findUnique.mockResolvedValueOnce(makeUser({ passwordHash: null })),
      },
      {
        desc: "password incorrecta",
        setup: () => {
          mocks.user.findUnique.mockResolvedValueOnce(makeUser());
          mocks.bcryptCompare.mockResolvedValueOnce(false);
        },
      },
    ];

    for (const c of cases) {
      mocks.user.findUnique.mockReset();
      mocks.bcryptCompare.mockReset();
      c.setup();
      const r = await validateCredentials({ email: "ana@x.com", password: "passwordlarga" });
      expect(r, `caso "${c.desc}" debería devolver null`).toBeNull();
    }
  });
});
