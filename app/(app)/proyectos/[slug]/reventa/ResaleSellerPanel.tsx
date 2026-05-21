"use client";

import { useState, useTransition } from "react";
import {
  FloatingInput,
  FloatingSelect,
  FloatingTextarea,
} from "@/components/ui/Floating";
import {
  listForResaleAction,
  proposeBuyerAction,
  cancelResaleAction,
} from "./actions";

type Member = { id: string; name: string };

type Row = {
  participationId: string;
  serialCode: string;
  shareCount: number;
  status: string;
  listing: { id: string; status: string } | null;
};

export function ResaleSellerPanel({
  projectSlug,
  rows,
  members,
}: {
  projectSlug: string;
  rows: Row[];
  members: Member[];
}) {
  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <SellerRow
          key={row.participationId}
          projectSlug={projectSlug}
          row={row}
          members={members}
        />
      ))}
    </ul>
  );
}

function fmtInt(n: number): string {
  return n.toLocaleString("es-MX");
}

function SellerRow({
  projectSlug,
  row,
  members,
}: {
  projectSlug: string;
  row: Row;
  members: Member[];
}) {
  const [mode, setMode] = useState<"idle" | "listing" | "designating">("idle");
  const [intentNote, setIntentNote] = useState("");
  const [contact, setContact] = useState("");
  const [buyerId, setBuyerId] = useState(members[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canList = row.status === "ASSIGNED";
  const inResale = row.status === "IN_RESALE";
  const transferPending = row.status === "TRANSFER_PENDING";

  function reset() {
    setMode("idle");
    setError(null);
  }

  function doList() {
    setError(null);
    if (intentNote.trim().length < 10) {
      setError("La nota debe tener al menos 10 caracteres.");
      return;
    }
    if (contact.trim().length < 3) {
      setError("Indicá un medio de contacto.");
      return;
    }
    startTransition(async () => {
      const r = await listForResaleAction(
        projectSlug,
        row.participationId,
        intentNote,
        contact
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      reset();
    });
  }

  function doDesignate() {
    setError(null);
    if (!row.listing) return;
    if (!buyerId) {
      setError("Elegí un comprador.");
      return;
    }
    startTransition(async () => {
      const r = await proposeBuyerAction(projectSlug, row.listing!.id, buyerId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      reset();
    });
  }

  function doCancel() {
    setError(null);
    if (!row.listing) return;
    startTransition(async () => {
      const r = await cancelResaleAction(projectSlug, row.listing!.id);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <li className="hairline p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-sm text-navy">{row.serialCode}</span>
        <span className="eyebrow !text-navy/50">
          {fmtInt(row.shareCount)} acciones
        </span>
      </div>

      {transferPending && (
        <p className="mt-3 eyebrow !text-gold" role="status">
          Traspaso enviado · esperando aprobación del equipo de AJDUT
        </p>
      )}

      {canList && mode === "idle" && (
        <div className="mt-4">
          <button onClick={() => setMode("listing")} className="btn-outline">
            Listar para reventa →
          </button>
        </div>
      )}

      {inResale && mode === "idle" && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span className="eyebrow !text-navy/60">En el tablón de reventa</span>
          <button
            onClick={() => setMode("designating")}
            disabled={isPending}
            className="btn-primary disabled:opacity-50"
          >
            Designar comprador →
          </button>
          <button
            onClick={doCancel}
            disabled={isPending}
            className="eyebrow !text-navy/40 hover:!text-navy p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
          >
            {isPending ? "Cancelando…" : "Quitar del tablón"}
          </button>
          {error && (
            <span className="eyebrow !text-navy" role="alert">
              {error}
            </span>
          )}
        </div>
      )}

      {mode === "listing" && (
        <div className="mt-4 space-y-4">
          <FloatingTextarea
            id={`note-${row.participationId}`}
            label="Detalle para el comprador"
            value={intentNote}
            onChange={setIntentNote}
            rows={3}
            maxLength={500}
            discreetCounter
          />
          <FloatingInput
            id={`contact-${row.participationId}`}
            label="Cómo te contactan (email, WhatsApp, teléfono)"
            value={contact}
            onChange={setContact}
            maxLength={160}
          />
          {error && (
            <p className="eyebrow !text-navy" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={doList}
              disabled={isPending}
              className="btn-primary disabled:opacity-50"
            >
              {isPending ? "Listando…" : "Confirmar reventa"}
            </button>
            <button
              onClick={reset}
              disabled={isPending}
              className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {mode === "designating" && (
        <div className="mt-4 space-y-4">
          {members.length === 0 ? (
            <p className="text-sm text-navy/60">
              Todavía no hay otros miembros en este proyecto para designar como
              comprador.
            </p>
          ) : (
            <>
              <FloatingSelect
                id={`buyer-${row.participationId}`}
                label="Comprador"
                value={buyerId}
                onChange={setBuyerId}
                options={members.map((m) => ({ value: m.id, label: m.name }))}
              />
              <p className="text-sm text-navy/60 leading-relaxed">
                Al confirmar, el traspaso de las{" "}
                <span className="text-navy">{fmtInt(row.shareCount)}</span>{" "}
                acciones queda pendiente de aprobación del equipo de AJDUT.
              </p>
            </>
          )}
          {error && (
            <p className="eyebrow !text-navy" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            {members.length > 0 && (
              <button
                onClick={doDesignate}
                disabled={isPending}
                className="btn-primary disabled:opacity-50"
              >
                {isPending ? "Enviando…" : "Designar y enviar a aprobación"}
              </button>
            )}
            <button
              onClick={reset}
              disabled={isPending}
              className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
