"use client";

import { useState, useTransition } from "react";
import { updateNameAction, changePasswordAction } from "./actions";

export function ProfileForm({ initialName }: { initialName: string }) {
  const [fullName, setFullName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
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
      setConfirmPassword("");
      setTimeout(() => setPwSuccess(false), 4000);
    });
  }

  const inputCls =
    "w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-navy focus:outline-none focus:border-navy";

  return (
    <div className="space-y-12 mt-10">
      {/* Datos básicos */}
      <form action={onSubmitName} className="hairline p-6 bg-paper-light space-y-5">
        <p className="eyebrow">Datos básicos</p>

        <div>
          <label htmlFor="fullName" className="eyebrow block mb-2">
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

      {/* Cambio de contraseña */}
      <form action={onSubmitPassword} className="hairline p-6 bg-paper-light space-y-5">
        <p className="eyebrow">Cambiar contraseña</p>

        <div>
          <label htmlFor="currentPassword" className="eyebrow block mb-2">
            Contraseña actual
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="newPassword" className="eyebrow block mb-2">
            Nueva contraseña
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            autoComplete="new-password"
            className={inputCls}
          />
          <p className="mt-2 eyebrow">Mínimo 10 caracteres.</p>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="eyebrow block mb-2">
            Repetir nueva contraseña
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            className={inputCls}
          />
        </div>

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
