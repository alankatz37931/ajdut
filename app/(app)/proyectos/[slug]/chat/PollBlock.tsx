"use client";

import { useTransition } from "react";
import type { FeedItem } from "@/lib/services/chat";
import { votePollAction, closePollAction } from "./actions";
import { formatDate } from "@/lib/utils/format";

type Poll = Extract<FeedItem, { kind: "poll" }>;

type Props = {
  poll: Poll;
  viewerId: string;
  viewerIsPrivileged: boolean;
  projectSlug: string;
};

function timeOf(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(11, 16);
}

export function PollBlock({ poll, viewerId, viewerIsPrivileged, projectSlug }: Props) {
  const [isPending, startTransition] = useTransition();

  const isExpired = poll.closesAt
    ? new Date(poll.closesAt).getTime() <= Date.now()
    : false;
  const isClosed = !!poll.closedAt || isExpired;
  const canClose = !poll.closedAt && (viewerIsPrivileged || poll.createdBy.id === viewerId);

  const isOwnAuthor = poll.createdBy.id === viewerId;
  const displayName = isOwnAuthor
    ? poll.createdBy.fullName
    : poll.createdBy.alias ?? poll.createdBy.fullName;

  function vote(optionId: string) {
    startTransition(async () => {
      const r = await votePollAction(projectSlug, poll.id, optionId);
      if (!r.ok) alert(r.error);
    });
  }

  function close() {
    if (!confirm("¿Cerrar esta encuesta? No se podrán emitir más votos.")) return;
    startTransition(async () => {
      const r = await closePollAction(projectSlug, poll.id);
      if (!r.ok) alert(r.error);
    });
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">
          Encuesta · {displayName}
          {isOwnAuthor && <span className="ml-2 !text-navy/40">(vos)</span>}
        </p>
        <p className="eyebrow font-mono shrink-0 !text-navy/40">
          {formatDate(poll.createdAt)} · {timeOf(poll.createdAt)}
        </p>
      </div>

      <p className="mt-2 font-sans text-navy text-lg leading-snug break-words">
        {poll.question}
      </p>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="eyebrow !text-navy/60">
          {poll.totalVotes} voto{poll.totalVotes === 1 ? "" : "s"}
          {poll.multiple ? " · selección múltiple" : " · respuesta única"}
        </p>
        {poll.closesAt && !poll.closedAt && (
          <p className="eyebrow !text-navy/40">
            {isExpired
              ? `Venció ${formatDate(poll.closesAt)}`
              : `Cierra ${formatDate(poll.closesAt)}`}
          </p>
        )}
        {poll.closedAt && (
          <p className="eyebrow !text-navy/40">
            Cerrada {formatDate(poll.closedAt)}
          </p>
        )}
      </div>

      <ul className="mt-4 space-y-3">
        {poll.options.map((opt) => {
          const pct =
            poll.totalVotes > 0
              ? Math.round((opt.voteCount / poll.totalVotes) * 100)
              : 0;
          const voted = poll.myVoteOptionIds.includes(opt.id);
          return (
            <li key={opt.id}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0 flex items-baseline gap-2">
                  {voted && (
                    <span aria-hidden className="text-gold text-xs">
                      ●
                    </span>
                  )}
                  <span className="text-navy break-words">{opt.label}</span>
                </div>
                <span className="font-mono text-sm text-navy/70 shrink-0">
                  {opt.voteCount} · {pct}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full bg-line">
                <div
                  className={`h-full transition-[width] ${
                    voted ? "bg-gold" : "bg-navy"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {!isClosed && (
                <div className="mt-1.5">
                  <button
                    type="button"
                    onClick={() => vote(opt.id)}
                    disabled={isPending}
                    className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
                  >
                    {voted
                      ? poll.multiple
                        ? "Confirmar"
                        : "Mantener voto"
                      : "Votar esta opción"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {canClose && (
        <div className="mt-4 hairline-t pt-3">
          <button
            type="button"
            onClick={close}
            disabled={isPending}
            className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
          >
            {isPending ? "Cerrando…" : "Cerrar encuesta"}
          </button>
        </div>
      )}
    </div>
  );
}
