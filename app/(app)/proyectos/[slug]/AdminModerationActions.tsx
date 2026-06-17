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
 * Moderación del admin sobre un proyecto ya aprobado:
 *  - ACTIVE  → Inactivar (lo oculta a los miembros) + Eliminar.
 *  - SUSPENDED → Reactivar + Eliminar.
 * El control de acceso ya hace el resto (un proyecto no-ACTIVE no lo ven los
 * miembros; uno con deletedAt desaparece para todos).
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
    <div className="hairline p-6 bg-paper-light space-y-4">
      <p className="eyebrow">
        {isActive ? dict.moderationActiveEyebrow : dict.moderationSuspendedEyebrow}
      </p>
      <p className="text-navy/75 leading-relaxed">
        {isActive ? dict.moderationActiveBody : dict.moderationSuspendedBody}
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
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
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? dict.reactivatingBtn : dict.reactivateBtn}
          </button>
        )}
        <InlineConfirm
          label={dict.deleteBtn}
          question={dict.deleteBody}
          confirmLabel={dict.confirmDeleteBtn}
          onConfirm={() => run(deleteProjectAction, "/proyectos")}
          disabled={isPending}
          className="eyebrow !text-navy/50 hover:!text-navy"
        />
      </div>
      {error && (
        <p className="eyebrow !text-navy" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
