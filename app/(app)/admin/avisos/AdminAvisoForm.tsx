"use client";

import { useRef, useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { sendAdminBroadcastAction } from "./actions";
import {
  FloatingInput,
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
 * Form de avisos — patrón visual de filas con chips de filtros en eyebrow
 * (mismo lenguaje que /historial: chips navy/40 inactivos, navy activos).
 * Sin botón "Calcular" — el server devuelve el count cuando termina el
 * envío y se muestra en el success message.
 */
export function AdminAvisoForm({ projects, dict, locale }: Props) {
  void locale;
  const ROLES: Array<{ value: string; label: string }> = [
    { value: "ADMIN", label: dict.roleAdmin },
    { value: "PROJECT_OWNER", label: dict.roleProjectOwner },
    { value: "CO_ADMIN", label: dict.roleCoAdmin },
    { value: "PARTNER", label: dict.rolePartner },
  ];

  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [projectId, setProjectId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<number | null>(null);
  const [isSending, startSend] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function clearStatus() {
    setSuccess(null);
    setError(null);
  }

  function toggleRole(role: string) {
    clearStatus();
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  function selectProject(id: string) {
    clearStatus();
    setProjectId(id);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearStatus();
    if (!subject.trim() || !body.trim()) {
      setError(dict.errEmpty);
      return;
    }
    const fd = new FormData();
    selectedRoles.forEach((r) => fd.append("roles", r));
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
      setSelectedRoles(new Set());
      setProjectId("");
    });
  }

  const canSend =
    !isSending && subject.trim().length > 0 && body.trim().length > 0;

  const allRolesActive = selectedRoles.size === 0;

  return (
    <form ref={formRef} onSubmit={onSubmit}>
      {/* ─── Filtros (chips en eyebrow, mismo patrón que /historial) ─ */}
      <div className="mt-2 space-y-3">
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <FilterChip active={allRolesActive} onClick={() => {
            clearStatus();
            setSelectedRoles(new Set());
          }}>
            {dict.rolesAll}
          </FilterChip>
          {ROLES.map((r) => (
            <FilterChip
              key={r.value}
              active={selectedRoles.has(r.value)}
              onClick={() => toggleRole(r.value)}
            >
              {r.label}
            </FilterChip>
          ))}
        </nav>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <FilterChip
            active={projectId === ""}
            onClick={() => selectProject("")}
          >
            {dict.projectAllChip}
          </FilterChip>
          {projects.map((p) => (
            <FilterChip
              key={p.id}
              active={projectId === p.id}
              onClick={() => selectProject(p.id)}
            >
              {p.name}
            </FilterChip>
          ))}
        </nav>

      </div>

      {/* ─── Mensaje + envío ─────────────────────────────────────── */}
      <div className="mt-10 hairline-t pt-8 space-y-8 max-w-3xl">
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
          rows={8}
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
      </div>
    </form>
  );
}

/** Chip de filtro — mismo estilo que /historial: navy/40 inactivo,
 *  navy activo, hover sutil. */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`eyebrow whitespace-nowrap transition-colors p-0 m-0 border-0 bg-transparent cursor-pointer ${
        active ? "!text-navy" : "!text-navy/40 hover:!text-navy"
      }`}
    >
      {children}
    </button>
  );
}
