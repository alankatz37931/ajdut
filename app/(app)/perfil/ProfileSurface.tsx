"use client";

import { useRef, useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { FloatingInput, GoldUnderline } from "@/components/ui/Floating";
import { FileUpload } from "@/components/ui/FileUpload";
import { useSafeAction } from "@/components/hooks/useSafeAction";
import {
  changePasswordAction,
  updateIdPhotoAction,
  updateNameAction,
} from "./actions";

type ProfileDict = Dict["profile"];

type Props = {
  initialName: string;
  initialAlias: string;
  initialCountry: string;
  initialPhone: string;
  initialIdPhotoUrl: string;
  dict: ProfileDict;
};

/**
 * Superficie del perfil — cada campo vive como una FieldRow apilada:
 * label arriba (eyebrow), valor abajo (font-sans), y un icono a la
 * derecha (lápiz para editar, check para guardar). Al click del lápiz
 * el valor se reemplaza por un input con underline gold al focus
 * (mismo patrón que FloatingInput). Auto-save al check, blur, o Enter.
 * Esc cancela. Contraseña va expandible (chevron) porque requiere
 * confirmación con dos inputs y botón explícito.
 */
export function ProfileSurface({
  initialName,
  initialAlias,
  initialCountry,
  initialPhone,
  initialIdPhotoUrl,
  dict,
}: Props) {
  const [name, setName] = useState(initialName);
  const [alias, setAlias] = useState(initialAlias);
  const [country, setCountry] = useState(initialCountry);
  const [phone, setPhone] = useState(initialPhone);

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function flashSaved() {
    setError(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  /**
   * Persiste el snapshot completo (con un override puntual para el campo
   * que se está guardando) y actualiza el estado local optimistamente. Si
   * el server falla, revierte solo ese campo. La foto vive aparte en el
   * HeaderAvatar (action dedicada updateAvatarAction).
   */
  function persistField(
    key: "fullName" | "alias" | "country" | "phone",
    newValue: string
  ) {
    const setters = {
      fullName: setName,
      alias: setAlias,
      country: setCountry,
      phone: setPhone,
    } as const;
    const prev = { fullName: name, alias, country, phone };
    const next = { ...prev, [key]: newValue };
    setters[key](newValue);

    const fd = new FormData();
    fd.set("fullName", next.fullName);
    fd.set("alias", next.alias);
    fd.set("country", next.country);
    fd.set("phone", next.phone);

    startTransition(async () => {
      const r = await updateNameAction(fd);
      if (r.ok) flashSaved();
      else {
        setError(r.error);
        setters[key](prev[key]);
      }
    });
  }

  return (
    <div>
      <div className="hairline-t">
        <FieldRow
          label={dict.fullNameLabel}
          value={name}
          required
          onSave={(v) => persistField("fullName", v.trim())}
          dict={dict}
        />
        <FieldRow
          label={dict.aliasLabel}
          value={alias}
          onSave={(v) => persistField("alias", v.trim())}
          dict={dict}
        />
        <FieldRow
          label={dict.countryLabel}
          value={country}
          onSave={(v) => persistField("country", v.trim())}
          dict={dict}
        />
        <FieldRow
          label={dict.phoneLabel}
          value={phone}
          type="tel"
          onSave={(v) => persistField("phone", v.trim())}
          dict={dict}
        />
        <PasswordFieldRow dict={dict} onSaved={flashSaved} onError={setError} />
        <IdPhotoRow
          initialUrl={initialIdPhotoUrl}
          dict={dict}
          onSaved={flashSaved}
          onError={setError}
        />
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

/* ─────────────────────── Iconos ─────────────────────── */

function PencilIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/* ──────────────────────── Filas ──────────────────────── */

/**
 * Fila apilada: label eyebrow arriba, valor (o input) abajo, lápiz/check
 * a la derecha. En idle muestra el valor como texto; al click del lápiz
 * pasa a edición con underline gold y autofocus. Guarda en blur, Enter
 * o click del check. Esc cancela.
 */
function FieldRow({
  label,
  value,
  onSave,
  placeholder,
  type = "text",
  required = false,
  dict,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  dict: ProfileDict;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function commit() {
    setEditing(false);
    if (draft.trim() !== value.trim()) onSave(draft);
  }

  function abandon() {
    setDraft(value);
    setEditing(false);
  }

  const displayValue = value.trim() || dict.empty;

  return (
    <div className="hairline-b py-5 flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <label className="eyebrow !text-navy/50 block">{label}</label>
        <div className="mt-2 relative">
          {editing ? (
            <>
              <input
                ref={inputRef}
                type={type}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commit();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    abandon();
                  }
                }}
                required={required}
                placeholder={placeholder}
                className="peer w-full bg-transparent border-0 outline-none text-navy font-sans placeholder:text-navy/30"
              />
              <GoldUnderline />
            </>
          ) : (
            <p
              className={`font-sans ${
                value.trim() ? "text-navy" : "text-navy/30"
              }`}
            >
              {displayValue}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={editing ? commit : startEdit}
        aria-label={(editing ? dict.saveAriaFmt : dict.editAriaFmt).replace(
          "{field}",
          label
        )}
        className="shrink-0 text-navy/40 hover:text-navy p-0 m-0 border-0 bg-transparent cursor-pointer transition-colors"
      >
        {editing ? <CheckIcon /> : <PencilIcon />}
      </button>
    </div>
  );
}

/**
 * Contraseña — fila apilada con chevron para expandir el panel de cambio.
 * Cuando está colapsada se ve `•••••••` como valor. Al expandir aparece
 * abajo el form con Current/New + botón explícito (no auto-save por
 * tratarse de un cambio crítico).
 */
function PasswordFieldRow({
  dict,
  onSaved,
  onError,
}: {
  dict: ProfileDict;
  onSaved: () => void;
  onError: (msg: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="hairline-b py-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <span className="eyebrow !text-navy/50 block">{dict.passwordRow}</span>
          <p className="mt-2 font-sans text-navy">{dict.passwordMask}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={(open ? dict.collapseAriaFmt : dict.expandAriaFmt).replace(
            "{field}",
            dict.passwordRow
          )}
          className="shrink-0 text-navy/40 hover:text-navy p-0 m-0 border-0 bg-transparent cursor-pointer transition-colors"
        >
          <ChevronIcon open={open} />
        </button>
      </div>

      {open && (
        <div className="mt-4">
          <PasswordPanel dict={dict} onSaved={onSaved} onError={onError} />
        </div>
      )}
    </div>
  );
}

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

/**
 * Foto/scan del documento de identidad — fila apilada con FileUpload
 * embebido. Sin archivo muestra dropzone subtle ("Subí una foto…"). Con
 * archivo muestra la fila compacta del FileUpload (thumbnail + "ver
 * archivo" + "quitar"), persistiendo cualquier cambio inmediatamente vía
 * updateIdPhotoAction. KYC-grade: la URL solo se renderiza en /perfil del
 * propio dueño (y, a futuro, en el panel admin).
 */
function IdPhotoRow({
  initialUrl,
  dict,
  onSaved,
  onError,
}: {
  initialUrl: string;
  dict: ProfileDict;
  onSaved: () => void;
  onError: (msg: string | null) => void;
}) {
  const [url, setUrl] = useState(initialUrl);

  const { run, error } = useSafeAction(updateIdPhotoAction, {
    onSuccess: () => {
      onError(null);
      onSaved();
    },
    onError: (msg) => {
      onError(msg);
      // Revertir UI si el server rechazó la nueva URL.
      setUrl(initialUrl);
    },
  });

  function handleUploaded(newUrl: string) {
    setUrl(newUrl);
    run(newUrl);
  }

  const hasPhoto = url.trim() !== "";

  return (
    <div className="hairline-b py-5">
      <label className="eyebrow !text-navy/50 block">{dict.idPhotoLabel}</label>
      <div className="mt-3">
        <FileUpload
          scope="id-photo"
          accept="image/png,image/jpeg,application/pdf"
          maxSizeMb={5}
          currentUrl={url}
          onUploaded={handleUploaded}
          helperText={hasPhoto ? undefined : dict.idPhotoHelper}
          showImagePreview
          subtle
        />
      </div>
      {error && (
        <p className="mt-2 eyebrow !text-navy" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
