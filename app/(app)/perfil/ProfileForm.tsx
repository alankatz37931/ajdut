"use client";

import { useState, useTransition } from "react";
import { updateNameAction, changePasswordAction } from "./actions";

export function ProfileForm({ initialName }: { initialName: string }) {
  const [fullName, setFullName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onSubmitName(formData: FormData) {
    setNameError(null);
    setNameSuccess(false);
    startTransition(async () => {
      const r = await updateNameAction(formData);
      if (!r.ok) {
        setNameError(r.error);
        return;
      }
      setSavedName(fullName);
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    });
  }

  function onSubmitPassword(formData: FormData) {
    setPwError(null);
    setPwSuccess(false);
    startTransition(async () => {
      const r = await changePasswordAction(formData);
      if (!r.ok) {
        setPwError(r.error);
        return;
      }
      setPwSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setTimeout(() => setPwSuccess(false), 4000);
    });
  }

  const inputCls =
    "w-full border-hairline border-navy/40 bg-paper px-3 py-1.5 font-sans text-navy focus:outline-none focus:border-navy";

  return (
    <div className="hairline bg-paper-light p-5 sm:p-6 mt-2">
      {/* Datos básicos */}
      <form action={onSubmitName} className="space-y-3">
        <p className="eyebrow">Datos básicos</p>

        <div>
          <label htmlFor="fullName" className="eyebrow block mb-1.5">
            Nombre completo
          </label>
          <input
            id="fullName"
            name="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className={inputCls}
          />
        </div>

        {nameError && (
          <p className="eyebrow !text-navy" role="alert">
            {nameError}
          </p>
        )}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={isPending || fullName === savedName}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? "Guardando…" : "Guardar nombre"}
          </button>
          {nameSuccess && <span className="eyebrow !text-gold">✓ Guardado</span>}
        </div>
      </form>

      {/* Cambio de contraseña — mismo cuadro, separado por una hairline */}
      <form
        action={onSubmitPassword}
        className="mt-6 hairline-t pt-6 space-y-3"
      >
        <p className="eyebrow">Cambiar contraseña</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="currentPassword" className="eyebrow block mb-1.5">
              Actual
            </label>
            <div className="relative">
              <input
                id="currentPassword"
                name="currentPassword"
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={`${inputCls} pr-9`}
              />
              <EyeBtn
                shown={showCurrent}
                onToggle={() => setShowCurrent((v) => !v)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="newPassword" className="eyebrow block mb-1.5">
              Nueva
            </label>
            <div className="relative">
              <input
                id="newPassword"
                name="newPassword"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                className={`${inputCls} pr-9`}
              />
              <EyeBtn shown={showNew} onToggle={() => setShowNew((v) => !v)} />
            </div>
          </div>

        </div>

        <p className="eyebrow !text-navy/40">Mínimo 10 caracteres.</p>

        {pwError && (
          <p className="eyebrow !text-navy" role="alert">
            {pwError}
          </p>
        )}

        <div className="flex items-center gap-4">
          <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-50">
            {isPending ? "Cambiando…" : "Cambiar contraseña"}
          </button>
          {pwSuccess && <span className="eyebrow !text-gold">✓ Contraseña cambiada</span>}
        </div>
      </form>
    </div>
  );
}

/** Botón de ojo dentro del input (a la derecha) para ver/ocultar la clave. */
function EyeBtn({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? "Ocultar contraseña" : "Mostrar contraseña"}
      aria-pressed={shown}
      tabIndex={-1}
      className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-navy/40 hover:text-navy transition-colors"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {shown ? (
          <>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <path d="M1 1l22 22" />
          </>
        ) : (
          <>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </button>
  );
}
