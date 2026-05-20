import Link from "next/link";
import type { Route } from "next";

/**
 * ParticipateFooterCta — bloque de cierre de la ficha.
 *
 * Cuando el lector terminó de scrollear, el siguiente paso natural es
 * decir "quiero saber más / participar". Este bloque ocupa el ancho de la
 * lectura, paper-dark sutil, una pregunta grande y EL botón principal.
 *
 * Sin emoji, sin gradiente, sin sombra. Hairline arriba y abajo.
 */

type Action =
  | { kind: "primary"; label: string; href: string }
  | { kind: "outline"; label: string; href: string }
  | { kind: "muted"; label: string };

type Props = {
  eyebrow: string;
  question: string;
  body?: string;
  actions: Action[];
};

function renderAction(a: Action, i: number) {
  if (a.kind === "muted") {
    return (
      <span key={i} className="eyebrow !text-navy/60">
        {a.label}
      </span>
    );
  }
  const cls = a.kind === "primary" ? "btn-primary" : "btn-outline";
  if (a.href.startsWith("#") || a.href.startsWith("http")) {
    return (
      <a key={i} href={a.href} className={cls}>
        {a.label}
      </a>
    );
  }
  return (
    <Link key={i} href={a.href as Route} className={cls}>
      {a.label}
    </Link>
  );
}

export function ParticipateFooterCta({ eyebrow, question, body, actions }: Props) {
  return (
    <section className="mt-16 hairline-t hairline-b bg-paper-light px-1 sm:px-2 py-12 sm:py-16">
      <p className="eyebrow">{eyebrow}</p>
      <p className="mt-5 font-sans text-h1 text-navy max-w-2xl">{question}</p>
      {body && (
        <p className="mt-4 max-w-2xl text-navy/75 leading-relaxed">{body}</p>
      )}
      {actions.length > 0 && (
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
          {actions.map(renderAction)}
        </div>
      )}
    </section>
  );
}
