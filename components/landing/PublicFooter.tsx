import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="hairline-t">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
        <span className="eyebrow">AJDUT · 2026</span>
        <Link href="/legal" className="eyebrow hover:!text-gold transition-colors">
          Aviso legal
        </Link>
      </div>
    </footer>
  );
}
