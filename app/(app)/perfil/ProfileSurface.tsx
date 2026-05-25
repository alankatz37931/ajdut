"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import type { Dict } from "@/lib/i18n";
import { FloatingInput } from "@/components/ui/Floating";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { changePasswordAction, updateNameAction } from "./actions";

type ProfileDict = Dict["profile"];

type Props = {
  initialName: string;
  initialAlias: string;
  initialCountry: string;
  initialPhone: string;
  initialAvatarUrl: string;
  dict: ProfileDict;
};

/**
 * Superficie completa del perfil — todos los campos viven como filas
 * minimalistas con el mismo lenguaje que /configuracion: label izquierda,
 * valor/input derecha, hairline-b, altura fija 4.75rem. Cada campo guarda
 * en blur (auto-save). Contraseña va en un ToggleRow porque requiere
 * confirmación explícita y dos inputs visibles a la vez.
 */
export function ProfileSurface({
  initialName,
  initialAlias,
  initialCountry,
  initialPhone,
  initialAvatarUrl,
  dict,
}: Props) {
  // Estado de los campos básicos.
  const [name, setName] = useState(initialName);
  const [alias, setAlias] = useState(initialAlias);
  const [country, setCountry] = useState(initialCountry);
  const [phone, setPhone] = useState(initialPhone);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);

  // Snapshots de lo guardado en server — base para detectar cambios y
  // revertir si la acción falla.
  const [savedName, setSavedName] = useState(initialName);
  const [savedAlias, setSavedAlias] = useState(initialAlias);
  const [savedCountry, setSavedCountry] = useState(initialCountry);
  const [savedPhone, setSavedPhone] = useState(initialPhone);
  const [savedAvatarUrl, setSavedAvatarUrl] = useState(initialAvatarUrl);

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [openPassword, setOpenPassword] = useState(false);

  function flashSaved() {
    setError(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  /**
   * Persiste el snapshot actual de campos básicos (con un override puntual
   * para el campo que está cambiando). Si el server rechaza, revierte solo
   * ese campo a su último valor guardado.
   */
  function persistBasics(override: {
    fullName?: string;
    alias?: string;
    country?: string;
    phone?: string;
    avatarUrl?: string;
  }) {
    const fd = new FormData();
    fd.set("fullName", override.fullName ?? name);
    fd.set("alias", override.alias ?? alias);
    fd.set("country", override.country ?? country);
    fd.set("phone", override.phone ?? phone);
    fd.set("avatarUrl", override.avatarUrl ?? avatarUrl);

    startTransition(async () => {
      const r = await updateNameAction(fd);
      if (r.ok) {
        // Sincronizar snapshots con lo enviado.
        setSavedName(override.fullName ?? name);
        setSavedAlias(override.alias ?? alias);
        setSavedCountry(override.country ?? country);
        setSavedPhone(override.phone ?? phone);
        setSavedAvatarUrl(override.avatarUrl ?? avatarUrl);
        flashSaved();
      } else {
        setError(r.error);
        // Revertir el campo que se intentó guardar.
        if (override.fullName !== undefined) setName(savedName);
        if (override.alias !== undefined) setAlias(savedAlias);
        if (override.country !== undefined) setCountry(savedCountry);
        if (override.phone !== undefined) setPhone(savedPhone);
        if (override.avatarUrl !== undefined) setAvatarUrl(savedAvatarUrl);
      }
    });
  }

  function onBlurField(
    current: string,
    saved: string,
    key: "fullName" | "alias" | "country" | "phone"
  ) {
    const trimmed = current.trim();
    if (trimmed === saved) return;
    persistBasics({ [key]: trimmed });
  }

  return (
    <div>
      <div className="hairline-t">
        <InlineRow
          label={dict.fullNameLabel}
          value={name}
          onChange={setName}
          onBlur={() => onBlurField(name, savedName, "fullName")}
          required
        />
        <InlineRow
          label={dict.aliasLabel}
          value={alias}
          onChange={setAlias}
          onBlur={() => onBlurField(alias, savedAlias, "alias")}
          placeholder={dict.empty}
        />
        <InlineRow
          label={dict.countryLabel}
          value={country}
          onChange={setCountry}
          onBlur={() => onBlurField(country, savedCountry, "country")}
          placeholder={dict.empty}
        />
        <InlineRow
          label={dict.phoneLabel}
          value={phone}
          onChange={setPhone}
          onBlur={() => onBlurField(phone, savedPhone, "phone")}
          placeholder={dict.empty}
          type="tel"
        />
        <PhotoRow
          label={dict.photoLabel}
          value={avatarUrl}
          onChange={(url) => {
            setAvatarUrl(url);
            persistBasics({ avatarUrl: url });
          }}
          onError={setError}
          dict={dict}
        />
        <ToggleRow
          label={dict.passwordRow}
          summary={dict.passwordMask}
          open={openPassword}
          onToggle={() => setOpenPassword((v) => !v)}
          ariaLabel={dict.changePasswordTitle}
        >
          <PasswordPanel dict={dict} onSaved={flashSaved} onError={setError} />
        </ToggleRow>
      </div>

      <div className="mt-6 h-4">
        {error && (
          <span className="eyebrow !text-navy" role="alert">
            {error}
          </span>
        )}
        {saved && !error && (
          <span className="eyebrow !text-gold" aria-live="polite">
            {dict.savedFlag}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Fila editable inline: label izquierda + input transparente right-aligned.
 * Mismo h-[4.75rem] que las Row de configuración. Al focus el input sigue
 * sin borde — el cursor del usuario indica edición. Auto-save en blur.
 */
function InlineRow({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="hairline-b flex items-center justify-between h-[4.75rem] gap-6">
      <label className="text-navy shrink-0">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
        className="min-w-0 flex-1 text-right bg-transparent border-0 outline-none text-navy placeholder:text-navy/30"
      />
    </div>
  );
}

/**
 * Fila de foto: label izquierda + avatar (o "+") derecha + acción "quitar"
 * cuando hay foto. Click sobre el avatar abre el file picker; sube directo
 * a Vercel Blob y notifica `onChange` con la URL pública.
 */
function PhotoRow({
  label,
  value,
  onChange,
  onError,
  dict,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  onError: (msg: string | null) => void;
  dict: ProfileDict;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewBroken, setPreviewBroken] = useState(false);

  const MAX_MB = 5;

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

  async function handleFile(file: File) {
    onError(null);
    const maxBytes = MAX_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      onError(dict.uploadTooBig.replace("{n}", String(MAX_MB)));
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
      onChange(blob.url);
    } catch {
      onError(dict.uploadFailed);
    } finally {
      setUploading(false);
    }
  }

  const hasPhoto = value !== "" && !previewBroken;

  return (
    <div className="hairline-b flex items-center justify-between h-[4.75rem] gap-4">
      <span className="text-navy">{label}</span>
      <span className="flex items-center gap-3">
        {uploading ? (
          <span className="eyebrow !text-navy/40 normal-case tracking-normal">
            {dict.uploadingFmt.replace("{n}", String(progress))}
          </span>
        ) : (
          <>
            {hasPhoto && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setPreviewBroken(false);
                }}
                className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
              >
                {dict.removePhoto}
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label={hasPhoto ? dict.uploadAriaChange : dict.uploadAriaNew}
              className="p-0 m-0 border-0 bg-transparent cursor-pointer"
            >
              {hasPhoto ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={value}
                  alt=""
                  onError={() => setPreviewBroken(true)}
                  className="w-9 h-9 rounded-full object-cover hairline"
                />
              ) : (
                <span className="w-9 h-9 rounded-full bg-paper-dark/40 hairline flex items-center justify-center text-navy/40 font-mono text-lg leading-none">
                  +
                </span>
              )}
            </button>
          </>
        )}
      </span>
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

/**
 * Panel de cambio de contraseña — vive dentro del ToggleRow. NO auto-save:
 * requiere ambos campos válidos + confirmación explícita con botón.
 */
function PasswordPanel({
  dict,
  onSaved,
  onError,
}: {
  dict: ProfileDict;
  onSaved: () => void;
  onError: (msg: string | null) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    onError(null);
    startTransition(async () => {
      const r = await changePasswordAction(formData);
      if (!r.ok) {
        onError(r.error);
        return;
      }
      setCurrent("");
      setNext("");
      onSaved();
    });
  }

  return (
    <form action={onSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <FloatingInput
          id="currentPassword"
          type="password"
          label={dict.currentLabel}
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          required
        />
        <FloatingInput
          id="newPassword"
          type="password"
          label={dict.newLabel}
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          required
        />
      </div>

      <p className="eyebrow !text-navy/40">{dict.pwHint}</p>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? dict.changingBtn : dict.changePasswordBtn}
        </button>
      </div>
    </form>
  );
}
