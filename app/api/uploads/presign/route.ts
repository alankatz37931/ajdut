/**
 * POST /api/uploads/presign
 *
 * Pide al server una presigned URL para subir un archivo directo a R2 desde
 * el browser. El cliente le pasa { scope, filename, contentType, sizeBytes }
 * y el server responde con { uploadUrl, publicUrl, key } o un error.
 *
 * Diseño:
 *   - 401 si no hay sesión.
 *   - 503 con { error: "R2_NOT_CONFIGURED" } si las env vars de R2 no están
 *     seteadas. El FileUpload del cliente interpreta ese 503 y degrada al
 *     input de URL manual (la UX que el repo ya tenía).
 *   - 400 con un código semántico si la validación falla (size/type/scope).
 *
 * NO se persiste nada acá: la persistencia del `publicUrl` la hace el caller
 * en su action (updateNameAction agregando avatarUrl/idPhotoUrl, etc.).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import {
  isR2Configured,
  createPresignedUploadUrl,
  generateUploadKey,
  type UploadScope,
} from "@/lib/storage/r2";

const MB = 1024 * 1024;

/** Tabla de validación por scope: tamaño máximo + content-types permitidos. */
const SCOPE_RULES: Record<
  UploadScope,
  { maxBytes: number; mimeTypes: readonly string[] }
> = {
  "profile-photo": {
    maxBytes: 5 * MB,
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
  },
  "id-photo": {
    maxBytes: 5 * MB,
    mimeTypes: ["image/png", "image/jpeg", "application/pdf"],
  },
  "report-attachment": {
    maxBytes: 25 * MB,
    mimeTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
      "application/msword", // .doc
      "image/png",
      "image/jpeg",
    ],
  },
  "project-doc": {
    maxBytes: 25 * MB,
    mimeTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "image/png",
      "image/jpeg",
    ],
  },
  // Chat permite cualquier mime (con tope de tamaño) — el composer ya filtra
  // ejecutables a nivel UI cuando se agregue.
  "chat-attachment": {
    maxBytes: 25 * MB,
    mimeTypes: [], // [] === "cualquier mime válido"
  },
};

const requestSchema = z.object({
  scope: z.enum([
    "profile-photo",
    "id-photo",
    "report-attachment",
    "project-doc",
    "chat-attachment",
  ]),
  filename: z.string().min(1).max(256),
  contentType: z.string().min(1).max(256),
  sizeBytes: z.number().int().positive(),
});

export async function POST(req: Request) {
  const user = await requireSession();

  // Graceful fallback: si R2 no está configurado, devolvemos 503 explícito.
  // El cliente lo interpreta y cae al input de URL manual.
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_PAYLOAD", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { scope, filename, contentType, sizeBytes } = parsed.data;
  const rule = SCOPE_RULES[scope];

  if (sizeBytes > rule.maxBytes) {
    return NextResponse.json(
      {
        error: "FILE_TOO_LARGE",
        maxBytes: rule.maxBytes,
        gotBytes: sizeBytes,
      },
      { status: 400 },
    );
  }

  if (rule.mimeTypes.length > 0 && !rule.mimeTypes.includes(contentType)) {
    return NextResponse.json(
      {
        error: "UNSUPPORTED_CONTENT_TYPE",
        contentType,
        allowed: rule.mimeTypes,
      },
      { status: 400 },
    );
  }

  const key = generateUploadKey({
    scope,
    userId: user.id,
    originalName: filename,
  });

  try {
    const presigned = await createPresignedUploadUrl({
      key,
      contentType,
      expiresSeconds: 300,
    });
    return NextResponse.json(presigned, { status: 200 });
  } catch (err) {
    // Si llegamos acá con isR2Configured() === true, lo más probable es
    // credenciales inválidas o un endpoint roto. Devolvemos 500 — el caller
    // no puede recuperar solo.
    const message =
      err instanceof Error ? err.message : "Error firmando upload.";
    return NextResponse.json(
      { error: "PRESIGN_FAILED", message },
      { status: 500 },
    );
  }
}
