"use client";

/**
 * FileUpload — adjuntar un archivo o un link público.
 *
 * Diseño:
 *   - Vacío: zona de carga (arrastrar-y-soltar o clic) + campo de URL
 *     visible debajo como alternativa equivalente.
 *   - Cargado: fila compacta con el archivo/link y "quitar".
 *   - Subiendo: barra de progreso gold.
 *
 * Flujo de subida:
 *   1. El usuario suelta/elige un archivo. Validamos size client-side.
 *   2. POST /api/uploads/presign → { uploadUrl, publicUrl, key } | 503.
 *      - 503 "R2_NOT_CONFIGURED" → r2Unavailable: queda solo el campo
 *        de URL manual (la zona de carga no puede funcionar).
 *   3. PUT directo a R2 con XHR (para % de progreso real).
 *   4. Al terminar → onUploaded(publicUrl, key).
 *
 * El componente nunca persiste por sí solo: el caller recibe la URL por
 * `onUploaded` y la mete en su form. "quitar" llama onUploaded("", "").
 */

import { useRef, useState } from "react";
import { GoldUnderline } from "@/components/ui/Floating";

export type FileUploadProps = {
  scope:
    | "profile-photo"
    | "id-photo"
    | "report-attachment"
    | "project-doc"
    | "chat-attachment";
  /** MIME / extensiones para <input type="file"> (e.g. "image/png,.pdf"). */
  accept: string;
  /** Tope client-side (MB). El server vuelve a validar. */
  maxSizeMb: number;
  /** Callback con la URL pública final. Recibe "" cuando se quita. */
  onUploaded: (publicUrl: string, key: string) => void;
  /** URL actual (si ya hay algo cargado), para arrancar en estado lleno. */
  currentUrl?: string;
  /** Etiqueta eyebrow arriba del control. */
  label?: string;
  /** Texto chico debajo de la zona con hints de formato / peso. */
  helperText?: string;
  /** Si true, la fila cargada muestra preview de imagen. */
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
  const [value, setValue] = useState(currentUrl ?? "");
  const [fileName, setFileName] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Fija el valor final y avisa al caller. */
  function commit(url: string, key: string, name: string | null) {
    setValue(url);
    setFileName(name);
    setPreviewBroken(false);
    setState({ kind: "idle" });
    onUploaded(url, key);
  }

  /** Quita el archivo/URL — vuelve a la zona de carga vacía. */
  function clear() {
    setValue("");
    setFileName(null);
    setUrlDraft("");
    setState({ kind: "idle" });
    onUploaded("", "");
  }

  function commitUrl() {
    const url = urlDraft.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      setState({ kind: "error", message: "URL inválida." });
      return;
    }
    setUrlDraft("");
    commit(url, "", null);
  }

  async function handleFile(file: File) {
    setState({ kind: "uploading", progress: 0 });

    // Validación cliente — el server valida igual.
    const maxBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setState({ kind: "error", message: `El archivo supera ${maxSizeMb}MB.` });
      return;
    }

    // 1) Presigned URL.
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
      // R2 no configurado → degradamos al input de URL manual.
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
          file.type || "application/octet-stream"
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
    commit(presigned.publicUrl, presigned.key, file.name);
  }

  function onDrop(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }

  const showThumb = showImagePreview && !previewBroken && value !== "";

  return (
    <div className="space-y-2.5">
      {label && <p className="eyebrow !text-navy">{label}</p>}

      {state.kind === "uploading" ? (
        /* ─── Subiendo ──────────────────────────────────────────── */
        <div className="hairline bg-paper-light p-3.5 space-y-2">
          <p className="eyebrow !text-navy/60">Subiendo… {state.progress}%</p>
          <div className="h-1 w-full bg-paper-dark relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gold transition-[width] duration-150"
              style={{ width: `${state.progress}%` }}
            />
          </div>
        </div>
      ) : value !== "" ? (
        /* ─── Cargado: fila compacta ────────────────────────────── */
        <div className="hairline bg-paper-light flex items-center gap-3 p-3">
          {showThumb ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={value}
              alt="Vista previa"
              onError={() => setPreviewBroken(true)}
              className="w-12 h-12 object-cover hairline shrink-0 bg-paper"
            />
          ) : (
            <FileGlyph />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-sans text-sm text-navy truncate">
              {fileName ?? (showImagePreview ? "Imagen cargada" : value)}
            </p>
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="eyebrow !text-navy/50 hover:!text-gold"
            >
              ver archivo ↗
            </a>
          </div>
          <button
            type="button"
            onClick={clear}
            className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer shrink-0"
          >
            quitar ×
          </button>
        </div>
      ) : (
        /* ─── Vacío: zona de carga + URL ────────────────────────── */
        <>
          {!r2Unavailable && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              className={`w-full border border-dashed flex flex-col items-center justify-center gap-2 px-4 py-8 transition-colors cursor-pointer ${
                dragActive
                  ? "border-gold bg-gold/10"
                  : "border-navy/30 hover:border-navy/50 hover:bg-paper-dark/30"
              }`}
            >
              <UploadGlyph active={dragActive} />
              <span className="font-sans text-sm text-navy/70 pointer-events-none">
                {dragActive
                  ? "Soltá el archivo acá"
                  : "Arrastrá un archivo o hacé clic para elegir"}
              </span>
            </button>
          )}

          {helperText && !r2Unavailable && (
            <p className="eyebrow !text-navy/40">{helperText}</p>
          )}
          {r2Unavailable && (
            <p className="eyebrow !text-navy/60">
              El almacenamiento no está configurado — pegá una URL pública.
            </p>
          )}

          {!r2Unavailable && (
            <div className="flex items-center gap-3">
              <span aria-hidden className="h-px flex-1 bg-navy/15" />
              <span className="eyebrow !text-navy/40">o pegá un link</span>
              <span aria-hidden className="h-px flex-1 bg-navy/15" />
            </div>
          )}

          <div className="relative flex items-center gap-3">
            <input
              type="url"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitUrl();
                }
              }}
              placeholder="https://…"
              className="peer flex-1 min-w-0 bg-transparent border-0 px-0 py-1.5 font-mono text-sm text-navy outline-none placeholder:text-navy/30"
            />
            {urlDraft.trim().length > 0 && (
              <button
                type="button"
                onClick={commitUrl}
                className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer shrink-0"
              >
                usar →
              </button>
            )}
            <span
              aria-hidden
              className="absolute left-0 right-0 bottom-0 h-px bg-navy/30"
            />
            <GoldUnderline />
          </div>
        </>
      )}

      {state.kind === "error" && (
        <p className="eyebrow !text-navy" role="alert">
          {state.message}
        </p>
      )}

      {/* Input de archivo oculto — sin `name`, no se envía en el form. */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = ""; // permite re-elegir el mismo archivo
        }}
      />
    </div>
  );
}

/** Flecha hacia arriba sobre una bandeja — glifo de la zona de carga. */
function UploadGlyph({ active }: { active: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`pointer-events-none ${active ? "text-gold" : "text-navy/40"}`}
      aria-hidden
    >
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M5 16v2.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V16" />
    </svg>
  );
}

/** Glifo de documento para la fila cargada cuando no hay preview de imagen. */
function FileGlyph() {
  return (
    <span className="w-12 h-12 shrink-0 hairline bg-paper flex items-center justify-center">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-navy/40"
        aria-hidden
      >
        <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
        <path d="M14 3v5h5" />
      </svg>
    </span>
  );
}
