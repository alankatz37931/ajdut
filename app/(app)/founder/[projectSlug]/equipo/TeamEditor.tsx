"use client";

import { useState, useTransition } from "react";
import { upsertFounderAction, removeFounderAction } from "./actions";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import {
  FloatingInput,
  FloatingSelect,
  FloatingTextarea,
  FloatingDate,
} from "@/components/ui/Floating";

type Founder = {
  id: string;
  fullName: string;
  role: string;
  bio: string;
  references: string;
  linkedinUrl: string;
  equityPercent: number;
  joinedAt: string; // YYYY-MM-DD
  isActive: boolean;
};

const empty: Founder = {
  id: "",
  fullName: "",
  role: "",
  bio: "",
  references: "",
  linkedinUrl: "",
  equityPercent: 0,
  joinedAt: "",
  isActive: true,
};

export function TeamEditor({
  projectSlug,
  initialFounders,
}: {
  projectSlug: string;
  initialFounders: Founder[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(initialFounders.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await upsertFounderAction(projectSlug, formData);
      if (r.ok) {
        setEditingId(null);
        setShowNew(false);
      } else {
        setError(r.error);
      }
    });
  }

  function onRemove(founderId: string) {
    setError(null);
    startTransition(async () => {
      const r = await removeFounderAction(projectSlug, founderId);
      if (!r.ok) setError(r.error);
    });
  }

  const totalEquity = initialFounders.reduce((s, f) => s + f.equityPercent, 0);

  return (
    <div className="mt-8 space-y-6">
      {error && (
        <p className="eyebrow !text-navy hairline p-3 bg-paper" role="alert">
          {error}
        </p>
      )}

      <div className="hairline p-4 bg-paper flex items-center justify-between">
        <p className="eyebrow">
          Equity asignado total: <span className="font-mono text-navy">{totalEquity.toFixed(2)}%</span>
        </p>
        {!showNew && !editingId && (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="eyebrow hover:!text-gold"
          >
            + Agregar miembro
          </button>
        )}
      </div>

      {showNew && (
        <FounderForm
          founder={empty}
          onSubmit={onSubmit}
          onCancel={() => setShowNew(false)}
          isPending={isPending}
        />
      )}

      <ul className="space-y-3">
        {initialFounders.map((f) => (
          <li key={f.id} className="hairline p-4 bg-paper">
            {editingId === f.id ? (
              <FounderForm
                founder={f}
                onSubmit={onSubmit}
                onCancel={() => setEditingId(null)}
                isPending={isPending}
              />
            ) : (
              <div className="grid grid-cols-12 items-center gap-3">
                <div className="col-span-12 sm:col-span-5 min-w-0">
                  <p className="font-sans text-navy">{f.fullName}</p>
                  <p className="mt-1 eyebrow">{f.role}</p>
                  {f.linkedinUrl && (
                    <a
                      href={f.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 eyebrow !text-gold inline-block"
                    >
                      LinkedIn →
                    </a>
                  )}
                </div>
                <div className="col-span-4 sm:col-span-2 font-mono text-navy">
                  {f.equityPercent.toFixed(2)}%
                </div>
                <div className="col-span-4 sm:col-span-2 eyebrow">
                  {f.isActive ? "● Activo" : "○ Inactivo"}
                </div>
                <div className="col-span-4 sm:col-span-3 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingId(f.id)}
                    className="eyebrow hover:!text-gold"
                  >
                    Editar
                  </button>
                  <InlineConfirm
                    label="Eliminar"
                    question="¿Eliminar este miembro?"
                    onConfirm={() => onRemove(f.id)}
                    disabled={isPending}
                  />
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {initialFounders.length === 0 && !showNew && (
        <p className="text-navy/60">Todavía no agregaste a nadie al equipo.</p>
      )}
    </div>
  );
}

function FounderForm({
  founder,
  onSubmit,
  onCancel,
  isPending,
}: {
  founder: Founder;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [fullName, setFullName] = useState(founder.fullName);
  const [role, setRole] = useState(founder.role);
  const [equityPercent, setEquityPercent] = useState(
    founder.equityPercent ? String(founder.equityPercent) : ""
  );
  const [joinedAt, setJoinedAt] = useState(founder.joinedAt);
  const [linkedinUrl, setLinkedinUrl] = useState(founder.linkedinUrl);
  const [bio, setBio] = useState(founder.bio);
  const [references, setReferences] = useState(founder.references);
  const [isActive, setIsActive] = useState(String(founder.isActive));

  return (
    <form action={onSubmit} className="space-y-5">
      <input type="hidden" name="founderId" value={founder.id} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        <FloatingInput
          id="fullName"
          label="Nombre completo"
          value={fullName}
          onChange={setFullName}
          required
        />
        <FloatingInput
          id="role"
          label="Rol"
          value={role}
          onChange={setRole}
          required
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        <FloatingInput
          id="equityPercent"
          type="number"
          step="any"
          label="Equity %"
          value={equityPercent}
          onChange={setEquityPercent}
        />
        <FloatingDate
          id="joinedAt"
          label="Se unió (opcional)"
          value={joinedAt}
          onChange={setJoinedAt}
        />
      </div>
      <FloatingInput
        id="linkedinUrl"
        type="url"
        inputMode="url"
        label="LinkedIn (opcional)"
        value={linkedinUrl}
        onChange={setLinkedinUrl}
      />
      <FloatingTextarea
        id="bio"
        label="Bio / experiencia (opcional)"
        value={bio}
        onChange={setBio}
        rows={3}
      />
      <FloatingTextarea
        id="references"
        label="Referencias (3) — opcional"
        value={references}
        onChange={setReferences}
        rows={3}
      />
      <div>
        <FloatingSelect
          id="isActive"
          label="Estado"
          value={isActive}
          onChange={setIsActive}
          options={[
            { value: "true", label: "Activo" },
            { value: "false", label: "Inactivo (histórico)" },
          ]}
        />
        <input type="hidden" name="isActive" value={isActive} />
      </div>
      <div className="flex justify-end gap-4 hairline-t pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="eyebrow hover:!text-gold"
        >
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-50">
          {isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
