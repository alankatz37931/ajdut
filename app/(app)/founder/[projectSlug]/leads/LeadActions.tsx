"use client";

import { useState, useTransition } from "react";
import {
  markLeadContactedAction,
  markLeadInterviewingAction,
  dismissLeadAction,
  acceptLeadAndAssignAction,
  requestMoreInfoAction,
} from "./actions";
import { InlineConfirm } from "@/components/ui/InlineConfirm";

type Props = {
  leadId: string;
  status: string;
  shareCountRequested: number;
  investorName: string;
};

type Mode = "idle" | "confirming-accept" | "asking-more-info";

export function LeadActions({ leadId, status, shareCountRequested, investorName }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [question, setQuestion] = useState("");
  const [isPending, startTransition] = useTransition();

  function markContacted() {
    setError(null);
    startTransition(async () => {
      const r = await markLeadContactedAction(leadId);
      if (!r.ok) setError(r.error);
    });
  }

  function markInterviewing() {
    setError(null);
    startTransition(async () => {
      const r = await markLeadInterviewingAction(leadId);
      if (!r.ok) setError(r.error);
    });
  }

  function dismiss() {
    setError(null);
    startTransition(async () => {
      const r = await dismissLeadAction(leadId);
      if (!r.ok) setError(r.error);
    });
  }

  function acceptAndAssign() {
    setError(null);
    startTransition(async () => {
      const r = await acceptLeadAndAssignAction(leadId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // El revalidatePath en el servidor refresca la lista
    });
  }

  function sendMoreInfoRequest() {
    setError(null);
    startTransition(async () => {
      const r = await requestMoreInfoAction(leadId, question);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setQuestion("");
      setMode("idle");
    });
  }

  if (mode === "confirming-accept") {
    return (
      <div className="hairline p-4 bg-paper-light space-y-3">
        <p className="eyebrow !text-gold">Proponer asignación al admin</p>
        <p className="text-navy/85 text-sm leading-relaxed">
          Vas a proponer la asignación de{" "}
          <span className="font-mono text-navy">{shareCountRequested.toLocaleString("es-MX")}</span>{" "}
          acciones a <span className="text-navy">{investorName}</span>. La propuesta
          queda <strong>pendiente de validación por el equipo de AJDUT</strong> —
          recién cuando un admin la apruebe se decrementa el pool y se emite el
          certificado. Asegurate de haber cerrado el pago por fuera antes.
        </p>
        {error && (
          <p className="eyebrow !text-navy" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={acceptAndAssign}
            disabled={isPending}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? "Proponiendo…" : "Sí, enviar propuesta al admin"}
          </button>
          <button
            onClick={() => setMode("idle")}
            disabled={isPending}
            className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  if (mode === "asking-more-info") {
    return (
      <div className="hairline p-4 bg-paper-light space-y-3">
        <p className="eyebrow !text-gold">Pedir más información</p>
        <p className="text-navy/85 text-sm leading-relaxed">
          Escribí qué necesitás saber antes de avanzar. {investorName} recibe
          un email con tu pregunta y responde por fuera de la plataforma.
        </p>
        <textarea
          rows={4}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ej: ¿Podrías contarme un poco más sobre tu experiencia en el sector y por qué te interesa este proyecto?"
          maxLength={2000}
          className="w-full hairline bg-paper px-3 py-2 font-sans text-sm text-navy focus:outline-none focus:border-navy"
        />
        {error && (
          <p className="eyebrow !text-navy" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={sendMoreInfoRequest}
            disabled={isPending || question.trim().length < 5}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? "Enviando…" : "Enviar pregunta"}
          </button>
          <button
            onClick={() => {
              setMode("idle");
              setError(null);
            }}
            disabled={isPending}
            className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        onClick={() => setMode("confirming-accept")}
        disabled={isPending}
        className="btn-primary disabled:opacity-50"
      >
        Aceptar y proponer al admin →
      </button>
      {/* Pedir más info: disponible mientras el lead esté abierto, contactado
          o en entrevista. Abre el textarea para escribir la pregunta. */}
      {(status === "OPEN" || status === "CONTACTED" || status === "INTERVIEWING") && (
        <button
          onClick={() => setMode("asking-more-info")}
          disabled={isPending}
          className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
        >
          Pedir más info
        </button>
      )}
      {status === "OPEN" && (
        <button
          onClick={markContacted}
          disabled={isPending}
          className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
        >
          Marcar como contactado
        </button>
      )}
      {(status === "OPEN" || status === "CONTACTED") && (
        <button
          onClick={markInterviewing}
          disabled={isPending}
          className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
        >
          En entrevista
        </button>
      )}
      <InlineConfirm
        label="Descartar"
        question="¿Descartar este lead?"
        onConfirm={dismiss}
        disabled={isPending}
        className="eyebrow hover:!text-navy !text-navy/40 p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
      />
      {error && (
        <span className="eyebrow !text-navy" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
