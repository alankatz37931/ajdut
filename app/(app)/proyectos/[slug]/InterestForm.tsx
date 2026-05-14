"use client";

import { useState, useTransition } from "react";
import { manifestInterestAction } from "./actions";

type Props = {
  projectSlug: string;
  availableShares: number;
  /** Pre-money valuation declarada por el founder. */
  valuation: number | null;
  totalShares: number;
  currency: string;
};

type Mode = "amount" | "shares";

export function InterestForm({
  projectSlug,
  availableShares,
  valuation,
  totalShares,
  currency,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("amount");
  const [amount, setAmount] = useState("");
  const [shares, setShares] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Precio por acción derivado de la valoración declarada.
  // Si no hay valoración, fuerza modo "shares" (no se puede convertir).
  const pricePerShare =
    valuation && totalShares > 0 ? valuation / totalShares : null;
  const canUseAmountMode = pricePerShare !== null;
  const activeMode: Mode = canUseAmountMode ? mode : "shares";

  // Cálculo según el modo activo
  const amountNumber = Number.parseFloat(amount.replace(/,/g, ""));
  const sharesNumber = Number.parseInt(shares, 10);

  let computedShares = 0;
  let computedAmount = 0;
  let inputValid = false;

  if (activeMode === "amount") {
    if (Number.isFinite(amountNumber) && amountNumber > 0 && pricePerShare) {
      computedShares = Math.floor(amountNumber / pricePerShare);
      computedAmount = computedShares * pricePerShare;
      inputValid = computedShares >= 1;
    }
  } else {
    if (Number.isFinite(sharesNumber) && sharesNumber >= 1) {
      computedShares = sharesNumber;
      computedAmount = pricePerShare ? sharesNumber * pricePerShare : 0;
      inputValid = true;
    }
  }

  const overAvailable = computedShares > availableShares;
  const maxShares = availableShares;
  const maxAmount = pricePerShare ? maxShares * pricePerShare : null;
  const minAmount = pricePerShare ? pricePerShare : null;

  // Etiqueta amigable para la moneda
  const moneyLabel = currency === "MXN" ? "Pesos" : "Dólares";

  function fmtMoney(n: number): string {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  }
  function fmtInt(n: number): string {
    return n.toLocaleString("es-MX");
  }

  function submit(formData: FormData) {
    setError(null);

    if (!inputValid) {
      if (activeMode === "amount") {
        setError(
          minAmount
            ? `Mínimo: ${fmtMoney(minAmount)} (1 acción).`
            : "Ingresá un monto válido."
        );
      } else {
        setError("Ingresá una cantidad de acciones válida (mínimo 1).");
      }
      return;
    }
    if (overAvailable) {
      setError(
        activeMode === "amount" && maxAmount
          ? `El monto excede lo disponible. Máximo: ${fmtMoney(maxAmount)}.`
          : `Máximo disponible: ${fmtInt(maxShares)} acciones.`
      );
      return;
    }

    formData.set("shareCount", String(computedShares));
    formData.set("message", message);

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
      <div className="hairline p-6 bg-paper-light">
        <p className="eyebrow">Interés registrado</p>
        <p className="mt-3 font-sans text-h2 text-navy">Gracias.</p>
        <p className="mt-3 text-navy/75 leading-relaxed">
          El founder del proyecto recibió tu interés. Si avanza, te va a contactar al email con el
          que estás registrado en AJDUT.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="hairline p-6 bg-paper-light">
        <p className="eyebrow">Te interesa este proyecto</p>
        <p className="mt-3 text-navy leading-relaxed">
          Si los números y la idea cierran para vos, podés manifestar tu interés en comprar
          acciones. El founder revisa los pedidos y se pone en contacto. El cierre se realiza por
          fuera de AJDUT.
        </p>
        <button onClick={() => setOpen(true)} className="btn-primary mt-6">
          Quiero comprar acciones →
        </button>
      </div>
    );
  }

  return (
    <form action={submit} className="hairline p-6 bg-paper-light space-y-6">
      <p className="eyebrow">Manifestar interés</p>

      {/* Toggle de modo */}
      {canUseAmountMode && (
        <div>
          <p className="eyebrow block mb-2">Calcular en</p>
          <div className="inline-flex hairline">
            <button
              type="button"
              onClick={() => setMode("shares")}
              className={`px-4 py-2 eyebrow leading-none transition-colors cursor-pointer ${
                activeMode === "shares"
                  ? "bg-navy !text-paper"
                  : "bg-transparent hover:!text-navy"
              }`}
            >
              Acciones
            </button>
            <button
              type="button"
              onClick={() => setMode("amount")}
              className={`px-4 py-2 eyebrow leading-none transition-colors border-l-hairline border-navy/30 cursor-pointer ${
                activeMode === "amount"
                  ? "bg-navy !text-paper"
                  : "bg-transparent hover:!text-navy"
              }`}
            >
              {moneyLabel}
            </button>
          </div>
        </div>
      )}

      {/* Input — varía según modo */}
      {activeMode === "amount" ? (
        <div>
          <label htmlFor="amount" className="eyebrow block mb-2">
            ¿Cuánto querés invertir?
          </label>
          <div className="flex items-stretch gap-0 hairline bg-paper">
            <span className="px-3 py-2 eyebrow !text-navy/60 border-r-hairline border-navy/30 leading-none self-center">
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
              placeholder="0.00"
              className="flex-1 min-w-0 px-3 py-2 font-mono text-navy bg-transparent focus:outline-none"
            />
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor="shares" className="eyebrow block mb-2">
            ¿Cuántas acciones?
          </label>
          <input
            id="shares"
            name="shares"
            type="number"
            min={1}
            step={1}
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            required
            autoFocus
            placeholder="0"
            className="w-full hairline bg-paper px-3 py-2 font-mono text-navy focus:outline-none focus:border-navy"
          />
        </div>
      )}

      {/* Equivalencia en vivo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-sm hairline-t pt-4">
        <p className="text-navy/75">
          <span className="eyebrow !text-navy/40">
            {activeMode === "amount" ? "Equivale a" : "Monto aproximado"}
          </span>
          <br />
          {inputValid ? (
            <span className={overAvailable ? "text-navy/50 line-through" : "text-navy"}>
              {activeMode === "amount"
                ? `${fmtInt(computedShares)} ${computedShares === 1 ? "acción" : "acciones"}`
                : pricePerShare
                ? fmtMoney(computedAmount)
                : "—"}
            </span>
          ) : (
            <span className="text-navy/40">—</span>
          )}
        </p>
        <p className="text-navy/75">
          <span className="eyebrow !text-navy/40">Precio por acción</span>
          <br />
          {pricePerShare ? (
            <span className="text-navy">{fmtMoney(pricePerShare)}</span>
          ) : (
            <span className="text-navy/40">no informado</span>
          )}
        </p>
      </div>

      <p className="eyebrow">
        {activeMode === "amount" && maxAmount !== null
          ? `Máximo ${fmtMoney(maxAmount)} (${fmtInt(maxShares)} acciones disponibles)`
          : `Máximo ${fmtInt(maxShares)} acciones disponibles`}
      </p>

      {/* Mensaje opcional */}
      <div>
        <label htmlFor="message" className="eyebrow block mb-2">
          Mensaje al founder <span className="!text-navy/40">(opcional)</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Si querés, contale por qué te interesa o cualquier consulta."
          className="w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-navy focus:outline-none focus:border-navy"
        />
        <span className="eyebrow mt-2 block !text-navy/40">
          {message.length} / 2000
        </span>
      </div>

      {error && (
        <p className="eyebrow !text-navy" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isPending || !inputValid || overAvailable}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? "Enviando…" : "Enviar interés"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
        >
          Cancelar
        </button>
      </div>

      <p className="eyebrow">
        AJDUT no procesa pagos. El cierre se realiza por fuera de la plataforma según los términos
        que acuerdes con el founder.
      </p>
    </form>
  );
}
