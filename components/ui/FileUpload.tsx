"use client";

/**
 * FileUpload — adjuntar un archivo subiéndolo desde la computadora.
 *
 * Diseño:
 *   - Vacío: zona de carga (arrastrar-y-soltar o clic para elegir).
 *   - Subiendo: barra de progreso gold.
 *   - Cargado: fila compacta con el archivo y "quitar".
 *
 * Sube directo a Vercel Blob con `upload()` de `@vercel/blob/client`: el
 * browser pide un token a /api/uploads/presign (que valida sesión + scope +
 * tamaño/MIME) y sube el archivo directo a Blob.
 *
 * El componente nunca persiste por sí solo: el caller recibe la URL pública
 * por `onUploaded` y la mete en su form. "quitar" llama onUploaded("").
 */

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { GoldUnderline } from "@/components/ui/Floating";
import type { UploadScope } from "@/lib/storage/scopes";

export type FileUploadProps = {
  scope: UploadScope;
  /** MIME / extensiones para <input type="file"> (e.g. "image/png,.pdf"). */
  accept: string;
  /** Tope client-side (MB). El server vuelve a validar. */
  maxSizeMb: number;
  /** Callback con la URL pública. Recibe "" cuando se quita el archivo. */
  onUploaded: (publicUrl: string) => void;
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

/** Slug ASCII simple conservando la extensión — para URLs limpias. */
function slugifyName(original: string): string {
  const dot = original.lastIndexOf(".");
  const name = dot > 0 ? original.slice(0, dot) : original;
  const ext = dot > 0 ? original.slice(dot + 1) : "";
  const clean = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const base = clean(name).slice(0, 80) || "archivo";
  const e = clean(ext).slice(0, 10);
  return e ? `${base}.${e}` : base;
}

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
  const [value, setValue] = useState(currentUrl ?? "");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Quita el archivo — vuelve a la zona de carga vacía. */
  function clear() {
    setValue("");
    setFileName(null);
    setPreviewBroken(false);
    setState({ kind: "idle" });
    onUploaded("");
  }

  async function handleFile(file: File) {
    setState({ kind: "uploading", progress: 0 });

    // Validación cliente — el server valida igual.
    const maxBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setState({ kind: "error", message: `El archivo supera ${maxSizeMb}MB.` });
      return;
    }

    try {
      const blob = await upload(`${scope}/${slugifyName(file.name)}`, file, {
        access: "public",
        handleUploadUrl: "/api/uploads/presign",
        clientPayload: JSON.stringify({ scope }),
        onUploadProgress: (e) => {
          setState({ kind: "uploading", progress: Math.round(e.percentage) });
        },
      });
      setValue(blob.url);
      setFileName(file.name);
      setPreviewBroken(false);
      setState({ kind: "idle" });
      onUploaded(blob.url);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo subir el archivo. Probá de nuevo.";
      setState({ kind: "error", message });
    }
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
        /* ─── Vacío: zona de carga ──────────────────────────────── */
        <>
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
          {helperText && (
            <p className="eyebrow !text-navy/40">{helperText}</p>
          )}
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
