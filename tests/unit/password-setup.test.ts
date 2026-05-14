import { describe, it, expect, vi, beforeEach } from "vitest";

const tx = vi.hoisted(() => ({
  passwordSetupToken: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  user: { update: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    ...tx,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: (cb: any) => cb(tx),
  },
}));

import {
  createPasswordSetupToken,
  inspectToken,
  setPasswordFromToken,
} from "@/lib/services/password-setup";
import bcrypt from "bcryptjs";

beforeEach(() => {
  for (const model of Object.values(tx)) {
    for (const fn of Object.values(model)) {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }
  }
});

describe("createPasswordSetupToken — TTLs según kind", () => {
  it("INITIAL_SETUP → ~72h", async () => {
    tx.passwordSetupToken.create.mockResolvedValueOnce({});
    const before = Date.now();
    const { expiresAt } = await createPasswordSetupToken(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      "u1",
      "INITIAL_SETUP"
    );
    const ttl = expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThan(71.9 * 3600 * 1000);
    expect(ttl).toBeLessThan(72.1 * 3600 * 1000);
  });

  it("RESET → ~1h", async () => {
    tx.passwordSetupToken.create.mockResolvedValueOnce({});
    const before = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { expiresAt } = await createPasswordSetupToken(tx as any, "u1", "RESET");
    const ttl = expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThan(0.9 * 3600 * 1000);
    expect(ttl).toBeLessThan(1.1 * 3600 * 1000);
  });

  it("BOOTSTRAP → ~168h (7 días)", async () => {
    tx.passwordSetupToken.create.mockResolvedValueOnce({});
    const before = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { expiresAt } = await createPasswordSetupToken(tx as any, "u1", "BOOTSTRAP");
    const ttl = expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThan(167.9 * 3600 * 1000);
    expect(ttl).toBeLessThan(168.1 * 3600 * 1000);
  });

  it("guarda SHA-256 del token, no el plain", async () => {
    tx.passwordSetupToken.create.mockResolvedValueOnce({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { token } = await createPasswordSetupToken(tx as any, "u1", "RESET");

    const createCall = tx.passwordSetupToken.create.mock.calls[0]?.[0];
    expect(createCall.data.tokenHash).not.toBe(token); // ← clave: nunca el plain
    expect(createCall.data.tokenHash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
    expect(token.length).toBeGreaterThan(20); // base64url de 32 bytes
  });
});

describe("inspectToken — leer sin consumir", () => {
  it("token no existe → TOKEN_NOT_FOUND", async () => {
    tx.passwordSetupToken.findUnique.mockResolvedValueOnce(null);
    const r = await inspectToken("cualquier-token");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("TOKEN_NOT_FOUND");
  });

  it("token usado → TOKEN_USED", async () => {
    tx.passwordSetupToken.findUnique.mockResolvedValueOnce({
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600 * 1000),
      kind: "RESET",
      user: { id: "u1", email: "a@x.com", fullName: "Ana", role: "PARTNER" },
    });
    const r = await inspectToken("token");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("TOKEN_USED");
  });

  it("token expirado → TOKEN_EXPIRED", async () => {
    tx.passwordSetupToken.findUnique.mockResolvedValueOnce({
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000), // expiró hace 1s
      kind: "RESET",
      user: { id: "u1", email: "a@x.com", fullName: "Ana", role: "PARTNER" },
    });
    const r = await inspectToken("token");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("TOKEN_EXPIRED");
  });

  it("token válido → ok con user + expiresAt", async () => {
    const expiresAt = new Date(Date.now() + 3600 * 1000);
    tx.passwordSetupToken.findUnique.mockResolvedValueOnce({
      usedAt: null,
      expiresAt,
      kind: "INITIAL_SETUP",
      user: { id: "u1", email: "a@x.com", fullName: "Ana", role: "PARTNER" },
    });
    const r = await inspectToken("token");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("INITIAL_SETUP");
      expect(r.user.email).toBe("a@x.com");
      expect(r.expiresAt).toBe(expiresAt);
    }
  });

  it("inspecciona por SHA-256 del token (no el plain)", async () => {
    tx.passwordSetupToken.findUnique.mockResolvedValueOnce(null);
    await inspectToken("plain-token-xyz");

    const findCall = tx.passwordSetupToken.findUnique.mock.calls[0]?.[0];
    expect(findCall.where.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(findCall.where.tokenHash).not.toBe("plain-token-xyz");
  });
});

describe("setPasswordFromToken — consumo atómico", () => {
  it("rechaza password < 10 caracteres", async () => {
    const r = await setPasswordFromToken({
      plainToken: "token",
      newPassword: "corta",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PASSWORD_TOO_SHORT");
  });

  it("rechaza si token no existe", async () => {
    tx.passwordSetupToken.findUnique.mockResolvedValueOnce(null);
    const r = await setPasswordFromToken({
      plainToken: "x",
      newPassword: "passwordlarga",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TOKEN_NOT_FOUND");
  });

  it("rechaza token ya consumido", async () => {
    tx.passwordSetupToken.findUnique.mockResolvedValueOnce({
      id: "t1",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600 * 1000),
      kind: "RESET",
      user: { id: "u1", email: "a@x.com" },
    });
    const r = await setPasswordFromToken({
      plainToken: "x",
      newPassword: "passwordlarga",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TOKEN_USED");
  });

  it("rechaza token expirado", async () => {
    tx.passwordSetupToken.findUnique.mockResolvedValueOnce({
      id: "t1",
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      kind: "RESET",
      user: { id: "u1", email: "a@x.com" },
    });
    const r = await setPasswordFromToken({
      plainToken: "x",
      newPassword: "passwordlarga",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TOKEN_EXPIRED");
  });

  it("happy path: setea passwordHash bcrypteado en User", async () => {
    tx.passwordSetupToken.findUnique.mockResolvedValueOnce({
      id: "t1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      kind: "RESET",
      user: { id: "u1", email: "a@x.com" },
    });

    await setPasswordFromToken({
      plainToken: "x",
      newPassword: "passwordlarga",
    });

    const userUpdate = tx.user.update.mock.calls[0]?.[0];
    expect(userUpdate.where).toEqual({ id: "u1" });
    // El hash es bcrypt, no el plain
    expect(userUpdate.data.passwordHash).not.toBe("passwordlarga");
    expect(userUpdate.data.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt prefix
    // Y bcrypt.compare debe pasar contra el plain
    expect(await bcrypt.compare("passwordlarga", userUpdate.data.passwordHash)).toBe(true);
  });

  it("happy path: marca el token actual como usado", async () => {
    tx.passwordSetupToken.findUnique.mockResolvedValueOnce({
      id: "t1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      kind: "RESET",
      user: { id: "u1", email: "a@x.com" },
    });

    await setPasswordFromToken({
      plainToken: "x",
      newPassword: "passwordlarga",
    });

    const tokenUpdate = tx.passwordSetupToken.update.mock.calls[0]?.[0];
    expect(tokenUpdate.where).toEqual({ id: "t1" });
    expect(tokenUpdate.data.usedAt).toBeInstanceOf(Date);
  });

  it("INVALIDA otros tokens activos del mismo usuario (defense in depth)", async () => {
    tx.passwordSetupToken.findUnique.mockResolvedValueOnce({
      id: "t1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      kind: "RESET",
      user: { id: "u1", email: "a@x.com" },
    });

    await setPasswordFromToken({
      plainToken: "x",
      newPassword: "passwordlarga",
    });

    expect(tx.passwordSetupToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u1",
          id: { not: "t1" },
          usedAt: null,
        }),
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      })
    );
  });

  it("registra USER.CREATED en audit con event=PASSWORD_SET", async () => {
    tx.passwordSetupToken.findUnique.mockResolvedValueOnce({
      id: "t1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      kind: "RESET",
      user: { id: "u1", email: "a@x.com" },
    });

    await setPasswordFromToken({
      plainToken: "x",
      newPassword: "passwordlarga",
    });

    const auditCall = tx.auditLog.create.mock.calls[0]?.[0];
    expect(auditCall.data.action).toBe("USER.CREATED");
    expect((auditCall.data.payload as { event: string }).event).toBe("PASSWORD_SET");
  });
});
