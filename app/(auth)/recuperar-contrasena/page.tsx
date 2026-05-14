import Link from "next/link";
import { RecoveryForm } from "./RecoveryForm";

export const metadata = {
  title: "Recuperar contraseña · AJDUT",
};

export default function RecoveryPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 sm:px-6 pb-section">
      <div className="flex items-center gap-3 -ml-2">
        <Link
          href="/acceder"
          aria-label="Volver al login"
          className="inline-flex h-8 w-8 items-center justify-center text-navy hover:text-gold transition-colors text-lg"
        >
          ←
        </Link>
        <p className="eyebrow">Recuperar contraseña</p>
      </div>

      <h1 className="font-sans mt-6 text-h1 text-navy">¿Olvidaste tu contraseña?</h1>
      <p className="mt-4 text-navy/75 leading-relaxed">
        Te enviamos un link de un solo uso al email registrado. El link es válido por 1 hora.
      </p>

      <div className="mt-10 hairline p-6 bg-paper-light">
        <RecoveryForm />
      </div>
    </div>
  );
}
