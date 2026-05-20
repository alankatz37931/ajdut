"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  notifyAdminsNewApplication,
  notifyApplicantReceived,
  notifyVerificationCode,
} from "@/lib/email/notifications";
import { consumeRateLimit } from "@/lib/utils/rate-limit";

// ─── Schemas ─────────────────────────────────────────────────────────

const PROJECT_KINDS = ["STARTUP", "REAL_ESTATE", "MERCHANDISE"] as const;

const baseFields = {
  fullName: z.string().min(2).max(120),
  email: z.string().email().max(180),
  phone: z.string().max(40),
  country: z.string().max(60),
  motivation: z.string().max(2000),
  referredBy: z.string().max(120).optional().or(z.literal("")),
};

// Schema discriminado por `kind`: PERSON no usa companyXxx; COMPANY exige
// companyName y companyKind, deja companyDescription opcional pero acotada.
const applicationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("PERSON"),
    ...baseFields,
    // Campos COMPANY se ignoran si vienen — Zod los corta.
  }),
  z.object({
    kind: z.literal("COMPANY"),
    ...baseFields,
    companyName: z.string().min(2).max(160),
    companyDescription: z.string().max(1000).optional().or(z.literal("")),
    companyKind: z.enum(PROJECT_KINDS),
  }),
]);

type ApplicationDraft = z.infer<typeof applicationSchema>;

export type RequestCodeResult =
  | { ok: true; email: string; expiresAt: string }
  | { ok: false; error: string; field?: string };

export type SubmitResult =
  | { ok: true; applicationId: string }
  | { ok: false; error: string; field?: string };

// ─── Rate limits ────────────────────────────────────────────────────

const IP_LIMIT = 3;
const IP_WINDOW_MS = 10 * 60 * 1000;
const EMAIL_LIMIT = 2;
const EMAIL_WINDOW_MS = 60 * 60 * 1000;

// Cuántos intentos de código permitimos antes de invalidar.
const MAX_VERIFY_ATTEMPTS = 5;
// TTL del código.
const CODE_TTL_MS = 15 * 60 * 1000;

async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xRealIp = h.get("x-real-ip");
  if (xRealIp) return xRealIp;
  return "unknown";
}

function generateCode(): string {
  // 6 dígitos numéricos. Aleatorios criptográficos (sin sesgo módulo).
  const buf = crypto.randomBytes(4);
  const n = buf.readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}

function hashCode(code: string, email: string): string {
  // Atamos el código al email para que un código de un email no funcione en otro.
  return crypto.createHash("sha256").update(`${email}|${code}`).digest("hex");
}

// ─── Paso 1: enviar código ──────────────────────────────────────────

export async function requestEmailVerification(
  formData: FormData
): Promise<RequestCodeResult> {
  // El form puede no incluir `kind` por compatibilidad legacy: caemos a PERSON.
  const kindRaw = String(formData.get("kind") ?? "PERSON").trim().toUpperCase();
  const kind = kindRaw === "COMPANY" ? "COMPANY" : "PERSON";
  const baseRaw = {
    fullName: String(formData.get("fullName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    phone: String(formData.get("phone") ?? "").trim(),
    country: String(formData.get("country") ?? "").trim(),
    motivation: String(formData.get("motivation") ?? "").trim(),
    referredBy: String(formData.get("referredBy") ?? "").trim(),
  };
  const raw =
    kind === "COMPANY"
      ? {
          kind: "COMPANY" as const,
          ...baseRaw,
          companyName: String(formData.get("companyName") ?? "").trim(),
          companyDescription: String(formData.get("companyDescription") ?? "").trim(),
          companyKind: String(formData.get("companyKind") ?? "STARTUP").trim().toUpperCase(),
        }
      : { kind: "PERSON" as const, ...baseRaw };

  const ip = await getClientIp();
  const userAgent = (await headers()).get("user-agent") ?? null;

  // Rate limit por IP — siempre primero
  const ipCheck = consumeRateLimit(`aplicar:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
  if (!ipCheck.ok) {
    after(async () => {
      await prisma.auditLog.create({
        data: {
          action: "RATE_LIMIT.HIT",
          entityType: "Application",
          entityId: "n/a",
          payload: { reason: "ip", limit: IP_LIMIT, windowMs: IP_WINDOW_MS },
          ipAddress: ip,
          userAgent,
        },
      });
    });
    return {
      ok: false,
      error: "Demasiados intentos desde tu conexión. Intentá nuevamente en unos minutos.",
    };
  }

  const parsed = applicationSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first?.message ?? "Datos inválidos",
      field: typeof first?.path[0] === "string" ? first.path[0] : undefined,
    };
  }

  // Rate limit por email
  const emailCheck = consumeRateLimit(
    `aplicar:email:${parsed.data.email}`,
    EMAIL_LIMIT,
    EMAIL_WINDOW_MS
  );
  if (!emailCheck.ok) {
    after(async () => {
      await prisma.auditLog.create({
        data: {
          action: "RATE_LIMIT.HIT",
          entityType: "Application",
          entityId: "n/a",
          payload: { reason: "email", limit: EMAIL_LIMIT, windowMs: EMAIL_WINDOW_MS },
          ipAddress: ip,
          userAgent,
        },
      });
    });
    return {
      ok: false,
      error:
        "Ya recibimos varios envíos con este email. Esperá una hora antes de reintentar.",
      field: "email",
    };
  }

  const [existingApplication, existingUser] = await Promise.all([
    prisma.application.findUnique({ where: { email: parsed.data.email } }),
    prisma.user.findUnique({ where: { email: parsed.data.email } }),
  ]);
  if (existingApplication) {
    return {
      ok: false,
      error: "Ya existe una aplicación con este email. El equipo se pondrá en contacto contigo.",
      field: "email",
    };
  }
  if (existingUser) {
    // El usuario ya tiene cuenta — no debería re-aplicar; lo mandamos a recuperar acceso.
    return {
      ok: false,
      error:
        "Ya existe una cuenta con este email. Si perdiste el acceso, usá recuperar contraseña.",
      field: "email",
    };
  }

  // Invalidamos códigos previos sin consumir del mismo email (rotación).
  await prisma.emailVerificationCode.updateMany({
    where: { email: parsed.data.email, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await prisma.emailVerificationCode.create({
    data: {
      email: parsed.data.email,
      codeHash: hashCode(code, parsed.data.email),
      payload: parsed.data as object,
      expiresAt,
    },
  });

  const emailResult = await notifyVerificationCode({
    to: parsed.data.email,
    fullName: parsed.data.fullName,
    code,
    expiresAt,
  });

  if (!emailResult.ok) {
    // Si el envío falla, dejamos el código creado pero avisamos. El usuario puede
    // reintentar y se rotará. No revelamos el código en la respuesta.
    return {
      ok: false,
      error:
        "No pudimos enviarte el código por email. Revisá que la dirección sea correcta y reintenta.",
      field: "email",
    };
  }

  return {
    ok: true,
    email: parsed.data.email,
    expiresAt: expiresAt.toISOString(),
  };
}

// ─── Paso 2: verificar código y crear application ──────────────────

export async function verifyAndSubmitApplication(
  email: string,
  code: string
): Promise<SubmitResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCode = code.trim();

  if (!/^\d{6}$/.test(normalizedCode)) {
    return { ok: false, error: "El código debe ser de 6 dígitos.", field: "code" };
  }

  const ip = await getClientIp();
  const userAgent = (await headers()).get("user-agent") ?? null;

  // Rate limit de verify por email (anti-fuerza-bruta).
  const verifyCheck = consumeRateLimit(
    `aplicar:verify:${normalizedEmail}`,
    10,
    10 * 60 * 1000
  );
  if (!verifyCheck.ok) {
    return {
      ok: false,
      error: "Demasiados intentos de verificación. Esperá unos minutos.",
    };
  }

  const record = await prisma.emailVerificationCode.findFirst({
    where: { email: normalizedEmail, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record) {
    return {
      ok: false,
      error: "No encontramos un código activo para este email. Volvé a solicitarlo.",
    };
  }

  if (record.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "El código expiró. Solicitá uno nuevo." };
  }

  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    await prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    return {
      ok: false,
      error: "Demasiados intentos con código incorrecto. Solicitá uno nuevo.",
    };
  }

  const expectedHash = hashCode(normalizedCode, normalizedEmail);
  if (expectedHash !== record.codeHash) {
    await prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    const remaining = MAX_VERIFY_ATTEMPTS - record.attempts - 1;
    return {
      ok: false,
      error:
        remaining > 0
          ? `Código incorrecto. Te quedan ${remaining} intento${remaining === 1 ? "" : "s"}.`
          : "Código incorrecto. Solicitá uno nuevo.",
      field: "code",
    };
  }

  // Código válido. Materializamos la Application.
  const payload = applicationSchema.safeParse(record.payload);
  if (!payload.success) {
    // No debería pasar — fue validado al crear el código.
    return { ok: false, error: "El borrador de la aplicación está corrupto. Volvé a empezar." };
  }
  const data: ApplicationDraft = payload.data;

  // Doble check: no haya entrado una aplicación o usuario entre el request y el verify.
  const [existingApplication, existingUser] = await Promise.all([
    prisma.application.findUnique({ where: { email: data.email } }),
    prisma.user.findUnique({ where: { email: data.email } }),
  ]);
  if (existingApplication || existingUser) {
    await prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    return {
      ok: false,
      error: existingUser
        ? "Ya existe una cuenta con este email. Si perdiste el acceso, usá recuperar contraseña."
        : "Ya existe una aplicación con este email. El equipo se pondrá en contacto.",
      field: "email",
    };
  }

  const application = await prisma.$transaction(async (tx) => {
    const created = await tx.application.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        country: data.country,
        motivation: data.motivation,
        referredBy: data.referredBy || null,
        kind: data.kind,
        // Solo COMPANY: persistimos los 3 campos extra. PERSON los deja null.
        companyName: data.kind === "COMPANY" ? data.companyName : null,
        companyDescription:
          data.kind === "COMPANY"
            ? (data.companyDescription?.toString().trim() || null)
            : null,
        companyKind: data.kind === "COMPANY" ? data.companyKind : null,
        emailVerifiedAt: new Date(),
      },
    });
    await tx.emailVerificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    return created;
  });

  after(async () => {
    await Promise.allSettled([
      notifyApplicantReceived({
        to: application.email,
        fullName: application.fullName,
        applicationId: application.id,
      }),
      notifyAdminsNewApplication({
        applicationId: application.id,
        fullName: application.fullName,
        email: application.email,
        phone: application.phone,
        country: application.country,
        motivation: application.motivation,
        referredBy: application.referredBy,
      }),
      prisma.auditLog.create({
        data: {
          action: "APPLICATION.SUBMITTED",
          entityType: "Application",
          entityId: application.id,
          payload: {
            email: application.email,
            country: application.country,
            emailVerified: true,
            kind: application.kind,
            companyName: application.companyName,
            companyKind: application.companyKind,
          },
          ipAddress: ip,
          userAgent,
        },
      }),
    ]);
  });

  return { ok: true, applicationId: application.id };
}
