import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="hairline-t">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
        <span className="eyebrow">AJDUT · Sello de Unión · v1.0</span>
        <div className="flex items-center gap-6">
          <Link href="/nosotros" className="eyebrow hover:!text-gold transition-colors">
            Nosotros
          </Link>
          <Link href="/legal" className="eyebrow hover:!text-gold transition-colors">
            Aviso legal
          </Link>
        </div>
      </div>
    </footer>
  );
}
