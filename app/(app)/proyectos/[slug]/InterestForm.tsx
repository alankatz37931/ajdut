"use client";

import { useState, useTransition, useEffect } from "react";
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
};

type Mode = "amount" | "shares";

export function InterestForm({
  projectSlug,
  projectName,
  viewerName,
  availableShares,
  valuation,
  totalShares,
  currency,
}: Props) {
  const [open, setOpen] = useState(false);

  // El botón "Comprar acciones →" del header es un ancla a #comprar.
  // Al apretarlo (o si se entra con ese hash) abrimos esta sección.
  useEffect(() => {
    const check = () => {
      if (window.location.hash === "#comprar") setOpen(true);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  // Al cerrar limpiamos el hash para que (a) volver a apretar el botón del
  // header dispare otro `hashchange` y reabra, y (b) los tabs reaparezcan.
  // `replaceState` NO emite `hashchange`, así que lo despachamos a mano.
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
      <div className="mt-4 hairline p-5 bg-paper-light">
        <p className="eyebrow">Interés registrado</p>
        <p className="mt-3 font-sans text-h2 text-navy">Gracias.</p>
        <p className="mt-3 text-navy/75 leading-relaxed">
          El founder del proyecto recibió tu interés. Si avanza, te va a contactar al email con el
          que estás registrado en AJDUT.
        </p>
      </div>
    );
  }

  // Cerrada: no renderiza nada. Se abre con el botón del header (#comprar).
  if (!open) return null;

  return (
    <form action={submit} className="mt-4 hairline p-5 bg-paper-light">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Manifestar interés</p>
        <button
          type="button"
          onClick={close}
          disabled={isPending}
          className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
        >
          ← Volver
        </button>
      </div>

      {/* Cluster principal: el monto es el foco */}
      <div className="mt-4 space-y-3">
        {canUseAmountMode && (
          <div>
            <p className="eyebrow mb-1.5">Calcular en</p>
            <div className="inline-flex hairline">
              <button
                type="button"
                onClick={() => setMode("shares")}
                className={`px-4 py-1.5 eyebrow leading-none transition-colors cursor-pointer ${
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
                className={`px-4 py-1.5 eyebrow leading-none transition-colors border-l-hairline border-navy/30 cursor-pointer ${
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

        {/* Input protagonista: número grande */}
        {activeMode === "amount" ? (
          <div>
            <label htmlFor="amount" className="eyebrow block mb-1.5">
              ¿Cuánto querés invertir?
            </label>
            <div className="flex items-stretch hairline bg-paper">
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
                placeholder="0.00"
                className="flex-1 min-w-0 border-l-hairline border-navy/20 px-4 py-2 font-mono text-xl text-navy bg-transparent focus:outline-none"
              />
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="shares" className="eyebrow block mb-1.5">
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
              className="w-full hairline bg-paper px-4 py-2 font-mono text-xl text-navy focus:outline-none focus:border-navy"
            />
          </div>
        )}

        <p className="eyebrow !text-navy/40">
          {activeMode === "amount" && maxAmount !== null
            ? `Máximo ${fmtMoney(maxAmount)} · ${fmtInt(maxShares)} acciones`
            : `Máximo ${fmtInt(maxShares)} acciones disponibles`}
        </p>

        {/* Equivale / Precio — estilo KPI, consistente con el resto */}
        <div className="grid grid-cols-2 gap-px bg-line">
          <div className="bg-paper px-3 py-2">
            <p className="eyebrow !text-navy/40">
              {activeMode === "amount" ? "Equivale a" : "Monto aproximado"}
            </p>
            <p className="mt-0.5 font-mono text-base">
              {inputValid ? (
                <span
                  className={
                    overAvailable
                      ? "text-navy/40 line-through"
                      : "text-gold"
                  }
                >
                  {activeMode === "amount"
                    ? `${fmtInt(computedShares)} ${
                        computedShares === 1 ? "acción" : "acciones"
                      }`
                    : pricePerShare
                    ? fmtMoney(computedAmount)
                    : "—"}
                </span>
              ) : (
                <span className="text-navy/30">—</span>
              )}
            </p>
          </div>
          <div className="bg-paper px-3 py-2">
            <p className="eyebrow !text-navy/40">Precio por acción</p>
            <p className="mt-0.5 font-mono text-base text-navy">
              {pricePerShare ? fmtMoney(pricePerShare) : "no informado"}
            </p>
          </div>
        </div>
      </div>

      {/* Mensaje (secundario) */}
      <div className="mt-4 hairline-t pt-4">
        <label htmlFor="message" className="eyebrow block mb-1.5">
          Mensaje al founder <span className="!text-navy/40">(opcional)</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={3}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`Mi nombre es ${viewerName.trim() || "[tu nombre]"} y me interesa invertir en ${projectName} porque…`}
          className="w-full resize-none border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-sm text-navy focus:outline-none focus:border-navy"
        />
        <span className="eyebrow mt-1.5 block !text-navy/40">
          {message.length} / 2000
        </span>
      </div>

      {error && (
        <p className="eyebrow !text-navy mt-4" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={isPending || !inputValid || overAvailable}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? "Enviando…" : "Enviar interés"}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={isPending}
          className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
        >
          Cancelar
        </button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-navy/40">
        AJDUT no procesa pagos. El cierre se realiza por fuera de la plataforma
        según los términos que acuerdes con el founder.
      </p>
    </form>
  );
}
