"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { FileUpload } from "@/components/ui/FileUpload";
import { FloatingInput } from "@/components/ui/Floating";
import { updateNameAction, changePasswordAction } from "./actions";

export function ProfileForm({
  initialName,
  initialAlias = "",
  initialAvatarUrl = "",
  initialCountry = "",
  initialPhone = "",
  dict,
}: {
  initialName: string;
  initialAlias?: string;
  initialAvatarUrl?: string;
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
  const [isPending, startTransition] = useTransition();

  const basicsDirty =
    fullName !== savedName ||
    alias !== savedAlias ||
    avatarUrl !== savedAvatarUrl ||
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

  return (
    <div className="hairline bg-paper-light p-5 sm:p-6 mt-2">
      {/* Datos básicos */}
      <form action={onSubmitName} className="space-y-5">
        <p className="eyebrow">{dict.basicsTitle}</p>

        <FloatingInput
          id="fullName"
          label={dict.fullNameLabel}
          value={fullName}
          onChange={setFullName}
          required
        />

        <div>
          <FloatingInput
            id="alias"
            label={`${dict.aliasLabel} ${dict.aliasHint}`}
            value={alias}
            onChange={setAlias}
            maxLength={60}
          />
          <p className="eyebrow !text-navy/40 mt-1.5">{dict.aliasFootnote}</p>
        </div>

        {/* Contacto — país + teléfono. Heredados de la Application al
            aprobar, editables por el dueño. */}
        <div className="pt-4 hairline-t grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <FloatingInput
            id="country"
            label="País"
            value={country}
            onChange={setCountry}
            maxLength={60}
          />
          <FloatingInput
            id="phone"
            type="tel"
            label="Teléfono"
            value={phone}
            onChange={setPhone}
            maxLength={40}
          />
        </div>

        {/* Foto de perfil */}
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

      {/* Cambio de contraseña — separado por una hairline */}
      <form action={onSubmitPassword} className="mt-6 hairline-t pt-6 space-y-5">
        <p className="eyebrow">{dict.changePasswordTitle}</p>

        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <FloatingInput
            id="currentPassword"
            type="password"
            label={dict.currentLabel}
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            required
          />
          <FloatingInput
            id="newPassword"
            type="password"
            label={dict.newLabel}
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            required
          />
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
