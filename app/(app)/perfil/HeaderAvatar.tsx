"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import type { Dict } from "@/lib/i18n";
import { updateAvatarAction } from "./actions";

type ProfileDict = Dict["profile"];

type Props = {
  initialUrl: string;
  dict: ProfileDict;
  /** Notifica al caller para flash global "✓ Guardado" si quiere coordinar. */
  onSaved?: () => void;
};

/** Slug ASCII conservando la extensión — duplicado mínimo de FileUpload. */
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

/**
 * Avatar interactivo del header de /perfil. Sin foto muestra un círculo
 * con "+" centrado; click abre el file picker. Con foto, hover revela un
 * × pequeño en la esquina superior-derecha para quitarla. Sube directo
 * a Vercel Blob y persiste con updateAvatarAction.
 *
 * El placeholder con iniciales del SideNav no aplica acá porque acá el
 * "+ subir" es la affordance principal — las iniciales matarían el
 * call-to-action de upload.
 */
export function HeaderAvatar({ initialUrl, dict, onSaved }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const MAX_MB = 5;
  const hasPhoto = url !== "" && !previewBroken;

  async function handleFile(file: File) {
    setError(null);
    const maxBytes = MAX_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(dict.uploadTooBig.replace("{n}", String(MAX_MB)));
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const blob = await upload(`profile-photo/${slugifyName(file.name)}`, file, {
        access: "public",
        handleUploadUrl: "/api/uploads/presign",
        clientPayload: JSON.stringify({ scope: "profile-photo" }),
        onUploadProgress: (e) => setProgress(Math.round(e.percentage)),
      });
      setPreviewBroken(false);
      setUrl(blob.url);
      persist(blob.url);
    } catch {
      setError(dict.uploadFailed);
    } finally {
      setUploading(false);
    }
  }

  function persist(newUrl: string) {
    startTransition(async () => {
      const r = await updateAvatarAction(newUrl);
      if (!r.ok) {
        setError(r.error);
        setUrl(initialUrl);
      } else {
        onSaved?.();
      }
    });
  }

  function removePhoto() {
    setUrl("");
    setPreviewBroken(false);
    setError(null);
    persist("");
  }

  return (
    <div className="shrink-0">
      <span className="group relative inline-block">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label={hasPhoto ? dict.uploadAriaChange : dict.uploadAriaNew}
          className="block p-0 m-0 border-0 bg-transparent cursor-pointer disabled:cursor-wait"
        >
          {hasPhoto ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={url}
              alt=""
              onError={() => setPreviewBroken(true)}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover hairline"
            />
          ) : (
            <span className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-paper-dark/40 hairline flex items-center justify-center text-navy/40 font-mono text-2xl leading-none">
              +
            </span>
          )}
        </button>

        {hasPhoto && !uploading && (
          <button
            type="button"
            onClick={removePhoto}
            aria-label={dict.removePhoto}
            title={dict.removePhoto}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-paper hairline flex items-center justify-center text-navy/70 hover:text-navy hover:border-navy p-0 m-0 cursor-pointer leading-none transition-opacity duration-150 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          >
            <span aria-hidden className="font-sans text-lg leading-none">
              ×
            </span>
          </button>
        )}
      </span>

      {uploading && (
        <p className="mt-2 eyebrow !text-navy/40 normal-case tracking-normal text-center">
          {dict.uploadingFmt.replace("{n}", String(progress))}
        </p>
      )}
      {error && (
        <p className="mt-2 eyebrow !text-navy text-center" role="alert">
          {error}
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
