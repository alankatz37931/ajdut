"use client";

import { useState } from "react";
import type { Dict } from "@/lib/i18n";
import { countRecipientsAction, sendAdminBroadcastAction } from "./actions";
import {
  FloatingInput,
  FloatingMultiSelect,
  FloatingTextarea,
} from "@/components/ui/Floating";
import { useSafeAction } from "@/components/hooks/useSafeAction";

type ProjectOpt = { id: string; name: string; slug: string };
type AvisoDict = Dict["adminAvisos"];

type Props = {
  projects: ProjectOpt[];
  dict: AvisoDict;
  locale: string;
};

/**
 * Form de avisos — Role + Project como FloatingMultiSelects (multi-select
 * con checkboxes en el dropdown). Empty selection = "todos" (la query no
 * filtra por ese campo).
 *
 * El envío es en dos pasos: "Enviar" primero calcula los destinatarios
 * (countRecipientsAction) y muestra un panel de confirmación con el conteo;
 * el broadcast real (sendAdminBroadcastAction) recién corre al confirmar.
 * Cualquier cambio en los filtros o el mensaje invalida la confirmación.
 */
export function AdminAvisoForm({ projects, dict, locale }: Props) {
  void locale;

  const [roles, setRoles] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [success, setSuccess] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  // Conteo confirmable: != null → el panel de confirmación está abierto.
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  const {
    run: runCount,
    isPending: isCounting,
    error: countError,
    reset: resetCount,
  } = useSafeAction<FormData, { ok: true; count: number }>(
    countRecipientsAction,
    {
      onSuccess: ({ count }) => {
        if (count === 0) {
          // Sin destinatarios no hay nada que confirmar — error directo.
          setLocalError(dict.errNoRecipients);
          return;
        }
        setPendingCount(count);
      },
    }
  );

  const {
    run: runSend,
    isPending: isSending,
    error: actionError,
    reset,
  } = useSafeAction<FormData, { ok: true; count: number }>(
    sendAdminBroadcastAction,
    {
      onSuccess: ({ count }) => {
        setPendingCount(null);
        setSuccess(count);
        setSubject("");
        setBody("");
        setRoles([]);
        setProjectIds([]);
      },
    }
  );
  const error = localError ?? countError ?? actionError;

  function clearStatus() {
    setSuccess(null);
    setLocalError(null);
    // Filtros o mensaje cambiados → el conteo confirmado deja de valer.
    setPendingCount(null);
    resetCount();
    reset();
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    roles.forEach((r) => fd.append("roles", r));
    projectIds.forEach((id) => fd.append("projectId", id));
    fd.set("onlyActive", "true");
    fd.set("subject", subject);
    fd.set("body", body);
    return fd;
  }

  // Paso 1: validar y calcular destinatarios → abre el panel de confirmación.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearStatus();
    if (!subject.trim() || !body.trim()) {
      setLocalError(dict.errEmpty);
      return;
    }
    runCount(buildFormData());
  }

  // Paso 2: el admin confirmó el conteo → recién acá sale el broadcast.
  function onConfirmSend() {
    setLocalError(null);
    runSend(buildFormData());
  }

  function onCancelConfirm() {
    setPendingCount(null);
  }

  const isBusy = isCounting || isSending;
  const canSend =
    !isBusy && subject.trim().length > 0 && body.trim().length > 0;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
        <FloatingMultiSelect
          id="role"
          label={dict.rolesLabelSingle}
          values={roles}
          onChange={(v) => {
            clearStatus();
            setRoles(v);
          }}
          disabled={isBusy}
          placeholder={dict.rolesAll}
          options={[
            { value: "ADMIN", label: dict.roleAdmin },
            { value: "PROJECT_OWNER", label: dict.roleProjectOwner },
            { value: "CO_ADMIN", label: dict.roleCoAdmin },
            { value: "PARTNER", label: dict.rolePartner },
          ]}
        />

        <FloatingMultiSelect
          id="projectId"
          label={dict.projectLabel}
          values={projectIds}
          onChange={(v) => {
            clearStatus();
            setProjectIds(v);
          }}
          disabled={isBusy}
          placeholder={dict.projectAll}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />
      </div>

      <FloatingInput
        id="subject"
        label={dict.subjectLabel}
        value={subject}
        onChange={(v) => {
          clearStatus();
          setSubject(v);
        }}
        maxLength={160}
      />

      <FloatingTextarea
        id="body"
        label={dict.bodyLabel}
        value={body}
        onChange={(v) => {
          clearStatus();
          setBody(v);
        }}
        rows={4}
        maxLength={5000}
        counterSuffix=""
      />

      {error && (
        <p className="eyebrow !text-navy" role="alert">
          {error}
        </p>
      )}
      {success !== null && (
        <p className="eyebrow !text-gold" role="status">
          {(success === 1
            ? dict.successFmtSingle
            : dict.successFmt
          ).replace("{n}", String(success))}
        </p>
      )}

      {pendingCount !== null ? (
        /* ─── Paso de confirmación: el conteo ya se calculó ─────────── */
        <div className="hairline bg-paper-light p-5 sm:p-6 space-y-4">
          <p className="eyebrow !text-gold">{dict.confirmTitle}</p>
          <p className="text-navy leading-relaxed">
            {(pendingCount === 1
              ? dict.confirmBodyFmtSingle
              : dict.confirmBodyFmt
            ).replace("{n}", String(pendingCount))}
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button
              type="button"
              onClick={onConfirmSend}
              disabled={isSending}
              className="btn-primary disabled:opacity-50"
            >
              {isSending ? dict.sendingBtn : dict.confirmBtn}
            </button>
            <button
              type="button"
              onClick={onCancelConfirm}
              disabled={isSending}
              className="btn-outline disabled:opacity-50"
            >
              {dict.cancelBtn}
            </button>
            <span className="eyebrow !text-navy/40">{dict.sendDisclaimer}</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={!canSend}
            className="btn-primary disabled:opacity-50"
          >
            {isCounting ? dict.countingBtn : dict.sendBtnIdle}
          </button>
          <span className="eyebrow !text-navy/40">{dict.sendDisclaimer}</span>
        </div>
      )}
    </form>
  );
}
