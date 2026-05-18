"use client";

import { useState, useTransition } from "react";
import { savePreferencesAction } from "./actions";
import type { Language, PreferredCurrency, Theme } from "@/lib/preferences";

type Props = {
  initialLanguage: Language;
  initialCurrency: PreferredCurrency;
  initialTheme: Theme;
  roleLabel: string;
};

export function SettingsForm({
  initialLanguage,
  initialCurrency,
  initialTheme,
  roleLabel,
}: Props) {
  const [currency, setCurrency] = useState<PreferredCurrency>(initialCurrency);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [savedCurrency, setSavedCurrency] =
    useState<PreferredCurrency>(initialCurrency);
  const [savedTheme, setSavedTheme] = useState<Theme>(initialTheme);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const hasChanges = currency !== savedCurrency || theme !== savedTheme;

  // Preview en vivo del tema; la cookie se persiste al Guardar.
  function pickTheme(next: Theme) {
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  function onSubmit(formData: FormData) {
    setSaved(false);
    startTransition(async () => {
      const r = await savePreferencesAction(formData);
      if (r.ok) {
        setSaved(true);
        setSavedCurrency(currency);
        setSavedTheme(theme);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  return (
    <form action={onSubmit} className="mt-2">
      <input type="hidden" name="language" value={initialLanguage} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="theme" value={theme} />

      <div className="hairline-t">
        <Row label="Rol">
          <span className="eyebrow !text-navy/40">{roleLabel}</span>
        </Row>

        <Row label="Tema">
          <Segmented
            value={theme}
            options={[
              { value: "light", content: <SunIcon />, aria: "Tema claro" },
              { value: "dark", content: <MoonIcon />, aria: "Tema oscuro" },
            ]}
            onChange={(v) => pickTheme(v as Theme)}
          />
        </Row>

        <Row label="Moneda">
          <Segmented
            value={currency}
            options={[
              { value: "USD", content: "USD", aria: "Dólares" },
              { value: "MXN", content: "MXN", aria: "Pesos" },
            ]}
            onChange={(v) => setCurrency(v as PreferredCurrency)}
          />
        </Row>

        <Row label="Idioma">
          <span className="eyebrow !text-navy/40">Español</span>
        </Row>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending || !hasChanges}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? "Guardando…" : "Guardar"}
        </button>
        {saved && <span className="eyebrow !text-gold">✓ Guardado</span>}
      </div>
    </form>
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
    <div className="hairline-b flex items-center justify-between py-5">
      <span className="text-navy">{label}</span>
      {children}
    </div>
  );
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
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
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
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
