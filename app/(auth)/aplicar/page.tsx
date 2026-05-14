import Link from "next/link";
import { ApplicationForm } from "./ApplicationForm";

export const metadata = {
  title: "Aplicar · AJDUT",
};

export default function AplicarPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 pb-section">
      <div className="flex items-center gap-3 -ml-2">
        <Link
          href="/"
          aria-label="Volver al inicio"
          className="inline-flex h-8 w-8 items-center justify-center text-navy hover:text-gold transition-colors text-lg"
        >
          ←
        </Link>
        <p className="eyebrow">Aplicación de acceso</p>
      </div>

      <h1 className="font-sans mt-6 text-h1 text-navy">Aplica para ser parte</h1>
      <p className="mt-4 max-w-xl text-navy/75 leading-relaxed">
        AJDUT es una comunidad cerrada. Tu aplicación será revisada manualmente por el equipo.
        No hay registro automático; el acceso se concede tras evaluación.
      </p>

      <div className="mt-10 hairline p-6 bg-paper-light">
        <ApplicationForm />
      </div>
    </div>
  );
}
