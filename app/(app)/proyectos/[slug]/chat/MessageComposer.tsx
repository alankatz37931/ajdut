"use client";

import { useState, useTransition } from "react";
import { postMessageAction } from "./actions";

type Props = {
  projectSlug: string;
};

const MAX_BODY = 4000;

export function MessageComposer({ projectSlug }: Props) {
  const [body, setBody] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    const trimmedBody = body.trim();
    const trimmedUrl = attachmentUrl.trim();
    if (!trimmedBody && !trimmedUrl) {
      setError("Escribí un mensaje o adjuntá un link.");
      return;
    }
    if (trimmedUrl && !/^https?:\/\//i.test(trimmedUrl)) {
      setError("El link debe empezar con http:// o https://");
      return;
    }
    formData.set("body", trimmedBody);
    formData.set("attachmentUrl", trimmedUrl);
    startTransition(async () => {
      const r = await postMessageAction(projectSlug, formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setBody("");
      setAttachmentUrl("");
    });
  }

  return (
    <form action={submit} className="hairline p-4 bg-paper-light">
      <label htmlFor="chat-body" className="eyebrow block mb-1.5">
        Mensaje
      </label>
      <textarea
        id="chat-body"
        name="body"
        rows={3}
        maxLength={MAX_BODY}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Escribí algo para el equipo del proyecto…"
        className="w-full resize-none border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-sm text-navy focus:outline-none focus:border-navy"
      />
      <p className="eyebrow mt-1.5 !text-navy/40">
        {body.length} / {MAX_BODY}
      </p>

      <div className="mt-3">
        <label htmlFor="chat-url" className="eyebrow block mb-1.5">
          Adjuntar link <span className="!text-navy/40">(opcional)</span>
        </label>
        <input
          id="chat-url"
          name="attachmentUrl"
          type="url"
          value={attachmentUrl}
          onChange={(e) => setAttachmentUrl(e.target.value)}
          placeholder="https://drive.google.com/…"
          className="w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-sm text-navy focus:outline-none focus:border-navy"
        />
      </div>

      {error && (
        <p className="eyebrow !text-navy mt-3" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </form>
  );
}
