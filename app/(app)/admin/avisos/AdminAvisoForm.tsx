"use client";

import { useRef, useState, useTransition } from "react";
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

export function AdminAvisoForm({ projects, dict, locale }: Props) {
  void locale;
  const ROLES = [
    { value: "ADMIN", label: dict.roleAdmin },
    { value: "PROJECT_OWNER", label: dict.roleProjectOwner },
    { value: "CO_ADMIN", label: dict.roleCoAdmin },
    { value: "PARTNER", label: dict.rolePartner },
  ] as const;

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<number | null>(null);
  const [isSending, startSend] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [projectId, setProjectId] = useState("");

  function clearStatus() {
    setSuccess(null);
    setError(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!subject.trim() || !body.trim()) {
      setError(dict.errEmpty);
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
      setSubject("");
      setBody("");
      setProjectId("");
      formRef.current?.reset();
    });
  }

  const canSend =
    !isSending && subject.trim().length > 0 && body.trim().length > 0;

  return (
    <form ref={formRef} onSubmit={onSubmit}>
      {/* ─── 01 · Filtros ─────────────────────────────────────────── */}
      <section className="py-8 sm:py-10 hairline-b">
        <SectionHeader n="01" title={dict.sectionFilters} />

        <div className="mt-6 space-y-6">
          <div>
            <p className="eyebrow !text-navy/50 mb-2.5">{dict.rolesLabel}</p>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <label
                  key={r.value}
                  className="inline-flex items-center gap-2 hairline px-3 py-1.5 cursor-pointer hover:border-navy transition-colors"
                >
                  <input
                    type="checkbox"
                    name="roles"
                    value={r.value}
                    onChange={clearStatus}
                    disabled={isSending}
                    className="accent-navy"
                  />
                  <span className="font-sans text-sm text-navy">{r.label}</span>
                </label>
              ))}
            </div>
            <p className="eyebrow !text-navy/40 mt-2">{dict.rolesHelper}</p>
          </div>

          <div>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="onlyActive"
                value="true"
                defaultChecked
                onChange={clearStatus}
                disabled={isSending}
                className="accent-navy"
              />
              <span className="font-sans text-sm text-navy">
                {dict.onlyActiveLabel}
              </span>
            </label>
          </div>

          <div className="max-w-md">
            <FloatingSelect
              id="projectId"
              label={dict.projectLabel}
              value={projectId}
              onChange={(v) => {
                setProjectId(v);
                clearStatus();
              }}
              disabled={isSending}
              options={[
                { value: "", label: dict.projectAll },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <p className="eyebrow !text-navy/40 mt-2">{dict.projectHelper}</p>
            <input type="hidden" name="projectId" value={projectId} />
          </div>
        </div>
      </section>

      {/* ─── 02 · Mensaje ─────────────────────────────────────────── */}
      <section className="py-8 sm:py-10 hairline-b">
        <SectionHeader n="02" title={dict.sectionMessage} />

        <div className="mt-6 space-y-8 max-w-3xl">
          <FloatingInput
            id="subject"
            label={dict.subjectLabel}
            value={subject}
            onChange={setSubject}
            maxLength={160}
          />

          <FloatingTextarea
            id="body"
            label={dict.bodyLabel}
            value={body}
            onChange={setBody}
            rows={8}
            maxLength={5000}
            counterSuffix=""
          />
        </div>
      </section>

      {/* ─── 03 · Envío ───────────────────────────────────────────── */}
      <section className="py-8 sm:py-10">
        <SectionHeader n="03" title={dict.sectionSend} />

        <div className="mt-6 space-y-5">
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

          <div className="flex flex-wrap items-center gap-4">
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
      </section>
    </form>
  );
}

/** Header de sección numerada — mismo lenguaje visual que el founder
 *  dashboard y la página de chat: número en gold mono + título navy. */
function SectionHeader({ n, title }: { n: string; title: string }) {
  return (
    <p className="font-mono text-sm tracking-wider">
      <span className="text-gold">{n}</span>{" "}
      <span className="text-navy">· {title}</span>
    </p>
  );
}
