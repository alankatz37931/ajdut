"use client";

import { useCallback, useState } from "react";
import type { Dict } from "@/lib/i18n";
import { useSafeAction } from "@/components/hooks/useSafeAction";
import { formatCurrency } from "@/lib/utils/format";
import { confirmResaleOwnerAction } from "./actions";

type OwnerValidationDict = Dict["reventa"]["ownerValidation"];

type Row = {
  resaleListingId: string;
  sellerName: string;
  buyerName: string;
  shareCount: number;
  pricePerShare: string | null;
  buyerConfirmed: boolean;
  ownerConfirmed: boolean;
};

export function OwnerResaleValidation({
  projectSlug,
  rows,
  currency,
  locale,
  dict,
}: {
  projectSlug: string;
  rows: Row[];
  currency: string;
  locale: string;
  dict: OwnerValidationDict;
}) {
  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <OwnerRow
          key={row.resaleListingId}
          projectSlug={projectSlug}
          row={row}
          currency={currency}
          locale={locale}
          dict={dict}
        />
      ))}
    </ul>
  );
}

function OwnerRow({
  projectSlug,
  row,
  currency,
  locale,
  dict,
}: {
  projectSlug: string;
  row: Row;
  currency: string;
  locale: string;
  dict: OwnerValidationDict;
}) {
  const [done, setDone] = useState(row.ownerConfirmed);

  const confirmFn = useCallback(
    () => confirmResaleOwnerAction(projectSlug, row.resaleListingId),
    [projectSlug, row.resaleListingId]
  );
  const { run, isPending, error } = useSafeAction<void>(confirmFn, {
    onSuccess: () => setDone(true),
  });

  const priceNum = row.pricePerShare ? Number(row.pricePerShare) : null;
  const totalNum = priceNum !== null ? priceNum * row.shareCount : null;

  return (
    <li className="hairline p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="font-sans text-navy">
          {dict.fromTo
            .replace("{seller}", row.sellerName)
            .replace("{buyer}", row.buyerName)}
        </span>
        <span className="eyebrow !text-navy/50">
          {row.shareCount.toLocaleString(locale)} {dict.sharesSuffix}
        </span>
      </div>

      {totalNum !== null && priceNum !== null && (
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 eyebrow !text-navy/60">
          <span>
            {dict.priceLabel}:{" "}
            <span className="!text-navy">
              {formatCurrency(priceNum, currency, 2, locale)}
            </span>
          </span>
          <span>
            {dict.totalLabel}:{" "}
            <span className="!text-navy">
              {formatCurrency(totalNum, currency, 2, locale)}
            </span>
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        <span className={`eyebrow ${row.buyerConfirmed ? "!text-gold" : "!text-navy/40"}`}>
          {row.buyerConfirmed ? dict.buyerConfirmed : dict.buyerPending}
        </span>
        <span className={`eyebrow ${done ? "!text-gold" : "!text-navy/40"}`}>
          {done ? dict.ownerConfirmed : dict.ownerPending}
        </span>
      </div>

      <div className="mt-4">
        {done ? (
          <p className="eyebrow !text-gold" role="status">
            {dict.doneValidated}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => run()}
              disabled={isPending}
              className="btn-primary disabled:opacity-50"
            >
              {isPending ? dict.validatingBtn : dict.validateBtn}
            </button>
            {error && (
              <span className="eyebrow !text-navy" role="alert">
                {error}
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
