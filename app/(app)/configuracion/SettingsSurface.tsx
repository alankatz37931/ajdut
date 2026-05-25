"use client";

import { useState } from "react";
import type { Dict } from "@/lib/i18n";
import type { Language, PreferredCurrency } from "@/lib/preferences";
import { SettingsForm } from "./SettingsForm";
import {
  HeirsAndValidation,
  type HeirRow,
  type ValidationStateView,
} from "./HeirsAndValidation";

type Props = {
  initialLanguage: Language;
  initialCurrency: PreferredCurrency;
  roleLabel: string;
  initialHeirs: HeirRow[];
  initialValidation: ValidationStateView;
  settingsDict: Dict["settings"];
  heirsDict: Dict["heirs"];
  locale: string;
};

/**
 * Wrapper client que une SettingsForm + HeirsAndValidation en una sola
 * lista visual continua y centraliza el indicador "✓ Guardado" abajo
 * del todo — así no aparece un gap reservado entre secciones.
 */
export function SettingsSurface({
  initialLanguage,
  initialCurrency,
  roleLabel,
  initialHeirs,
  initialValidation,
  settingsDict,
  heirsDict,
  locale,
}: Props) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function flashSaved() {
    setError(null);
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
      <HeirsAndValidation
        initialHeirs={initialHeirs}
        initialValidation={initialValidation}
        dict={heirsDict}
        locale={locale}
        onSaved={flashSaved}
        onError={setError}
      />
      <div className="mt-6 h-4">
        {error && (
          <span className="eyebrow !text-navy" role="alert">
            {error}
          </span>
        )}
        {saved && !error && (
          <span className="eyebrow !text-gold" aria-live="polite">
            {heirsDict.savedTick}
          </span>
        )}
      </div>
    </>
  );
}
