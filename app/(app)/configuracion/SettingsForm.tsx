"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/lib/i18n";
import { savePreferencesAction } from "./actions";
import type { Language, PreferredCurrency } from "@/lib/preferences";

type Props = {
  initialLanguage: Language;
  initialCurrency: PreferredCurrency;
  roleLabel: string;
  dict: Dict["settings"];
  /** Notifica al wrapper para que muestre el indicador "✓ Guardado". */
  onSaved?: () => void;
};

export function SettingsForm({
  initialLanguage,
  initialCurrency,
  roleLabel,
  dict,
  onSaved,
}: Props) {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [currency, setCurrency] = useState<PreferredCurrency>(initialCurrency);
  const [, startTransition] = useTransition();

  // Guardado instantáneo: cada cambio persiste solo (sin botón). Mismo
  // patrón que el resto de AJDUT (acciones inmediatas, sin "Guardar").
  // El tema queda fijo en "light" — no es elegible por el usuario.
  function persist(next: {
    currency?: PreferredCurrency;
    language?: Language;
  }) {
    const fd = new FormData();
    fd.set("language", next.language ?? language);
    fd.set("currency", next.currency ?? currency);
    fd.set("theme", "light");
    startTransition(async () => {
      const r = await savePreferencesAction(fd);
      if (r.ok) {
        onSaved?.();
        // Si cambió el idioma, refresheamos el server tree para que los
        // diccionarios cargados en server components se recalculen con la
        // nueva cookie.
        if (next.language) {
          router.refresh();
        }
      }
    });
  }

  function pickCurrency(next: PreferredCurrency) {
    setCurrency(next);
    persist({ currency: next });
  }

  function pickLanguage(next: Language) {
    setLanguage(next);
    persist({ language: next });
  }

  return (
    <div className="mt-2">
      <div className="hairline-t">
        <Row label={dict.roleLabel}>
          <span className="eyebrow !text-navy/40">{roleLabel}</span>
        </Row>

        <Row label={dict.currencyLabel}>
          <Segmented
            value={currency}
            options={[
              { value: "USD", content: "USD", aria: dict.currencyUsdAria },
              { value: "MXN", content: "MXN", aria: dict.currencyMxnAria },
            ]}
            onChange={(v) => pickCurrency(v as PreferredCurrency)}
          />
        </Row>

        <Row label={dict.languageLabel}>
          <Segmented
            value={language}
            options={[
              { value: "es", content: "ES", aria: dict.languageEsAria },
              { value: "en", content: "EN", aria: dict.languageEnAria },
            ]}
            onChange={(v) => pickLanguage(v as Language)}
          />
        </Row>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hairline-b flex items-center justify-between h-[4.75rem]">
      <span className="text-navy">{label}</span>
      {children}
    </div>
  );
}

type SegOption = { value: string; content: React.ReactNode; aria: string };

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: SegOption[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="hairline inline-flex overflow-hidden">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-label={opt.aria}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`flex h-9 w-16 items-center justify-center font-mono text-sm transition-colors ${
              active ? "bg-navy text-paper" : "text-navy/60 hover:text-navy"
            }`}
          >
            {opt.content}
          </button>
        );
      })}
    </div>
  );
}
