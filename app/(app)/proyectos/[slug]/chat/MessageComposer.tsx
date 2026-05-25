"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { postMessageAction } from "./actions";
import { FloatingInput, FloatingTextarea } from "@/components/ui/Floating";

type ComposerDict = Dict["chat"]["composer"];

type Props = {
  projectSlug: string;
  dict: ComposerDict;
};

const MAX_BODY = 4000;

export function MessageComposer({ projectSlug, dict }: Props) {
  const [body, setBody] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    const trimmedBody = body.trim();
    const trimmedUrl = attachmentUrl.trim();
    if (!trimmedBody && !trimmedUrl) {
      setError(dict.errEmpty);
      return;
    }
    if (trimmedUrl && !/^https?:\/\//i.test(trimmedUrl)) {
      setError(dict.errBadUrl);
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
      <FloatingTextarea
        id="chat-body"
        label={dict.bodyLabel}
        value={body}
        onChange={setBody}
        rows={3}
        maxLength={MAX_BODY}
        counterSuffix=""
      />

      <div className="mt-3">
        <FloatingInput
          id="chat-url"
          type="url"
          inputMode="url"
          label={dict.linkLabel}
          value={attachmentUrl}
          onChange={setAttachmentUrl}
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
          {isPending ? dict.sendingBtn : dict.sendBtn}
        </button>
      </div>
    </form>
  );
}
