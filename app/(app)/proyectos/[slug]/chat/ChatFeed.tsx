"use client";

import { useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import type { FeedItem } from "@/lib/services/chat";
import { deleteMessageAction } from "./actions";
import { PollBlock } from "./PollBlock";
import { formatDate } from "@/lib/utils/format";

type FeedDict = Dict["chat"]["feed"];
type PollDict = Dict["chat"]["poll"];

type Props = {
  items: FeedItem[];
  viewerId: string;
  viewerIsPrivileged: boolean;
  projectSlug: string;
  feedDict: FeedDict;
  pollDict: PollDict;
  locale: string;
};

function timeOf(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(11, 16);
}

export function ChatFeed({
  items,
  viewerId,
  viewerIsPrivileged,
  projectSlug,
  feedDict,
  pollDict,
  locale,
}: Props) {
  if (items.length === 0) {
    // Consistencia con el resto de empty-states de la app (perfil, documentos,
    // historial): navy/60 plano, sin italic. El texto del dict ya invita a
    // ser el primero en escribir.
    return <p className="text-navy/60">{feedDict.empty}</p>;
  }

  return (
    <ul className="hairline-t">
      {items.map((it) => {
        if (it.kind === "message") {
          return (
            <MessageRow
              key={`m-${it.id}`}
              item={it}
              viewerId={viewerId}
              viewerIsPrivileged={viewerIsPrivileged}
              projectSlug={projectSlug}
              dict={feedDict}
              locale={locale}
            />
          );
        }
        return (
          <li key={`p-${it.id}`} className="hairline-b py-5">
            <PollBlock
              poll={it}
              viewerId={viewerId}
              viewerIsPrivileged={viewerIsPrivileged}
              projectSlug={projectSlug}
              dict={pollDict}
              locale={locale}
            />
          </li>
        );
      })}
    </ul>
  );
}

function MessageRow({
  item,
  viewerId,
  viewerIsPrivileged,
  projectSlug,
  dict,
  locale,
}: {
  item: Extract<FeedItem, { kind: "message" }>;
  viewerId: string;
  viewerIsPrivileged: boolean;
  projectSlug: string;
  dict: FeedDict;
  locale: string;
}) {
  const [isPending, startTransition] = useTransition();

  const isOwnAuthor = item.author.id === viewerId;
  // Reglas de display del nombre:
  //  - El autor ve su propio nombre real (fullName).
  //  - Los demás ven el alias si existe; si no, cae a fullName.
  const displayName = isOwnAuthor
    ? item.author.fullName
    : item.author.alias ?? item.author.fullName;

  const isDeleted = !!item.deletedAt;
  const canDelete = viewerIsPrivileged && !isDeleted;

  function onDelete() {
    if (!confirm(dict.confirmDelete)) {
      return;
    }
    startTransition(async () => {
      const r = await deleteMessageAction(projectSlug, item.id);
      if (!r.ok) {
        alert(r.error);
      }
    });
  }

  return (
    <li className="hairline-b py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-sans text-navy">
          {displayName}
          {isOwnAuthor && (
            <span className="ml-2 eyebrow !text-navy/40">{dict.you}</span>
          )}
        </p>
        <p className="eyebrow font-mono shrink-0 !text-navy/40">
          {formatDate(item.createdAt, locale)} · {timeOf(item.createdAt)}
        </p>
      </div>

      {isDeleted ? (
        <div className="mt-2">
          <p className="eyebrow !text-navy/40 italic">
            {dict.deleted}
            {item.deletedBy && ` · ${item.deletedBy.fullName}`}
          </p>
          {viewerIsPrivileged && item.body && (
            <p className="mt-2 text-sm text-navy/40 line-through whitespace-pre-line">
              {item.body}
            </p>
          )}
        </div>
      ) : (
        <>
          {item.body && (
            <p className="mt-2 text-navy/85 leading-relaxed whitespace-pre-line break-words">
              {item.body}
            </p>
          )}
          {item.attachmentUrl && (
            <p className="mt-2">
              <a
                href={item.attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="eyebrow hover:!text-gold break-all"
              >
                ↗ {item.attachmentUrl.replace(/^https?:\/\//, "")}
              </a>
            </p>
          )}
        </>
      )}

      {canDelete && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
          >
            {isPending ? dict.deletingBtn : dict.deleteBtn}
          </button>
        </div>
      )}
    </li>
  );
}
