"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { sendAdminBroadcastAction } from "./actions";
import {
  FloatingInput,
  FloatingSelect,
  FloatingTextarea,
} from "@/components/ui/Floating";

type ProjectOpt = { id: string; name: string; slug: string };
type AvisoDict = Dict["adminAvisos"];

type Props = {
  projects: ProjectOpt[];
  dict: AvisoDict;
  locale: string;
};

/**
 * Form de avisos — diseño minimalista con Role + Project como FloatingSelects
 * uniformes, mensaje compacto, sin línea separadora entre filtros y mensaje.
 */
export function AdminAvisoForm({ projects, dict, locale }: Props) {
  void locale;

  const [role, setRole] = useState("");
  const [projectId, setProjectId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<number | null>(null);
  const [isSending, startSend] = useTransition();

  function clearStatus() {
    setSuccess(null);
    setError(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearStatus();
    if (!subject.trim() || !body.trim()) {
      setError(dict.errEmpty);
      return;
    }
    const fd = new FormData();
    if (role) fd.append("roles", role);
    fd.set("onlyActive", "true");
    if (projectId) fd.set("projectId", projectId);
    fd.set("subject", subject);
    fd.set("body", body);

    startSend(async () => {
      const r = await sendAdminBroadcastAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(r.count);
      setSubject("");
      setBody("");
      setRole("");
      setProjectId("");
    });
  }

  const canSend =
    !isSending && subject.trim().length > 0 && body.trim().length > 0;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
        <FloatingSelect
          id="role"
          label={dict.rolesLabelSingle}
          value={role}
          onChange={(v) => {
            clearStatus();
            setRole(v);
          }}
          disabled={isSending}
          options={[
            { value: "", label: dict.rolesAll },
            { value: "ADMIN", label: dict.roleAdmin },
            { value: "PROJECT_OWNER", label: dict.roleProjectOwner },
            { value: "CO_ADMIN", label: dict.roleCoAdmin },
            { value: "PARTNER", label: dict.rolePartner },
          ]}
        />

        <FloatingSelect
          id="projectId"
          label={dict.projectLabel}
          value={projectId}
          onChange={(v) => {
            clearStatus();
            setProjectId(v);
          }}
          disabled={isSending}
          options={[
            { value: "", label: dict.projectAll },
            ...projects.map((p) => ({ value: p.id, label: p.name })),
          ]}
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

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={!canSend}
          className="btn-primary disabled:opacity-50"
        >
          {isSending ? dict.sendingBtn : dict.sendBtnIdle}
        </button>
        <span className="eyebrow !text-navy/40">{dict.sendDisclaimer}</span>
      </div>
    </form>
  );
}
