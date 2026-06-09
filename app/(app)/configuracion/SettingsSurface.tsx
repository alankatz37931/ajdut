"use client";

import { useState } from "react";
import type { Dict } from "@/lib/i18n";
import type { Language, PreferredCurrency } from "@/lib/preferences";
import { SettingsForm } from "./SettingsForm";

type Props = {
  initialLanguage: Language;
  initialCurrency: PreferredCurrency;
  roleLabel: string;
  settingsDict: Dict["settings"];
};

/**
 * Wrapper client de /configuracion. Hoy solo aloja SettingsForm; conservamos
 * el wrapper para mantener un único punto de control sobre el indicador
 * "Guardado" si volvemos a sumar secciones laterales en el futuro.
 */
export function SettingsSurface({
  initialLanguage,
  initialCurrency,
  roleLabel,
  settingsDict,
}: Props) {
  const [saved, setSaved] = useState(false);

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <>
      <SettingsForm
        initialLanguage={initialLanguage}
        initialCurrency={initialCurrency}
        roleLabel={roleLabel}
        dict={settingsDict}
        onSaved={flashSaved}
      />
      <div className="mt-6 h-4">
        {saved && (
          <span className="eyebrow !text-gold" aria-live="polite">
            {settingsDict.saved}
          </span>
        )}
      </div>
    </>
  );
}
