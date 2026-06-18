"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import type { Dict } from "@/lib/i18n";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import {
  suspendProjectAction,
  reactivateProjectAction,
  deleteProjectAction,
  type ProjectModerationResult,
} from "./admin-actions";

type AdminDict = Dict["adminApproval"];

/**
 * Barra fina de moderación del admin sobre un proyecto ya aprobado:
 *  - ACTIVE  → Inactivar (lo oculta a los miembros) + Eliminar.
 *  - SUSPENDED → Reactivar + Eliminar.
 * El control de acceso hace el resto (no-ACTIVE oculto a miembros; deletedAt
 * desaparece para todos).
 */
export function AdminModerationActions({
  projectSlug,
  status,
  dict,
}: {
  projectSlug: string;
  status: string;
  dict: AdminDict;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isActive = status === "ACTIVE";

  function run(
    action: (slug: string) => Promise<ProjectModerationResult>,
    redirectTo?: string
  ) {
    setError(null);
    startTransition(async () => {
      const r = await action(projectSlug);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (redirectTo) router.push(redirectTo as Route);
      else router.refresh();
    });
  }

  return (
    <div className="mt-6 hairline-t pt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="eyebrow !text-navy/40">
        {isActive ? dict.moderationActiveBody : dict.moderationSuspendedBody}
      </span>
      {isActive ? (
        <InlineConfirm
          label={dict.inactivateBtn}
          question={dict.inactivateBody}
          confirmLabel={dict.confirmInactivateBtn}
          onConfirm={() => run(suspendProjectAction)}
          disabled={isPending}
          className="eyebrow hover:!text-gold"
        />
      ) : (
        <button
          type="button"
          onClick={() => run(reactivateProjectAction)}
          disabled={isPending}
          className="eyebrow !text-gold hover:!text-navy disabled:opacity-50 p-0 m-0 border-0 bg-transparent cursor-pointer"
        >
          {isPending ? dict.reactivatingBtn : dict.reactivateBtn}
        </button>
      )}
      <span aria-hidden className="eyebrow !text-navy/20">·</span>
      <InlineConfirm
        label={dict.deleteBtn}
        question={dict.deleteBody}
        confirmLabel={dict.confirmDeleteBtn}
        onConfirm={() => run(deleteProjectAction, "/proyectos")}
        disabled={isPending}
        className="eyebrow !text-navy/40 hover:!text-navy"
      />
      {error && (
        <span className="eyebrow !text-navy basis-full" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
