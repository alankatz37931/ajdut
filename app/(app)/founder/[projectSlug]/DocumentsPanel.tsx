"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import type { Dict } from "@/lib/i18n";
import { FileUpload } from "@/components/ui/FileUpload";
import { formatDate } from "@/lib/utils/format";
import { useFocusTrap } from "@/components/hooks/useFocusTrap";
import { uploadDocumentAction, deleteDocumentAction } from "./document-actions";

type Doc = {
  id: string;
  title: string;
  storageKey: string;
  createdAt: string;
};

type PanelDict = Dict["documentsPanel"];
type UploadDict = Dict["fileUpload"];

const DOC_ACCEPT =
  ".pdf,.xlsx,.xls,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword";

export function DocumentsPanel({
  projectSlug,
  documents,
  dict,
  uploadDict,
  locale,
}: {
  projectSlug: string;
  documents: Doc[];
  dict: PanelDict;
  uploadDict: UploadDict;
  locale: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  // Si la URL trae ?addDoc=1 (deep-link desde el checklist del founder),
  // abrimos el modal apenas montamos.
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams?.get("addDoc") === "1") setModalOpen(true);
  }, [searchParams]);

  return (
    <div>
      {/* El CTA "Nuevo documento →" vive en el FounderSection (top-right),
          mismo estilo que las otras secciones (Métricas, Avisos, etc.).
          Llega como ?addDoc=1 y se atrapa en el useEffect de arriba. */}
      {documents.length === 0 ? (
        <p className="text-navy/60">{dict.empty}</p>
      ) : (
        <ul className="hairline-t">
          {documents.map((d) => (
            <DocRow
              key={d.id}
              projectSlug={projectSlug}
              doc={d}
              dict={dict}
              locale={locale}
            />
          ))}
        </ul>
      )}

      {modalOpen && (
        <UploadModal
          projectSlug={projectSlug}
          onClose={() => setModalOpen(false)}
          dict={dict}
          uploadDict={uploadDict}
        />
      )}
    </div>
  );
}

function DocRow({
  projectSlug,
  doc,
  dict,
  locale,
}: {
  projectSlug: string;
  doc: Doc;
  dict: PanelDict;
  locale: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    if (!window.confirm(dict.deleteConfirm.replace("{title}", doc.title))) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await deleteDocumentAction(projectSlug, doc.id);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <li className="hairline-b last:border-b-0 py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <p className="text-navy break-words">{doc.title}</p>
        <p className="mt-0.5 eyebrow !text-navy/40">
          {formatDate(new Date(doc.createdAt), locale)}
        </p>
      </div>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 shrink-0">
        <a
          href={doc.storageKey}
          target="_blank"
          rel="noopener noreferrer"
          className="eyebrow hover:!text-gold transition-colors"
        >
          {dict.openLink}
        </a>
        <button
          onClick={onDelete}
          disabled={isPending}
          className="eyebrow !text-navy/40 hover:!text-navy disabled:opacity-50 p-0 m-0 border-0 bg-transparent cursor-pointer"
        >
          {isPending ? dict.deletingBtn : dict.deleteBtn}
        </button>
        {error && (
          <span className="eyebrow !text-navy basis-full sm:basis-auto" role="alert">
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
  dict,
  uploadDict,
}: {
  projectSlug: string;
  onClose: () => void;
  dict: PanelDict;
  uploadDict: UploadDict;
}) {
  const m = dict.modal;
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const titleId = "upload-modal-title";
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);

  function publish() {
    setError(null);
    if (!fileUrl) {
      setError(m.errNoFile);
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-paper hairline w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-3 hairline-b pb-3">
          <p id={titleId} className="eyebrow !text-navy">{m.title}</p>
          <button
            onClick={onClose}
            className="eyebrow !text-navy/40 hover:!text-navy p-0 m-0 border-0 bg-transparent cursor-pointer"
          >
            {m.closeBtn}
          </button>
        </div>

        {m.description && (
          <p className="mt-4 text-sm text-navy/65 leading-relaxed">
            {m.description}
          </p>
        )}

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
            label={m.fileLabel}
            helperText={m.fileHelper}
            subtle
            dict={uploadDict}
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
            {isPending ? m.publishingBtn : m.publishBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
