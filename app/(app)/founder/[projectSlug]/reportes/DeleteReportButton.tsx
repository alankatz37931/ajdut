"use client";

import { useState, useTransition } from "react";
import { deleteReportAction } from "./actions";

type Props = {
  projectSlug: string;
  reportId: string;
  reportLabel: string;
};

export function DeleteReportButton({ projectSlug, reportId, reportLabel }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    const ok = window.confirm(
      `¿Eliminar el reporte "${reportLabel}"? Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    startTransition(async () => {
      const r = await deleteReportAction(projectSlug, reportId);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="eyebrow !text-navy/40 hover:!text-navy disabled:opacity-50"
      >
        {isPending ? "Eliminando…" : "Eliminar"}
      </button>
      {error && (
        <span className="eyebrow !text-navy" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
