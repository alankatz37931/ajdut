"use client";

import { useCallback, useState } from "react";
import type { Dict } from "@/lib/i18n";
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
import { useSafeAction } from "@/components/hooks/useSafeAction";

type Member = { id: string; name: string };

type Row = {
  participationId: string;
  serialCode: string;
  shareCount: number;
  status: string;
  listing: { id: string; status: string } | null;
};

type ReventaDict = Dict["reventa"];

export function ResaleSellerPanel({
  projectSlug,
  rows,
  members,
  dict,
}: {
  projectSlug: string;
  rows: Row[];
  members: Member[];
  dict: ReventaDict;
}) {
  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <SellerRow
          key={row.participationId}
          projectSlug={projectSlug}
          row={row}
          members={members}
          dict={dict}
        />
      ))}
    </ul>
  );
}

function fmtInt(n: number): string {
  // Integer formatting — thousands separator. Same output in es-MX and en-US
  // for plain integers (no decimals), so this stays locale-agnostic.
  return n.toLocaleString("es-MX");
}

type ListInput = { intentNote: string; contactChannel: string };

function SellerRow({
  projectSlug,
  row,
  members,
  dict,
}: {
  projectSlug: string;
  row: Row;
  members: Member[];
  dict: ReventaDict;
}) {
  const s = dict.seller;
  const [mode, setMode] = useState<"idle" | "listing" | "designating">("idle");
  const [intentNote, setIntentNote] = useState("");
  const [contact, setContact] = useState("");
  const [buyerId, setBuyerId] = useState(members[0]?.id ?? "");
  // Validación client-side (sin viaje al server) — el hook solo cubre errores
  // que llegan del action.
  const [validationError, setValidationError] = useState<string | null>(null);

  const canList = row.status === "ASSIGNED";
  const inResale = row.status === "IN_RESALE";
  const transferPending = row.status === "TRANSFER_PENDING";

  // Cada acción tiene su propio hook (tipo de input distinto + onSuccess
  // distinto). Compartimos los flags via OR para que cualquier botón quede
  // disabled mientras alguna está pendiente.
  const listFn = useCallback(
    ({ intentNote: n, contactChannel: c }: ListInput) =>
      listForResaleAction(projectSlug, row.participationId, n, c),
    [projectSlug, row.participationId]
  );
  const {
    run: runList,
    isPending: isListPending,
    error: listError,
    reset: resetList,
  } = useSafeAction<ListInput>(listFn, {
    onSuccess: () => reset(),
  });

  const designateFn = useCallback(
    (buyer: string) => {
      if (!row.listing) {
        // Defensa adicional: el botón solo aparece cuando hay listing, pero
        // si la prop cambió entre render y click resolvemos a un error
        // estándar del hook en vez de romper.
        return Promise.resolve({ ok: false as const, error: s.errBuyerRequired });
      }
      return proposeBuyerAction(projectSlug, row.listing.id, buyer);
    },
    [projectSlug, row.listing, s.errBuyerRequired]
  );
  const {
    run: runDesignate,
    isPending: isDesignatePending,
    error: designateError,
    reset: resetDesignate,
  } = useSafeAction<string>(designateFn, {
    onSuccess: () => reset(),
  });

  const cancelFn = useCallback(() => {
    if (!row.listing) {
      return Promise.resolve({ ok: false as const, error: s.errBuyerRequired });
    }
    return cancelResaleAction(projectSlug, row.listing.id);
  }, [projectSlug, row.listing, s.errBuyerRequired]);
  const {
    run: runCancel,
    isPending: isCancelPending,
    error: cancelError,
    reset: resetCancel,
  } = useSafeAction<void>(cancelFn);

  const isPending = isListPending || isDesignatePending || isCancelPending;
  const error =
    validationError ?? listError ?? designateError ?? cancelError;

  function reset() {
    setMode("idle");
    setValidationError(null);
    resetList();
    resetDesignate();
    resetCancel();
  }

  function doList() {
    resetList();
    setValidationError(null);
    if (intentNote.trim().length < 10) {
      setValidationError(s.errNoteTooShort);
      return;
    }
    if (contact.trim().length < 3) {
      setValidationError(s.errContactRequired);
      return;
    }
    runList({ intentNote, contactChannel: contact });
  }

  function doDesignate() {
    resetDesignate();
    setValidationError(null);
    if (!row.listing) return;
    if (!buyerId) {
      setValidationError(s.errBuyerRequired);
      return;
    }
    runDesignate(buyerId);
  }

  function doCancel() {
    resetCancel();
    setValidationError(null);
    if (!row.listing) return;
    runCancel();
  }

  return (
    <li className="hairline p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-sm text-navy">{row.serialCode}</span>
        <span className="eyebrow !text-navy/50">
          {fmtInt(row.shareCount)} {s.sharesSuffix}
        </span>
      </div>

      {transferPending && (
        <p className="mt-3 eyebrow !text-gold" role="status">
          {s.transferPending}
        </p>
      )}

      {canList && mode === "idle" && (
        <div className="mt-4">
          <button onClick={() => setMode("listing")} className="btn-outline">
            {s.listBtn}
          </button>
        </div>
      )}

      {inResale && mode === "idle" && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span className="eyebrow !text-navy/60">{s.inBoard}</span>
          <button
            onClick={() => setMode("designating")}
            disabled={isPending}
            className="btn-primary disabled:opacity-50"
          >
            {s.designateBtn}
          </button>
          <button
            onClick={doCancel}
            disabled={isPending}
            className="eyebrow !text-navy/40 hover:!text-navy p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
          >
            {isCancelPending ? s.removingBtn : s.removeBtn}
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
            label={s.listingNoteLabel}
            value={intentNote}
            onChange={setIntentNote}
            rows={3}
            maxLength={500}
            discreetCounter
          />
          <FloatingInput
            id={`contact-${row.participationId}`}
            label={s.listingContactLabel}
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
              {isListPending ? s.listingConfirmingBtn : s.listingConfirmBtn}
            </button>
            <button
              onClick={reset}
              disabled={isPending}
              className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
            >
              {s.cancelBtn}
            </button>
          </div>
        </div>
      )}

      {mode === "designating" && (
        <div className="mt-4 space-y-4">
          {members.length === 0 ? (
            <p className="text-sm text-navy/60">{s.designatingNoMembers}</p>
          ) : (
            <>
              <FloatingSelect
                id={`buyer-${row.participationId}`}
                label={s.designatingBuyerLabel}
                value={buyerId}
                onChange={setBuyerId}
                options={members.map((m) => ({ value: m.id, label: m.name }))}
              />
              <p className="text-sm text-navy/60 leading-relaxed">
                {s.designatingNoteWithShares.replace(
                  "{shares}",
                  fmtInt(row.shareCount)
                )}
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
                {isDesignatePending
                  ? s.designatingSubmittingBtn
                  : s.designatingSubmitBtn}
              </button>
            )}
            <button
              onClick={reset}
              disabled={isPending}
              className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
            >
              {s.cancelBtn}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
