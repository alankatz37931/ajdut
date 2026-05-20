"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { FileUpload } from "@/components/ui/FileUpload";
import { updateNameAction, changePasswordAction } from "./actions";

export function ProfileForm({
  initialName,
  initialAlias = "",
  initialAvatarUrl = "",
  initialIdPhotoUrl = "",
  initialCountry = "",
  initialPhone = "",
  dict,
}: {
  initialName: string;
  initialAlias?: string;
  initialAvatarUrl?: string;
  initialIdPhotoUrl?: string;
  initialCountry?: string;
  initialPhone?: string;
  dict: Dict["profile"];
}) {
  const [fullName, setFullName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [alias, setAlias] = useState(initialAlias);
  const [savedAlias, setSavedAlias] = useState(initialAlias);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [savedAvatarUrl, setSavedAvatarUrl] = useState(initialAvatarUrl);
  const [idPhotoUrl, setIdPhotoUrl] = useState(initialIdPhotoUrl);
  const [savedIdPhotoUrl, setSavedIdPhotoUrl] = useState(initialIdPhotoUrl);
  const [country, setCountry] = useState(initialCountry);
  const [savedCountry, setSavedCountry] = useState(initialCountry);
  const [phone, setPhone] = useState(initialPhone);
  const [savedPhone, setSavedPhone] = useState(initialPhone);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isPending, startTransition] = useTransition();

  const basicsDirty =
    fullName !== savedName ||
    alias !== savedAlias ||
    avatarUrl !== savedAvatarUrl ||
    idPhotoUrl !== savedIdPhotoUrl ||
    country !== savedCountry ||
    phone !== savedPhone;

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
      setSavedAlias(alias);
      setSavedAvatarUrl(avatarUrl);
      setSavedIdPhotoUrl(idPhotoUrl);
      setSavedCountry(country);
      setSavedPhone(phone);
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
        <p className="eyebrow">{dict.basicsTitle}</p>

        <div>
          <label htmlFor="fullName" className="eyebrow block mb-1.5">
            {dict.fullNameLabel}
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

        <div>
          <label htmlFor="alias" className="eyebrow block mb-1.5">
            {dict.aliasLabel}{" "}
            <span className="!text-navy/40">{dict.aliasHint}</span>
          </label>
          <input
            id="alias"
            name="alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            maxLength={60}
            placeholder={dict.aliasPlaceholder}
            className={inputCls}
          />
          <p className="eyebrow !text-navy/40 mt-1.5">
            {dict.aliasFootnote}
          </p>
        </div>

        {/* ─── Contacto (país + teléfono) ───────────────────────────
            Heredados de la Application al aprobar, editables en cualquier
            momento por el dueño. Visibles solo para vos y el equipo de AJDUT. */}
        <div className="pt-4 hairline-t grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="country" className="eyebrow block mb-1.5">
              País
            </label>
            <input
              id="country"
              name="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              maxLength={60}
              placeholder="Ej: Argentina"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="phone" className="eyebrow block mb-1.5">
              Teléfono
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={40}
              placeholder="+54 9 11 ..."
              className={inputCls}
            />
          </div>
        </div>

        {/* ─── Foto de perfil ─────────────────────────────────────── */}
        <div className="pt-4 hairline-t">
          <FileUpload
            scope="profile-photo"
            accept="image/png,image/jpeg,image/webp"
            maxSizeMb={5}
            currentUrl={avatarUrl || undefined}
            onUploaded={(url) => setAvatarUrl(url)}
            label="Foto de perfil"
            helperText="PNG, JPG o WebP. Máximo 5MB."
            showImagePreview
          />
          <input type="hidden" name="avatarUrl" value={avatarUrl} />
        </div>

        {/* ─── Foto de identificación ─────────────────────────────── */}
        <div className="pt-4 hairline-t">
          <FileUpload
            scope="id-photo"
            accept="image/png,image/jpeg,application/pdf"
            maxSizeMb={5}
            currentUrl={idPhotoUrl || undefined}
            onUploaded={(url) => setIdPhotoUrl(url)}
            label="Foto de identificación"
            helperText="Documento de identidad. PNG, JPG o PDF. Máximo 5MB. Visible solo para vos y el equipo de AJDUT (KYC)."
          />
          <input type="hidden" name="idPhotoUrl" value={idPhotoUrl} />
        </div>

        {nameError && (
          <p className="eyebrow !text-navy" role="alert">
            {nameError}
          </p>
        )}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={isPending || !basicsDirty}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? dict.savingBtn : dict.saveBtn}
          </button>
          {nameSuccess && <span className="eyebrow !text-gold">{dict.savedFlag}</span>}
        </div>
      </form>

      {/* Cambio de contraseña — mismo cuadro, separado por una hairline */}
      <form
        action={onSubmitPassword}
        className="mt-6 hairline-t pt-6 space-y-3"
      >
        <p className="eyebrow">{dict.changePasswordTitle}</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="currentPassword" className="eyebrow block mb-1.5">
              {dict.currentLabel}
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
                showLabel={dict.showPasswordAria}
                hideLabel={dict.hidePasswordAria}
              />
            </div>
          </div>

          <div>
            <label htmlFor="newPassword" className="eyebrow block mb-1.5">
              {dict.newLabel}
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
              <EyeBtn
                shown={showNew}
                onToggle={() => setShowNew((v) => !v)}
                showLabel={dict.showPasswordAria}
                hideLabel={dict.hidePasswordAria}
              />
            </div>
          </div>

        </div>

        <p className="eyebrow !text-navy/40">{dict.pwHint}</p>

        {pwError && (
          <p className="eyebrow !text-navy" role="alert">
            {pwError}
          </p>
        )}

        <div className="flex items-center gap-4">
          <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-50">
            {isPending ? dict.changingBtn : dict.changePasswordBtn}
          </button>
          {pwSuccess && <span className="eyebrow !text-gold">{dict.pwChangedFlag}</span>}
        </div>
      </form>
    </div>
  );
}

/** Botón de ojo dentro del input (a la derecha) para ver/ocultar la clave. */
function EyeBtn({
  shown,
  onToggle,
  showLabel,
  hideLabel,
}: {
  shown: boolean;
  onToggle: () => void;
  showLabel: string;
  hideLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? hideLabel : showLabel}
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
