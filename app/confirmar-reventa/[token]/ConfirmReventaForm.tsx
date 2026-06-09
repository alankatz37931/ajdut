"use client";

import { useCallback, useState } from "react";
import { useSafeAction } from "@/components/hooks/useSafeAction";
import { confirmReventaAction } from "./actions";

type Dict = {
  confirmBtn: string;
  confirmingBtn: string;
  doneTitle: string;
  doneBody: string;
};

export function ConfirmReventaForm({
  token,
  dict,
}: {
  token: string;
  dict: Dict;
}) {
  const [done, setDone] = useState(false);

  const confirmFn = useCallback(() => confirmReventaAction(token), [token]);

  const { run, isPending, error } = useSafeAction<void>(confirmFn, {
    onSuccess: () => setDone(true),
  });

  if (done) {
    return (
      <div className="hairline p-6 bg-paper-light">
        <p className="eyebrow !text-gold">{dict.doneTitle}</p>
        <p className="mt-3 text-navy/85 text-sm leading-relaxed">
          {dict.doneBody}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => run()}
        disabled={isPending}
        className="btn-primary w-full disabled:opacity-50"
      >
        {isPending ? dict.confirmingBtn : dict.confirmBtn}
      </button>
      {error && (
        <p className="eyebrow !text-navy" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
