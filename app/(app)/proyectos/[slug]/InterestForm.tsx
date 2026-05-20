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

  // El botón "Me interesa participar →" del header es un ancla a #comprar.
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

  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [supportKind, setSupportKind] =
    useState<"CAPITAL" | "SPONSOR" | "AMBASSADOR" | "ADVISOR" | "OTHER">("CAPITAL");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Precio por acción derivado de la valoración declarada.
  // Si no hay valoración, este form queda en modo "no disponible".
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

    if (!pricePerShare) {
      setError(
        "Este proyecto todavía no declaró su valoración — no podés indicar un monto."
      );
      return;
    }
    if (!inputValid) {
      setError(
        minAmount
          ? `Mínimo: ${fmtMoney(minAmount)} (1 acción).`
          : "Ingresá un monto válido."
      );
      return;
    }
    if (overAvailable) {
      setError(
        maxAmount
          ? `El monto excede lo disponible. Máximo: ${fmtMoney(maxAmount)}.`
          : `Máximo disponible: ${fmtInt(maxShares)} acciones.`
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

  // Sin valoración declarada: estado claro y form deshabilitado.
  if (!pricePerShare) {
    return (
      <div className="mt-4 hairline p-5 bg-paper-light">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">Participación no disponible aún</p>
          <button
            type="button"
            onClick={close}
            className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
          >
            ← Volver
          </button>
        </div>
        <p className="mt-3 text-navy/75 leading-relaxed">
          Este proyecto todavía no declaró su valoración — no podés indicar un monto.
          Volvé a revisar más adelante; el founder publicará la valoración cuando esté lista.
        </p>
      </div>
    );
  }

  return (
    <form action={submit} className="mt-4 hairline p-5 bg-paper-light">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Quiero más información</p>
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
        {/* Tipo de apoyo */}
        <div>
          <label htmlFor="supportKind" className="eyebrow block mb-1.5">
            Tipo de apoyo
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
            className="w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-sm text-navy focus:outline-none focus:border-navy"
          >
            <option value="CAPITAL">Capital</option>
            <option value="SPONSOR">Sponsor</option>
            <option value="AMBASSADOR">Embajador</option>
            <option value="ADVISOR">Advisor</option>
            <option value="OTHER">Otro</option>
          </select>
        </div>

        {/* Input protagonista: número grande */}
        <div>
          <label htmlFor="amount" className="eyebrow block mb-1.5">
            ¿Con qué monto querés participar?
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

        <p className="eyebrow !text-navy/40">
          {maxAmount !== null
            ? `Máximo ${fmtMoney(maxAmount)} · ${fmtInt(maxShares)} acciones`
            : `Máximo ${fmtInt(maxShares)} acciones disponibles`}
        </p>

        {/* Equivale / Precio — estilo KPI, consistente con el resto */}
        <div className="grid grid-cols-2 gap-px bg-line">
          <div className="bg-paper px-3 py-2">
            <p className="eyebrow !text-navy/40">Equivale a</p>
            <p className="mt-0.5 font-mono text-base">
              {inputValid ? (
                <span
                  className={
                    overAvailable
                      ? "text-navy/40 line-through"
                      : "text-gold"
                  }
                >
                  {`${fmtInt(computedShares)} ${
                    computedShares === 1 ? "acción" : "acciones"
                  }`}
                </span>
              ) : (
                <span className="text-navy/30">—</span>
              )}
            </p>
            {inputValid && !overAvailable && computedAmount > 0 && (
              <p className="mt-0.5 eyebrow !text-navy/40">
                {fmtMoney(computedAmount)} efectivos
              </p>
            )}
          </div>
          <div className="bg-paper px-3 py-2">
            <p className="eyebrow !text-navy/40">Precio por acción</p>
            <p className="mt-0.5 font-mono text-base text-navy">
              {fmtMoney(pricePerShare)}
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
          placeholder={`Mi nombre es ${viewerName.trim() || "[tu nombre]"} y me interesa participar en ${projectName} porque…`}
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
          {isPending ? "Enviando…" : "Enviar solicitud"}
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
