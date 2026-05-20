"use client";

import { useState, useTransition, useEffect } from "react";
import type { Dict } from "@/lib/i18n";
import { manifestInterestAction } from "./actions";

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

export function InterestForm({
  projectSlug,
  projectName,
  viewerName,
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
  const [supportKind, setSupportKind] =
    useState<"CAPITAL" | "SPONSOR" | "AMBASSADOR" | "ADVISOR" | "OTHER">("CAPITAL");
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

  function submit(formData: FormData) {
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

  if (success) {
    return (
      <div className="mt-10 hairline p-8 sm:p-10 bg-paper-light max-w-3xl">
        <p className="eyebrow">{dict.successEyebrow}</p>
        <p className="mt-5 font-sans text-h1 text-navy">{dict.successTitle}</p>
        <p className="mt-4 text-navy/75 leading-relaxed max-w-xl">
          {dict.successBody}
        </p>
      </div>
    );
  }

  if (!open) return null;

  if (!pricePerShare) {
    return (
      <form
        action={() => undefined}
        className="mt-10 hairline p-8 sm:p-10 bg-paper-light max-w-3xl"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">{dict.notAvailableYet}</p>
          <button
            type="button"
            onClick={close}
            className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
          >
            {dict.backShort}
          </button>
        </div>
        <p className="mt-5 text-navy/75 leading-relaxed">
          {dict.noValuationBody}
        </p>
      </form>
    );
  }

  return (
    <form
      action={submit}
      className="mt-10 hairline p-6 sm:p-10 bg-paper-light max-w-3xl"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="eyebrow">{dict.title}</p>
          <p className="mt-3 font-sans text-h2 text-navy">{projectName}</p>
        </div>
        <button
          type="button"
          onClick={close}
          disabled={isPending}
          className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer shrink-0"
        >
          {dict.backShort}
        </button>
      </div>

      <div className="mt-7 space-y-5">
        <div>
          <label htmlFor="supportKind" className="eyebrow block mb-2">
            {dict.supportKindLabel}
          </label>
          <select
            id="supportKind"
            name="supportKind"
            value={supportKind}
            onChange={(e) =>
              setSupportKind(
                e.target.value as
                  | "CAPITAL"
                  | "SPONSOR"
                  | "AMBASSADOR"
                  | "ADVISOR"
                  | "OTHER"
              )
            }
            className="w-full border-hairline border-navy/40 bg-paper px-3 py-2.5 font-sans text-sm text-navy focus:outline-none focus:border-navy"
          >
            <option value="CAPITAL">{dict.supportKind.CAPITAL}</option>
            <option value="SPONSOR">{dict.supportKind.SPONSOR}</option>
            <option value="AMBASSADOR">{dict.supportKind.AMBASSADOR}</option>
            <option value="ADVISOR">{dict.supportKind.ADVISOR}</option>
            <option value="OTHER">{dict.supportKind.OTHER}</option>
          </select>
        </div>

        <div>
          <label htmlFor="amount" className="eyebrow block mb-2">
            {dict.amountLabel}
          </label>
          <div className="flex items-stretch hairline bg-paper transition-colors focus-within:border-navy">
            <span className="self-center px-4 font-mono text-lg text-navy/40">
              {currency}
            </span>
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
              className="flex-1 min-w-0 border-l-hairline border-navy/20 px-4 py-2.5 font-mono text-xl text-navy bg-transparent focus:outline-none"
            />
          </div>
        </div>

        <p className="eyebrow !text-navy/40">
          {maxAmount !== null
            ? `${dict.maxOf} ${fmtMoney(maxAmount)} · ${fmtInt(maxShares)} ${dict.sharesShort}`
            : `${dict.maxOf} ${fmtInt(maxShares)} ${dict.sharesAvailableSuffix}`}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-line">
          <div className="bg-paper px-4 py-3">
            <p className="eyebrow !text-navy/40">{dict.equivalentTo}</p>
            <p className="mt-1 font-mono text-base">
              {inputValid ? (
                <span
                  className={
                    overAvailable
                      ? "text-navy/40 line-through"
                      : "text-gold"
                  }
                >
                  {`${fmtInt(computedShares)} ${
                    computedShares === 1 ? dict.sharesSingular : dict.sharesPlural
                  }`}
                </span>
              ) : (
                <span className="text-navy/30">—</span>
              )}
            </p>
            {inputValid && !overAvailable && computedAmount > 0 && (
              <p className="mt-1 eyebrow !text-navy/40">
                {fmtMoney(computedAmount)} {dict.effectiveSuffix}
              </p>
            )}
          </div>
          <div className="bg-paper px-4 py-3">
            <p className="eyebrow !text-navy/40">{dict.pricePerShare}</p>
            <p className="mt-1 font-mono text-base text-navy">
              {fmtMoney(pricePerShare)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-7 hairline-t pt-6">
        <label htmlFor="message" className="eyebrow block mb-2">
          {dict.messageLabel}{" "}
          <span className="!text-navy/40">{dict.messageOptional}</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={3}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`${dict.messagePlaceholderPrefix} ${viewerName.trim() || dict.yourNameFallback} ${dict.messagePlaceholderInfix} ${projectName} ${dict.messagePlaceholderSuffix}`}
          className="w-full resize-none border-hairline border-navy/40 bg-paper px-3 py-2.5 font-sans text-sm text-navy focus:outline-none focus:border-navy"
        />
        <span className="eyebrow mt-2 block !text-navy/40">
          {message.length} / 2000
        </span>
      </div>

      {error && (
        <p className="eyebrow !text-navy mt-5" role="alert">
          {error}
        </p>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-5">
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

      <p className="mt-5 text-xs leading-relaxed text-navy/40 max-w-xl">
        {dict.footerNote}
      </p>
    </form>
  );
}
