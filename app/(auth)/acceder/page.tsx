import Link from "next/link";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Acceder · AJDUT",
};

export default function AccederPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 sm:px-6 pb-section">
      <div className="flex items-center gap-3 -ml-2">
        <Link
          href="/"
          aria-label="Volver al inicio"
          className="inline-flex h-8 w-8 items-center justify-center text-navy hover:text-gold transition-colors text-lg"
        >
          ←
        </Link>
        <p className="eyebrow">Acceder</p>
      </div>

      <h1 className="font-sans mt-6 text-h1 text-navy">Identifícate</h1>
      <p className="mt-4 text-navy/75 leading-relaxed">
        El acceso a AJDUT es por invitación. Si aún no formas parte,{" "}
        <Link href="/aplicar" className="text-navy underline decoration-gold underline-offset-4">
          aplica para ser parte
        </Link>
        .
      </p>

      <div className="mt-10 hairline p-6 bg-paper-light">
        <LoginForm />
      </div>

      <p className="mt-6 eyebrow">
        <Link
          href="/recuperar-contrasena"
          className="hover:!text-gold transition-colors"
        >
          ¿Olvidaste tu contraseña? →
        </Link>
      </p>
    </div>
  );
}
