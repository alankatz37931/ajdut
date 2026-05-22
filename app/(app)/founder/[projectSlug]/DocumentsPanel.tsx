"use client";

import { useState, useTransition } from "react";
import { FileUpload } from "@/components/ui/FileUpload";
import { formatDate } from "@/lib/utils/format";
import { uploadDocumentAction, deleteDocumentAction } from "./document-actions";

type Doc = {
  id: string;
  title: string;
  storageKey: string;
  createdAt: string;
};

const DOC_ACCEPT =
  ".pdf,.xlsx,.xls,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword";

export function DocumentsPanel({
  projectSlug,
  documents,
}: {
  projectSlug: string;
  documents: Doc[];
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div>
      <div className="flex justify-end">
        <button onClick={() => setModalOpen(true)} className="btn-outline">
          + Agregar documento
        </button>
      </div>

      {documents.length === 0 ? (
        <p className="mt-5 text-navy/60">
          Todavía no compartiste ningún documento con tus miembros.
        </p>
      ) : (
        <ul className="mt-5 hairline-t">
          {documents.map((d) => (
            <DocRow key={d.id} projectSlug={projectSlug} doc={d} />
          ))}
        </ul>
      )}

      {modalOpen && (
        <UploadModal
          projectSlug={projectSlug}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function DocRow({ projectSlug, doc }: { projectSlug: string; doc: Doc }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    if (!window.confirm(`¿Eliminar "${doc.title}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await deleteDocumentAction(projectSlug, doc.id);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <li className="hairline-b py-3 flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <p className="text-navy break-words">{doc.title}</p>
        <p className="mt-0.5 eyebrow !text-navy/40">
          {formatDate(new Date(doc.createdAt))}
        </p>
      </div>
      <span className="flex items-center gap-4 shrink-0">
        <a
          href={doc.storageKey}
          target="_blank"
          rel="noopener noreferrer"
          className="eyebrow hover:!text-gold transition-colors"
        >
          Abrir ↗
        </a>
        <button
          onClick={onDelete}
          disabled={isPending}
          className="eyebrow !text-navy/40 hover:!text-navy disabled:opacity-50 p-0 m-0 border-0 bg-transparent cursor-pointer"
        >
          {isPending ? "Eliminando…" : "Eliminar"}
        </button>
        {error && (
          <span className="eyebrow !text-navy" role="alert">
            {error}
          </span>
        )}
      </span>
    </li>
  );
}

function UploadModal({
  projectSlug,
  onClose,
}: {
  projectSlug: string;
  onClose: () => void;
}) {
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function publish() {
    setError(null);
    if (!fileUrl) {
      setError("Subí un archivo primero.");
      return;
    }
    startTransition(async () => {
      const r = await uploadDocumentAction(projectSlug, fileName, fileUrl);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-paper hairline w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-3 hairline-b pb-3">
          <p className="eyebrow !text-navy">Agregar documento</p>
          <button
            onClick={onClose}
            className="eyebrow !text-navy/40 hover:!text-navy p-0 m-0 border-0 bg-transparent cursor-pointer"
          >
            Cerrar ×
          </button>
        </div>

        <p className="mt-4 text-sm text-navy/65 leading-relaxed">
          Subí el archivo. Toda la información — período, cifras, avances — va
          dentro del documento. Tus miembros lo van a ver en su sección
          “Documentos”.
        </p>

        <div className="mt-4">
          <FileUpload
            scope="report-attachment"
            accept={DOC_ACCEPT}
            maxSizeMb={25}
            currentUrl={fileUrl || undefined}
            onUploaded={(url, name) => {
              setFileUrl(url);
              setFileName(name ?? "");
            }}
            label="Archivo del documento"
            helperText="PDF, Excel o Word · máximo 25 MB."
            subtle
          />
        </div>

        {error && (
          <p className="mt-4 eyebrow !text-navy" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            onClick={publish}
            disabled={isPending || !fileUrl}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Publicando…" : "Publicar documento →"}
          </button>
          <button
            onClick={onClose}
            disabled={isPending}
            className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
