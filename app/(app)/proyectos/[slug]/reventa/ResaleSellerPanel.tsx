"use client";

import { useCallback, useState } from "react";
import type { Dict } from "@/lib/i18n";
import {
  FloatingInput,
  FloatingTextarea,
} from "@/components/ui/Floating";
import {
  listForResaleAction,
  cancelResaleAction,
} from "./actions";
import { useSafeAction } from "@/components/hooks/useSafeAction";
import { formatCurrency } from "@/lib/utils/format";

type RowListing = {
  id: string;
  status: string;
  shareCount: number;
  proposedPricePerShare: string | null;
};

type Row = {
  participationId: string;
  serialCode: string;
  shareCount: number;
  availableShares: number;
  status: string;
  /**
   * Listings activos del seller sobre esta participación. En el modelo de
   * reventa parcial pueden coexistir varios (50 publicadas + 30 publicadas
   * después, etc.).
   */
  listings: RowListing[];
};

type ReventaDict = Dict["reventa"];

export function ResaleSellerPanel({
  projectSlug,
  projectName,
  rows,
  defaultPricePerShare,
  currency,
  locale,
  dict,
}: {
  projectSlug: string;
  projectName: string;
  rows: Row[];
  /** Precio estimado por participación (preMoney / totalShares). String para preservar precisión. Null si el proyecto no tiene valuation cargada. */
  defaultPricePerShare: string | null;
  currency: string;
  locale: string;
  dict: ReventaDict;
}) {
  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <SellerRow
          key={row.participationId}
          projectSlug={projectSlug}
          projectName={projectName}
          row={row}
          defaultPricePerShare={defaultPricePerShare}
          currency={currency}
          locale={locale}
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

type ListInput = {
  intentNote: string;
  contactChannel: string;
  shareCount: number;
  proposedPricePerShare: string;
};

function SellerRow({
  projectSlug,
  projectName,
  row,
  defaultPricePerShare,
  currency,
  locale,
  dict,
}: {
  projectSlug: string;
  projectName: string;
  row: Row;
  defaultPricePerShare: string | null;
  currency: string;
  locale: string;
  dict: ReventaDict;
}) {
  const s = dict.seller;
  const [mode, setMode] = useState<"idle" | "listing">("idle");
  const [intentNote, setIntentNote] = useState("");
  const [contact, setContact] = useState("");
  // Defaults: shareCount = todo lo disponible; pricePerShare = estimado del
  // proyecto (preMoney/totalShares). Si no hay disponibilidad → "0".
  const [shareCountStr, setShareCountStr] = useState(
    String(row.availableShares > 0 ? row.availableShares : 1)
  );
  const [pricePerShareStr, setPricePerShareStr] = useState(
    defaultPricePerShare ?? ""
  );
  // Validación client-side (sin viaje al server) — el hook solo cubre errores
  // que llegan del action.
  const [validationError, setValidationError] = useState<string | null>(null);

  // El seller puede listar si queda al menos 1 participación sin listar.
  // En el modelo parcial, ASSIGNED e IN_RESALE pueden ambas aceptar nuevos
  // listings si queda stock — aunque ya exista otra publicación viva (tras
  // publicar 50 de 100, el remanente de 50 sigue siendo publicable).
  const canList =
    (row.status === "ASSIGNED" || row.status === "IN_RESALE") &&
    row.availableShares > 0;
  const inResale = row.listings.length > 0;
  const transferPending = row.status === "TRANSFER_PENDING";

  // Cada acción tiene su propio hook (tipo de input distinto + onSuccess
  // distinto). Compartimos los flags via OR para que cualquier botón quede
  // disabled mientras alguna está pendiente.
  const listFn = useCallback(
    ({ intentNote: n, contactChannel: c, shareCount: sc, proposedPricePerShare: pp }: ListInput) =>
      listForResaleAction(projectSlug, row.participationId, n, c, sc, pp),
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

  // Con varios listings por participación, el cancel recibe el id puntual.
  // `cancellingId` distingue cuál botón mostrar como "Cancelando…".
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const cancelFn = useCallback(
    (listingId: string) => cancelResaleAction(projectSlug, listingId),
    [projectSlug]
  );
  const {
    run: runCancel,
    isPending: isCancelPending,
    error: cancelError,
    reset: resetCancel,
  } = useSafeAction<string>(cancelFn);

  const isPending = isListPending || isCancelPending;
  const error = validationError ?? listError ?? cancelError;

  function reset() {
    setMode("idle");
    setValidationError(null);
    resetList();
    resetCancel();
  }

  function doList() {
    resetList();
    setValidationError(null);
    const shareCount = parseInt(shareCountStr, 10);
    if (!Number.isInteger(shareCount) || shareCount < 1 || shareCount > row.availableShares) {
      setValidationError(s.errShareCountOutOfRange);
      return;
    }
    const priceNum = Number(pricePerShareStr);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setValidationError(s.errPriceInvalid);
      return;
    }
    if (intentNote.trim().length < 10) {
      setValidationError(s.errNoteTooShort);
      return;
    }
    if (contact.trim().length < 3) {
      setValidationError(s.errContactRequired);
      return;
    }
    runList({
      intentNote,
      contactChannel: contact,
      shareCount,
      proposedPricePerShare: pricePerShareStr,
    });
  }

  function doCancel(listingId: string) {
    resetCancel();
    setValidationError(null);
    setCancellingId(listingId);
    runCancel(listingId);
  }

  return (
    <li className="hairline p-5">
      <p className="font-sans text-navy">{projectName}</p>

      {transferPending && (
        <p className="mt-3 eyebrow !text-gold" role="status">
          {s.transferPending}
        </p>
      )}

      {inResale && mode === "idle" && (
        <ul className="mt-3 space-y-4">
          {/* Una entrada por listing activo (reventa parcial: pueden coexistir
              varios). Resumen: cantidad + precio + total — para listings
              legacy sin precio (null) mostramos "precio a convenir". */}
          {row.listings.map((listing) => {
            const lc = listing.shareCount;
            const pp = listing.proposedPricePerShare;
            const ppNum = pp !== null ? Number(pp) : null;
            const summary =
              ppNum !== null && Number.isFinite(ppNum)
                ? s.listedSummaryFmt
                    .replace("{shares}", fmtInt(lc))
                    .replace("{price}", formatCurrency(ppNum, currency, 2, locale))
                    .replace(
                      "{total}",
                      formatCurrency(lc * ppNum, currency, 2, locale)
                    )
                : s.listedSummaryNoPriceFmt.replace("{shares}", fmtInt(lc));
            // AWAITING_VALIDATION = un socio ya la adquirió y falta la
            // validación (founder + admin) — no es lo mismo que "publicada".
            // El seller igual puede cancelar hasta que se ejecute el traspaso.
            const awaitingValidation = listing.status === "AWAITING_VALIDATION";
            return (
              <li key={listing.id}>
                <p className="font-mono text-sm text-navy">{summary}</p>
                <p
                  className={`mt-1 eyebrow ${awaitingValidation ? "!text-gold" : "!text-navy/50"}`}
                >
                  {awaitingValidation ? s.awaitingBuyerValidation : s.inBoard}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => doCancel(listing.id)}
                    disabled={isPending}
                    className="eyebrow !text-navy/40 hover:!text-navy p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
                  >
                    {isCancelPending && cancellingId === listing.id
                      ? s.removingBtn
                      : s.removeBtn}
                  </button>
                </div>
              </li>
            );
          })}
          {error && (
            <li className="eyebrow !text-navy" role="alert">
              {error}
            </li>
          )}
        </ul>
      )}

      {canList && mode === "idle" && (
        <div className="mt-4">
          <p className="eyebrow !text-navy/50 mb-3">
            {fmtInt(row.availableShares)} {s.sharesSuffix}
          </p>
          <button onClick={() => setMode("listing")} className="btn-outline">
            {s.listBtn}
          </button>
        </div>
      )}

      {mode === "listing" && (
        <div className="mt-4 space-y-4">
          {/* Cantidad — defaultea al máximo disponible. El user puede bajar
              el número para hacer venta parcial. */}
          <FloatingInput
            id={`shares-${row.participationId}`}
            label={s.listingShareCountLabel}
            type="number"
            inputMode="numeric"
            step="1"
            value={shareCountStr}
            onChange={setShareCountStr}
          />
          <p className="eyebrow !text-navy/50">
            {s.listingShareCountHelperFmt
              .replace("{total}", fmtInt(row.shareCount))
              .replace("{available}", fmtInt(row.availableShares))}
          </p>

          {/* Precio por participación — defaultea al estimado del proyecto. */}
          <FloatingInput
            id={`price-${row.participationId}`}
            label={s.listingPricePerShareLabelFmt.replace("{currency}", currency)}
            type="number"
            inputMode="decimal"
            step="0.01"
            value={pricePerShareStr}
            onChange={setPricePerShareStr}
          />
          <p className="eyebrow !text-navy/50">
            {defaultPricePerShare
              ? s.listingPricePerShareHelperFmt.replace(
                  "{price}",
                  formatCurrency(defaultPricePerShare, currency, 2, locale)
                )
              : s.listingPricePerShareHelperNoEstimate}
          </p>

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

          {/* Total pedido — live preview. Si los inputs no son válidos
              mostramos un guion para no engañar al user. */}
          {(() => {
            const sc = parseInt(shareCountStr, 10);
            const pp = Number(pricePerShareStr);
            const valid =
              Number.isInteger(sc) && sc > 0 && Number.isFinite(pp) && pp > 0;
            return (
              <p className="eyebrow !text-navy">
                {s.listingTotalAskLabelFmt.replace(
                  "{total}",
                  valid ? formatCurrency(sc * pp, currency, 2, locale) : "—"
                )}
              </p>
            );
          })()}

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
    </li>
  );
}
