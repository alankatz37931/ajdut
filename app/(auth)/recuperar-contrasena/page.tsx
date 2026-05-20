import { RecoveryForm } from "./RecoveryForm";
import { BackLink } from "@/components/app/BackLink";

export const metadata = {
  title: "Recuperar contraseña · AJDUT",
};

export default function RecoveryPage() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 sm:px-6 pb-section">
      <BackLink fallback="/acceder">Recuperar contraseña</BackLink>

      <h1 className="font-sans mt-6 text-h1 text-navy">¿Olvidaste tu contraseña?</h1>
      <p className="mt-4 text-navy/75 leading-relaxed">
        Te enviamos un link a tu email.
      </p>

      <div className="mt-10 hairline p-6 bg-paper-light">
        <RecoveryForm />
      </div>
    </div>
  );
}
