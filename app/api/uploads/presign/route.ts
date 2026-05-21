/**
 * POST /api/uploads/presign
 *
 * Emite el token de subida para Vercel Blob (client upload). El browser usa
 * `upload()` de `@vercel/blob/client`, que llama a esta ruta vía `handleUpload`
 * para autorizar la subida y obtener un token de un solo uso; después sube el
 * archivo directo a Blob.
 *
 *   - `onBeforeGenerateToken`: exige sesión y valida scope + tamaño + MIME.
 *   - `onUploadCompleted`: no-op — la persistencia la hace el caller con la
 *     URL pública que devuelve `upload()`.
 *
 * No se persiste nada acá.
 */

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { SCOPE_RULES, isUploadScope } from "@/lib/storage/scopes";

export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        // Solo usuarios con sesión pueden subir archivos.
        await requireSession();

        // El cliente manda { scope } en clientPayload.
        let scope: unknown;
        try {
          scope = clientPayload
            ? (JSON.parse(clientPayload) as { scope?: unknown }).scope
            : undefined;
        } catch {
          scope = undefined;
        }
        if (!isUploadScope(scope)) {
          throw new Error("Scope de upload inválido.");
        }

        const rule = SCOPE_RULES[scope];
        return {
          allowedContentTypes:
            rule.mimeTypes.length > 0 ? [...rule.mimeTypes] : undefined,
          maximumSizeInBytes: rule.maxBytes,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // No-op: el caller persiste la URL devuelta por `upload()`.
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al firmar el upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
