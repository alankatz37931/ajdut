import { inspectToken } from "@/lib/services/password-setup";
import { SetPasswordForm } from "./SetPasswordForm";
import { BackLink } from "@/components/app/BackLink";

type Params = { params: Promise<{ token: string }> };

export const metadata = {
  title: "Establecer contraseña · AJDUT",
};

export default async function SetPasswordPage({ params }: Params) {
  const { token } = await params;
  const inspection = await inspectToken(token);

  if (!inspection.ok) {
    return <InvalidTokenView reason={inspection.error} />;
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 sm:px-6 pb-section">
      <BackLink fallback="/">Acceso aprobado</BackLink>

      <h1 className="font-sans mt-6 text-h1 text-navy">
        Hola, {inspection.user.fullName.split(" ")[0]}.
      </h1>
      <p className="mt-4 text-navy/75 leading-relaxed">
        Tu aplicación fue aprobada. Establecé tu contraseña para entrar a AJDUT.
      </p>
      <p className="mt-2 eyebrow">
        Cuenta:{" "}
        <span className="font-mono normal-case tracking-normal !text-navy">
          {inspection.user.email}
        </span>
      </p>

      <div className="mt-10 hairline p-6 bg-paper-light">
        <SetPasswordForm token={token} email={inspection.user.email} />
      </div>
    </div>
  );
}

function InvalidTokenView({
  reason,
}: {
  reason: "TOKEN_NOT_FOUND" | "TOKEN_USED" | "TOKEN_EXPIRED";
}) {
  const COPY: Record<typeof reason, { title: string; body: string }> = {
    TOKEN_NOT_FOUND: {
      title: "Link no válido",
      body:
        "El link que usaste no corresponde a ningún registro. Si te aprobaron recientemente, revisá tu email por el link más reciente.",
    },
    TOKEN_USED: {
      title: "Link ya utilizado",
      body:
        "Este link de un solo uso ya fue consumido. Si necesitás restablecer tu contraseña, contactá al equipo de AJDUT.",
    },
    TOKEN_EXPIRED: {
      title: "Link expirado",
      body:
        "Pasaron más de 72 horas desde la aprobación. Pedile al admin de AJDUT que te envíe un link nuevo.",
    },
  };
  const c = COPY[reason];
  return (
    <div className="mx-auto w-full max-w-md px-4 sm:px-6 pb-section">
      <BackLink fallback="/">Link inválido</BackLink>
      <h1 className="font-sans mt-6 text-h1 text-navy">{c.title}</h1>
      <p className="mt-4 text-navy/75 leading-relaxed">{c.body}</p>
    </div>
  );
}
