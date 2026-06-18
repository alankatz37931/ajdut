"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import type { Dict } from "@/lib/i18n";
import {
  suspendProjectAction,
  reactivateProjectAction,
  deleteProjectAction,
  type ProjectModerationResult,
} from "./admin-actions";

type AdminDict = Dict["adminApproval"];
type Pending = "inactivate" | "activate" | "delete";

/**
 * Estado del proyecto (Activo / Inactivo) como un chip de color, con un menú
 * que despliega las acciones de moderación del admin. Cambiar de estado o
 * eliminar abre un modal mínimo de confirmación. Solo lo ve el admin.
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
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);
  const isActive = status === "ACTIVE";

  // Click afuera cierra el menú.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Escape cierra el modal de confirmación.
  useEffect(() => {
    if (!confirm) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirm(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirm]);

  function execute() {
    if (!confirm) return;
    const action: (slug: string) => Promise<ProjectModerationResult> =
      confirm === "inactivate"
        ? suspendProjectAction
        : confirm === "activate"
          ? reactivateProjectAction
          : deleteProjectAction;
    const redirectTo = confirm === "delete" ? "/proyectos" : undefined;
    setError(null);
    startTransition(async () => {
      const r = await action(projectSlug);
      if (!r.ok) {
        setError(r.error);
        setConfirm(null);
        return;
      }
      setConfirm(null);
      if (redirectTo) router.push(redirectTo as Route);
      else router.refresh();
    });
  }

  const question =
    confirm === "inactivate"
      ? dict.confirmInactivateQuestion
      : confirm === "activate"
        ? dict.confirmActivateQuestion
        : dict.confirmDeleteQuestion;
  const isDelete = confirm === "delete";

  return (
    <div className="mt-6 hairline-t pt-4">
      <div ref={wrapRef} className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={isPending}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`inline-flex items-center gap-2 px-3 py-1.5 hairline text-sm transition-colors disabled:opacity-50 ${
            isActive
              ? "bg-emerald-500/10 text-emerald-700"
              : "bg-amber-500/10 text-amber-700"
          }`}
        >
          <span
            aria-hidden
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              isActive ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          {isActive ? dict.stateActive : dict.stateInactive}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div
            role="menu"
            className="absolute left-0 z-20 mt-1 min-w-[11rem] hairline bg-paper shadow-md shadow-navy/10"
          >
            {isActive ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setConfirm("inactivate");
                }}
                className="block w-full text-left px-3 py-2 text-sm text-amber-700 hover:bg-paper-light"
              >
                {dict.inactivateBtn}
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setConfirm("activate");
                }}
                className="block w-full text-left px-3 py-2 text-sm text-emerald-700 hover:bg-paper-light"
              >
                {dict.reactivateBtn}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setConfirm("delete");
              }}
              className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-paper-light hairline-t"
            >
              {dict.deleteBtn}
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 eyebrow !text-navy" role="alert">
          {error}
        </p>
      )}

      {confirm && (
        <div
          className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-4"
          onClick={() => setConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-paper hairline w-full max-w-sm p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-navy leading-relaxed">{question}</p>
            <div className="flex items-center justify-end gap-5">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={isPending}
                className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
              >
                {dict.cancelBtn}
              </button>
              <button
                type="button"
                onClick={execute}
                disabled={isPending}
                className={`btn-primary disabled:opacity-50 ${
                  isDelete ? "!bg-red-600 hover:!bg-red-700" : ""
                }`}
              >
                {isDelete ? dict.confirmDeleteBtn : dict.confirmYesBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
