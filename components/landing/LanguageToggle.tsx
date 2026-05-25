"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/lib/preferences";
import { setLanguagePublicAction } from "./language-actions";

/**
 * Toggle EN | ES para el PublicNav. El idioma activo se ve en navy lleno
 * y bold; el inactivo en navy/40 + medium con hover gold. Cliquear el
 * activo es no-op.
 */
export function LanguageToggle({ current }: { current: Language }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function pick(lang: Language) {
    if (lang === current || isPending) return;
    startTransition(async () => {
      await setLanguagePublicAction(lang);
      router.refresh();
    });
  }

  const baseBtn =
    "p-0 m-0 border-0 bg-transparent cursor-pointer transition-colors";
  const activeCls = "!text-navy/80 font-bold";
  const idleCls =
    "!text-navy/40 font-medium hover:!text-gold disabled:hover:!text-navy/40";

  return (
    <span className="text-[0.7rem] sm:text-xs uppercase tracking-widest leading-none inline-flex items-center">
      <button
        type="button"
        onClick={() => pick("en")}
        disabled={isPending}
        aria-pressed={current === "en"}
        className={`${baseBtn} ${current === "en" ? activeCls : idleCls}`}
      >
        EN
      </button>
      <span aria-hidden className="!text-navy/30 mx-1.5">
        |
      </span>
      <button
        type="button"
        onClick={() => pick("es")}
        disabled={isPending}
        aria-pressed={current === "es"}
        className={`${baseBtn} ${current === "es" ? activeCls : idleCls}`}
      >
        ES
      </button>
    </span>
  );
}
