"use client";

import { useRef, useState, useTransition } from "react";
import { countRecipientsAction, sendAdminBroadcastAction } from "./actions";
import {
  FloatingInput,
  FloatingSelect,
  FloatingTextarea,
} from "@/components/ui/Floating";

type ProjectOpt = { id: string; name: string; slug: string };

type Props = {
  projects: ProjectOpt[];
};

const ROLES = [
  { value: "ADMIN", label: "Admin" },
  { value: "PROJECT_OWNER", label: "Project owner" },
  { value: "CO_ADMIN", label: "Co-admin" },
  { value: "PARTNER", label: "Miembro" },
] as const;

type CountState = { count: number; stale: boolean } | null;

export function AdminAvisoForm({ projects }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<number | null>(null);
  const [countState, setCountState] = useState<CountState>(null);
  const [isCounting, startCount] = useTransition();
  const [isSending, startSend] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [projectId, setProjectId] = useState("");

  function markStale() {
    setSuccess(null);
    setError(null);
    setCountState((c) => (c ? { ...c, stale: true } : c));
  }

  function onCount() {
    setError(null);
    setSuccess(null);
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    startCount(async () => {
      const r = await countRecipientsAction(fd);
      if (!r.ok) {
        setError(r.error);
        setCountState(null);
        return;
      }
      setCountState({ count: r.count, stale: false });
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!subject.trim() || !body.trim()) {
      setError("Completá el asunto y el mensaje del aviso.");
      return;
    }
    if (!countState || countState.stale) {
      setError("Calculá los destinatarios antes de enviar.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    startSend(async () => {
      const r = await sendAdminBroadcastAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(r.count);
      setCountState(null);
      setSubject("");
      setBody("");
      setProjectId("");
      formRef.current?.reset();
    });
  }

  const canSend =
    !!countState &&
    !countState.stale &&
    countState.count > 0 &&
    !isSending;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-10 space-y-8">
      {/* ─── Filtros ─────────────────────────────────────────────── */}
      <section className="space-y-5 hairline p-5 bg-paper">
        <p className="eyebrow !text-navy">Filtros</p>

        <div>
          <p className="eyebrow block mb-2">Roles (vacío = todos)</p>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <label
                key={r.value}
                className="inline-flex items-center gap-2 border-hairline border-navy/40 px-3 py-1.5 cursor-pointer hover:border-navy"
              >
                <input
                  type="checkbox"
                  name="roles"
                  value={r.value}
                  onChange={markStale}
                  disabled={isSending}
                  className="accent-navy"
                />
                <span className="font-sans text-sm text-navy">{r.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="onlyActive"
              value="true"
              defaultChecked
              onChange={markStale}
              disabled={isSending}
              className="accent-navy"
            />
            <span className="font-sans text-sm text-navy">Solo usuarios activos</span>
          </label>
        </div>

        <div>
          <FloatingSelect
            id="projectId"
            label="Proyecto (opcional)"
            value={projectId}
            onChange={(v) => {
              setProjectId(v);
              markStale();
            }}
            disabled={isSending}
            options={[
              { value: "", label: "— Todos los proyectos —" },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <p className="eyebrow !text-navy/40 mt-1.5">
            Restringe el envío a miembros de ese proyecto.
          </p>
          <input type="hidden" name="projectId" value={projectId} />
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1">
          <button
            type="button"
            onClick={onCount}
            disabled={isCounting || isSending}
            className="btn-outline disabled:opacity-50"
          >
            {isCounting ? "Calculando…" : "Calcular destinatarios"}
          </button>
          {countState && !countState.stale && (
            <span className="eyebrow !text-navy">
              {countState.count.toLocaleString("es-MX")} destinatario
              {countState.count === 1 ? "" : "s"}
            </span>
          )}
          {countState?.stale && (
            <span className="eyebrow !text-navy/50">
              Filtros modificados — recalculá.
            </span>
          )}
        </div>
      </section>

      {/* ─── Mensaje ─────────────────────────────────────────────── */}
      <FloatingInput
        id="subject"
        label="Asunto"
        value={subject}
        onChange={setSubject}
        maxLength={160}
      />

      <FloatingTextarea
        id="body"
        label="Mensaje"
        value={body}
        onChange={setBody}
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
          Aviso enviado a {success} destinatario{success === 1 ? "" : "s"}.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={!canSend}
          className="btn-primary disabled:opacity-50"
        >
          {isSending
            ? "Enviando…"
            : countState && !countState.stale
              ? `Enviar a ${countState.count} destinatario${countState.count === 1 ? "" : "s"} →`
              : "Enviar →"}
        </button>
        <span className="eyebrow !text-navy/40">
          El email se envía como “Equipo AJDUT”.
        </span>
      </div>
    </form>
  );
}
