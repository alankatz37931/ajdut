"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  notifyAdminsNewApplication,
  notifyApplicantReceived,
} from "@/lib/email/notifications";
import { getDict } from "@/lib/i18n";
import { consumeRateLimit } from "@/lib/utils/rate-limit";

// ─── Schemas ─────────────────────────────────────────────────────────

const PROJECT_KINDS = ["STARTUP", "REAL_ESTATE", "MERCHANDISE", "OTHER"] as const;

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
  }),
  z.object({
    kind: z.literal("COMPANY"),
    ...baseFields,
    companyName: z.string().min(2).max(160),
    companyDescription: z.string().max(1000).optional().or(z.literal("")),
    companyKind: z.enum(PROJECT_KINDS),
  }),
]);

export type SubmitResult =
  | { ok: true; applicationId: string }
  | { ok: false; error: string; field?: string };

// ─── Rate limits ────────────────────────────────────────────────────

const IP_LIMIT = 3;
const IP_WINDOW_MS = 10 * 60 * 1000;
const EMAIL_LIMIT = 2;
const EMAIL_WINDOW_MS = 60 * 60 * 1000;

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

// ─── Envío directo de la aplicación ─────────────────────────────────
//
// Decisión de producto: no verificamos el email del aplicante antes de
// crear la Application. El admin valida manualmente cada aplicación, así
// que la verificación por código era fricción sin valor (un email falso
// queda rechazado en revisión, no expone nada sensible).
//
// Mantenemos el rate-limit por IP y por email como anti-abuso.

export async function submitApplication(
  formData: FormData
): Promise<SubmitResult> {
  // Mensajes de error localizados — server action, puede leer la cookie de idioma.
  const errDict = (await getDict()).apply.errors;
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
      error: errDict.tooManyAttemptsIp,
    };
  }

  const parsed = applicationSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = typeof first?.path[0] === "string" ? first.path[0] : undefined;
    // Mensaje declarativo del dict según el campo — nunca el mensaje crudo de Zod.
    const error =
      field === "email"
        ? errDict.emailInvalid
        : field === "fullName"
          ? errDict.fullNameInvalid
          : field === "companyName"
            ? errDict.companyNameInvalid
            : errDict.fieldInvalid;
    return { ok: false, error, field };
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
      error: errDict.tooManyAttemptsEmail,
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
      error: errDict.alreadyApplied,
      field: "email",
    };
  }
  if (existingUser) {
    return {
      ok: false,
      error: errDict.accountExists,
      field: "email",
    };
  }

  const data = parsed.data;
  const application = await prisma.application.create({
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
      // Sin verificación: emailVerifiedAt queda null. El admin valida en revisión.
      emailVerifiedAt: null,
    },
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
            emailVerified: false,
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
