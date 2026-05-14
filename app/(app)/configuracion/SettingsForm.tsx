"use client";

import { useState, useTransition } from "react";
import { savePreferencesAction } from "./actions";
import type { Language, PreferredCurrency } from "@/lib/preferences";

type Props = {
  initialLanguage: Language;
  initialCurrency: PreferredCurrency;
};

export function SettingsForm({ initialLanguage, initialCurrency }: Props) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [currency, setCurrency] = useState<PreferredCurrency>(initialCurrency);
  const [savedCurrency, setSavedCurrency] = useState<PreferredCurrency>(initialCurrency);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const hasChanges = currency !== savedCurrency;

  function onSubmit(formData: FormData) {
    setSaved(false);
    startTransition(async () => {
      const r = await savePreferencesAction(formData);
      if (r.ok) {
        setSaved(true);
        setSavedCurrency(currency);
        // Ocultar después de 4s
        setTimeout(() => setSaved(false), 4000);
      }
    });
  }

  return (
    <form action={onSubmit} className="mt-10 space-y-10">
      {/* Idioma */}
      <section className="space-y-4">
        <div>
          <p className="eyebrow">Idioma</p>
          <p className="mt-2 text-navy/75 leading-relaxed">
            Elegí en qué idioma querés ver AJDUT.
          </p>
        </div>
        <div className="space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="language"
              value="es"
              checked={language === "es"}
              onChange={() => setLanguage("es")}
              className="mt-1"
            />
            <span>
              <span className="text-navy">Español</span>
              <span className="block eyebrow !text-navy/40 mt-1">predeterminado</span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-not-allowed opacity-60">
            <input
              type="radio"
              name="language"
              value="en"
              disabled
              className="mt-1"
            />
            <span>
              <span className="text-navy">English</span>
              <span className="block eyebrow !text-gold mt-1">Próximamente</span>
            </span>
          </label>
        </div>
      </section>

      {/* Moneda */}
      <section className="space-y-4 hairline-t pt-8">
        <div>
          <p className="eyebrow">Moneda preferida</p>
          <p className="mt-2 text-navy/75 leading-relaxed">
            Se usa como predeterminada en los formularios. La moneda real de cada proyecto la define
            su founder y no cambia.
          </p>
        </div>
        <div className="space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="currency"
              value="USD"
              checked={currency === "USD"}
              onChange={() => setCurrency("USD")}
              className="mt-1"
            />
            <span>
              <span className="text-navy">Dólares</span>
              <span className="block eyebrow !text-navy/40 mt-1">USD</span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="currency"
              value="MXN"
              checked={currency === "MXN"}
              onChange={() => setCurrency("MXN")}
              className="mt-1"
            />
            <span>
              <span className="text-navy">Pesos mexicanos</span>
              <span className="block eyebrow !text-navy/40 mt-1">MXN</span>
            </span>
          </label>
        </div>
      </section>

      {/* Toast de confirmación + qué pasa con la preferencia */}
      {saved && (
        <div className="hairline p-4 bg-paper-light" role="status" aria-live="polite">
          <p className="eyebrow !text-gold">✓ Preferencias guardadas</p>
          <p className="mt-2 text-navy/75 text-sm leading-relaxed">
            Idioma: <span className="font-mono text-navy">Español</span>. La interfaz en inglés se
            activará cuando esté disponible.<br />
            Moneda preferida: <span className="font-mono text-navy">{savedCurrency === "MXN" ? "Pesos (MXN)" : "Dólares (USD)"}</span>.
            Se usará como predeterminada en formularios y, cuando agreguemos conversión, para
            mostrar montos en tu moneda.
          </p>
        </div>
      )}

      <div className="hairline-t pt-6 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={isPending || !hasChanges}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? "Guardando…" : "Guardar"}
        </button>
        {!hasChanges && !saved && (
          <span className="eyebrow !text-navy/40">Sin cambios</span>
        )}
      </div>
    </form>
  );
}
