"use client";

/**
 * FileUpload — picker reutilizable que sube a Cloudflare R2 via presigned URL
 * y degrada con gracia a "pegar URL pública" si R2 no está configurado.
 *
 * Flujo:
 *   1. Usuario elige archivo. Validamos size/mime localmente para feedback
 *      inmediato — el server valida igual en /api/uploads/presign.
 *   2. POST a /api/uploads/presign con { scope, filename, contentType, sizeBytes }.
 *      - 503 con "R2_NOT_CONFIGURED" → marcamos `r2Unavailable=true` y NO
 *        reintentamos. El componente muestra SOLO el input URL manual.
 *      - 200 → recibimos { uploadUrl, publicUrl, key }. Hacemos PUT directo
 *        con XHR (para tener % de progreso real).
 *   3. Cuando el PUT termina 2xx, llamamos `onUploaded(publicUrl, key)`.
 *
 * El componente NUNCA persiste por sí solo — el caller recibe la URL y la
 * mete en su action / form.
 *
 * Estados: idle → uploading → done | error  (con fallback: r2Unavailable)
 */

import { useState } from "react";

export type FileUploadProps = {
  scope:
    | "profile-photo"
    | "id-photo"
    | "report-attachment"
    | "project-doc"
    | "chat-attachment";
  /** MIME attr para <input type="file"> (e.g. "image/png,image/jpeg"). */
  accept: string;
  /** Tope client-side (MB). El server vuelve a validar. */
  maxSizeMb: number;
  /** Callback cuando el upload termina ok. Recibe URL pública final. */
  onUploaded: (publicUrl: string, key: string) => void;
  /** URL actual del archivo (si ya hay uno cargado), para preview / fallback input. */
  currentUrl?: string;
  /** Etiqueta visible arriba del control. */
  label?: string;
  /** Texto pequeño debajo del control con hints sobre formatos / pesos. */
  helperText?: string;
  /** Si true, muestra preview de imagen (rounded square 96x96). */
  showImagePreview?: boolean;
};

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
  | { kind: "error"; message: string };

export function FileUpload({
  scope,
  accept,
  maxSizeMb,
  onUploaded,
  currentUrl,
  label,
  helperText,
  showImagePreview = false,
}: FileUploadProps) {
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [r2Unavailable, setR2Unavailable] = useState(false);
  const [manualUrl, setManualUrl] = useState(currentUrl ?? "");
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(
    currentUrl ?? null,
  );

  /** Confirma la URL pegada manualmente (fallback). */
  function commitManualUrl() {
    const url = manualUrl.trim();
    if (url.length === 0) return;
    try {
      // Validación mínima — si no parsea, no se confirma.
      new URL(url);
    } catch {
      setState({ kind: "error", message: "URL inválida." });
      return;
    }
    setUploadedUrl(url);
    setState({ kind: "idle" });
    onUploaded(url, ""); // sin key cuando es URL externa
  }

  async function handleFile(file: File) {
    setState({ kind: "uploading", progress: 0 });

    // Validación cliente — el server valida igual.
    const maxBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setState({
        kind: "error",
        message: `El archivo supera ${maxSizeMb}MB.`,
      });
      return;
    }

    // 1) Pedimos presigned URL.
    let presignRes: Response;
    try {
      presignRes = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        }),
      });
    } catch {
      setState({
        kind: "error",
        message: "No pudimos contactar al servidor para subir el archivo.",
      });
      return;
    }

    if (presignRes.status === 503) {
      // Fallback: R2 no configurado. Mostramos solo el input manual.
      setR2Unavailable(true);
      setState({ kind: "idle" });
      return;
    }

    if (!presignRes.ok) {
      let msg = "No pudimos firmar el upload.";
      try {
        const body = (await presignRes.json()) as { error?: string };
        if (body.error === "FILE_TOO_LARGE") {
          msg = `El archivo supera ${maxSizeMb}MB.`;
        } else if (body.error === "UNSUPPORTED_CONTENT_TYPE") {
          msg = "Tipo de archivo no permitido para este campo.";
        } else if (body.error) {
          msg = body.error;
        }
      } catch {
        /* keep default */
      }
      setState({ kind: "error", message: msg });
      return;
    }

    const presigned = (await presignRes.json()) as {
      uploadUrl: string;
      publicUrl: string;
      key: string;
    };

    // 2) PUT directo con XHR para tener progreso real.
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", presigned.uploadUrl, true);
        xhr.setRequestHeader(
          "Content-Type",
          file.type || "application/octet-stream",
        );
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setState({ kind: "uploading", progress: pct });
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`PUT falló con status ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Error de red durante el upload."));
        xhr.send(file);
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error subiendo el archivo.";
      setState({ kind: "error", message });
      return;
    }

    // 3) Listo.
    setUploadedUrl(presigned.publicUrl);
    setState({ kind: "idle" });
    onUploaded(presigned.publicUrl, presigned.key);
  }

  const inputCls =
    "w-full border-hairline border-navy/40 bg-paper px-3 py-1.5 font-sans text-navy focus:outline-none focus:border-navy";

  // ─── Modo fallback: SOLO input URL manual ─────────────────────────────
  if (r2Unavailable) {
    return (
      <div className="space-y-2">
        {label && <p className="eyebrow">{label}</p>}
        <p className="eyebrow !text-navy/60">
          Storage no configurado; pegá una URL pública.
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://…"
            className={`${inputCls} font-mono text-sm`}
          />
          <button
            type="button"
            onClick={commitManualUrl}
            className="btn-primary disabled:opacity-50"
            disabled={manualUrl.trim().length === 0}
          >
            Usar
          </button>
        </div>
        {uploadedUrl && (
          <p className="eyebrow !text-gold">
            ✓ URL guardada (recordá presionar &quot;Guardar&quot; en el
            formulario).
          </p>
        )}
        {state.kind === "error" && (
          <p className="eyebrow !text-navy" role="alert">
            {state.message}
          </p>
        )}
        {helperText && (
          <p className="eyebrow !text-navy/40">{helperText}</p>
        )}
      </div>
    );
  }

  // ─── Modo normal: picker + preview + fallback secundario ───────────────
  return (
    <div className="space-y-2">
      {label && <p className="eyebrow">{label}</p>}

      {showImagePreview && uploadedUrl && (
        <div className="flex items-center gap-3">
          {/* Preview chiquito. Si no carga (PDF, etc.) cae a un placeholder. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={uploadedUrl}
            alt="Vista previa"
            className="w-24 h-24 rounded-md object-cover border-hairline border-navy/20 bg-paper"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <a
            href={uploadedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="eyebrow hover:!text-gold"
          >
            Ver archivo actual ↗
          </a>
        </div>
      )}

      {!showImagePreview && uploadedUrl && (
        <a
          href={uploadedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="eyebrow hover:!text-gold inline-block"
        >
          Ver archivo actual ↗
        </a>
      )}

      <label className="block">
        <input
          type="file"
          accept={accept}
          disabled={state.kind === "uploading"}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            // limpiá el input para permitir re-elegir el mismo archivo
            e.target.value = "";
          }}
          className="block w-full text-sm text-navy file:mr-3 file:py-1.5 file:px-3 file:border-hairline file:border-navy/40 file:bg-paper file:text-navy file:eyebrow file:cursor-pointer file:hover:bg-paper-dark disabled:opacity-50"
        />
      </label>

      {state.kind === "uploading" && (
        <div className="space-y-1">
          <div className="h-1 w-full bg-paper-dark relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gold transition-[width] duration-150"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <p className="eyebrow !text-navy/60">
            Subiendo… {state.progress}%
          </p>
        </div>
      )}

      {state.kind === "error" && (
        <p className="eyebrow !text-navy" role="alert">
          {state.message}
        </p>
      )}

      {helperText && (
        <p className="eyebrow !text-navy/40">{helperText}</p>
      )}

      {/* Fallback secundario: aunque R2 esté configurado, dejamos el input
          URL manual disponible para que el usuario pueda pegar links externos
          (Drive, Dropbox, etc.) si prefiere. */}
      <details className="mt-2">
        <summary className="eyebrow !text-navy/60 cursor-pointer hover:!text-navy">
          …o pegá una URL pública
        </summary>
        <div className="mt-2 flex gap-2">
          <input
            type="url"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://…"
            className={`${inputCls} font-mono text-sm`}
          />
          <button
            type="button"
            onClick={commitManualUrl}
            className="btn-primary disabled:opacity-50"
            disabled={manualUrl.trim().length === 0}
          >
            Usar
          </button>
        </div>
      </details>
    </div>
  );
}
