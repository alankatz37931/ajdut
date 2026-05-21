"use client";

import { useState, useTransition, useEffect } from "react";
import type { Dict } from "@/lib/i18n";
import { manifestInterestAction } from "./actions";
import {
  FloatingSelect,
  FloatingTextarea,
  GoldUnderline,
} from "@/components/ui/Floating";

type Props = {
  projectSlug: string;
  projectName: string;
  /** Nombre del usuario logueado, para pre-armar el mensaje. */
  viewerName: string;
  availableShares: number;
  /** Valoración declarada por el founder. */
  valuation: number | null;
  totalShares: number;
  currency: string;
  dict: Dict["interestForm"];
  /** BCP-47 locale para formatear el monto/cantidades acorde al idioma del viewer. */
  locale: string;
};

type SupportKind = "CAPITAL" | "SPONSOR" | "AMBASSADOR" | "ADVISOR" | "OTHER";

export function InterestForm({
  projectSlug,
  projectName,
  availableShares,
  valuation,
  totalShares,
  currency,
  dict,
  locale,
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const check = () => {
      if (window.location.hash === "#comprar") setOpen(true);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  function close() {
    setOpen(false);
    if (window.location.hash === "#comprar") {
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
      window.dispatchEvent(new Event("hashchange"));
    }
  }

  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [supportKind, setSupportKind] = useState<SupportKind>("CAPITAL");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const pricePerShare =
    valuation && totalShares > 0 ? valuation / totalShares : null;

  const amountNumber = Number.parseFloat(amount.replace(/,/g, ""));

  let computedShares = 0;
  let computedAmount = 0;
  let inputValid = false;

  if (Number.isFinite(amountNumber) && amountNumber > 0 && pricePerShare) {
    computedShares = Math.floor(amountNumber / pricePerShare);
    computedAmount = computedShares * pricePerShare;
    inputValid = computedShares >= 1;
  }

  const overAvailable = computedShares > availableShares;
  const maxShares = availableShares;
  const maxAmount = pricePerShare ? maxShares * pricePerShare : null;
  const minAmount = pricePerShare ? pricePerShare : null;

  function fmtMoney(n: number): string {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  }
  function fmtInt(n: number): string {
    return n.toLocaleString(locale);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!pricePerShare) {
      setError(dict.errorNoValuation);
      return;
    }
    if (!inputValid) {
      setError(
        minAmount
          ? `${dict.errorMinAmount} ${fmtMoney(minAmount)} ${dict.errorOneShare}.`
          : dict.errorEnterValid
      );
      return;
    }
    if (overAvailable) {
      setError(
        maxAmount
          ? `${dict.errorOverMax} ${fmtMoney(maxAmount)}.`
          : `${dict.errorMaxShares} ${fmtInt(maxShares)} ${dict.sharesShort}.`
      );
      return;
    }

    const formData = new FormData();
    formData.set("shareCount", String(computedShares));
    formData.set("message", message);
    formData.set("supportKind", supportKind);

    startTransition(async () => {
      const r = await manifestInterestAction(projectSlug, formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(true);
    });
  }

  if (!open && !success) return null;

  if (success) {
    return (
      <div className="w-full pt-8 sm:pt-10 pb-12 max-w-3xl">
        <p className="eyebrow !text-navy/40">{dict.successEyebrow}</p>
        <h1 className="font-sans mt-3 text-h1 text-navy">{dict.successTitle}</h1>
        <p className="mt-4 text-navy/75 leading-relaxed">{dict.successBody}</p>
      </div>
    );
  }

  if (!pricePerShare) {
    return (
      <div className="w-full pt-8 sm:pt-10 pb-12 max-w-3xl">
        <FormHeader eyebrow={dict.notAvailableYet} projectName={projectName} />
        <p className="mt-4 text-navy/75 leading-relaxed">{dict.noValuationBody}</p>
      </div>
    );
  }

  return (
    <div className="w-full pt-8 sm:pt-10 pb-12">
      <FormHeader eyebrow={dict.title} projectName={projectName} />

      {/* 2 columnas: formulario a la izquierda, panel-resumen sticky a la
          derecha — ocupa el ancho completo de la página, no centrado. */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-x-10 xl:gap-x-14 gap-y-8">
        {/* ─── COLUMNA FORM ──────────────────────────────────────── */}
        <form onSubmit={submit} className="min-w-0 space-y-7">
          <FloatingSelect
            id="supportKind"
            label={dict.supportKindLabel}
            value={supportKind}
            onChange={(v) => setSupportKind(v as SupportKind)}
            options={[
              { value: "CAPITAL", label: dict.supportKind.CAPITAL ?? "Capital" },
              { value: "SPONSOR", label: dict.supportKind.SPONSOR ?? "Sponsor" },
              { value: "AMBASSADOR", label: dict.supportKind.AMBASSADOR ?? "Embajador" },
              { value: "ADVISOR", label: dict.supportKind.ADVISOR ?? "Advisor" },
              { value: "OTHER", label: dict.supportKind.OTHER ?? "Otro" },
            ]}
          />

          {/* Monto — campo underline con prefijo de moneda. */}
          <div className="pt-2">
            <label htmlFor="amount" className="block eyebrow !text-navy mb-1.5">
              {dict.amountLabel}
            </label>
            <div className="relative flex items-baseline gap-2.5">
              <span className="font-mono text-lg text-navy/40">{currency}</span>
              <input
                id="amount"
                name="amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                autoFocus
                placeholder={dict.amountPlaceholder}
                className="peer flex-1 min-w-0 bg-transparent border-0 px-0 py-1.5 font-mono text-xl text-navy outline-none placeholder:text-navy/30"
              />
              <span
                aria-hidden
                className="absolute left-0 right-0 bottom-0 h-px bg-navy/30"
              />
              <GoldUnderline />
            </div>
          </div>

          {/* Mensaje al project owner */}
          <FloatingTextarea
            id="message"
            label={`${dict.messageLabel} ${dict.messageOptional}`}
            value={message}
            onChange={setMessage}
            rows={4}
            maxLength={2000}
            counterSuffix=""
          />

          {error && (
            <p className="eyebrow !text-navy" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-5 pt-1">
            <button
              type="submit"
              disabled={isPending || !inputValid || overAvailable}
              className="btn-primary disabled:opacity-50"
            >
              {isPending ? dict.sending : dict.send}
            </button>
            <button
              type="button"
              onClick={close}
              disabled={isPending}
              className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
            >
              {dict.cancel}
            </button>
          </div>
        </form>

        {/* ─── PANEL RESUMEN STICKY ──────────────────────────────── */}
        <aside className="lg:sticky lg:top-6 lg:self-start lg:h-fit space-y-5">
          <div className="hairline bg-paper">
            {/* Equivale a — el dato vivo, se actualiza al tipear el monto. */}
            <div className="p-5 hairline-b">
              <p className="eyebrow !text-navy/40">{dict.equivalentTo}</p>
              <p className="mt-2 font-mono text-2xl leading-none">
                {inputValid ? (
                  <span
                    className={
                      overAvailable
                        ? "text-navy/40 line-through"
                        : "text-gold"
                    }
                  >
                    {fmtInt(computedShares)}
                  </span>
                ) : (
                  <span className="text-navy/30">—</span>
                )}
                {inputValid && (
                  <span className="ml-2 text-sm text-navy/40">
                    {computedShares === 1
                      ? dict.sharesSingular
                      : dict.sharesPlural}
                  </span>
                )}
              </p>
              {inputValid && !overAvailable && computedAmount > 0 && (
                <p className="mt-2 font-mono text-[11px] tracking-wider text-navy/40">
                  {fmtMoney(computedAmount)} {dict.effectiveSuffix}
                </p>
              )}
            </div>
            {/* Precio por acción */}
            <div className="p-5 hairline-b flex items-baseline justify-between gap-3">
              <p className="eyebrow !text-navy/40">{dict.pricePerShare}</p>
              <p className="font-mono text-sm text-navy">
                {fmtMoney(pricePerShare)}
              </p>
            </div>
            {/* Máximo disponible */}
            <div className="p-5 flex items-baseline justify-between gap-3">
              <p className="eyebrow !text-navy/40">{dict.maxOf}</p>
              <p className="font-mono text-sm text-navy text-right">
                {maxAmount !== null ? fmtMoney(maxAmount) : "—"}
                <span className="block eyebrow !text-navy/40 mt-0.5">
                  {fmtInt(maxShares)} {dict.sharesShort}
                </span>
              </p>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-navy/40">
            {dict.footerNote}
          </p>
        </aside>
      </div>
    </div>
  );
}

/**
 * Header compartido de los formularios de la ficha — eyebrow + nombre del
 * proyecto como H1. Sin botón de volver: el form ya tiene "Cancelar".
 */
function FormHeader({
  eyebrow,
  projectName,
}: {
  eyebrow: string;
  projectName: string;
}) {
  return (
    <div className="hairline-b pb-6 sm:pb-7">
      <p className="eyebrow !text-navy/40">{eyebrow}</p>
      <h1 className="font-sans mt-3 text-h1 text-navy">{projectName}</h1>
    </div>
  );
}
