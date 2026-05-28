import type { Metadata } from "next";
import { inspectToken } from "@/lib/services/password-setup";
import { SetPasswordForm } from "./SetPasswordForm";
import { BackLink } from "@/components/app/BackLink";
import { getDict } from "@/lib/i18n";

type Params = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.setPassword.metaTitle };
}

export default async function SetPasswordPage({ params }: Params) {
  const { token } = await params;
  const inspection = await inspectToken(token);
  const dict = await getDict();
  const t = dict.setPassword;

  if (!inspection.ok) {
    return <InvalidTokenView reason={inspection.error} dict={t.invalid} />;
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 sm:px-6 pb-section">
      <BackLink fallback="/">{t.back}</BackLink>

      <h1 className="font-sans mt-6 text-h1 text-navy">
        {t.helloName.replace(
          "{name}",
          inspection.user.fullName.split(" ")[0] ?? ""
        )}
      </h1>
      <p className="mt-4 text-navy/75 leading-relaxed">{t.intro}</p>
      <p className="mt-2 eyebrow break-words [overflow-wrap:anywhere]">
        {t.accountLabel}{" "}
        <span className="font-mono normal-case tracking-normal !text-navy">
          {inspection.user.email}
        </span>
      </p>

      <div className="mt-10 hairline p-6 bg-paper-light">
        <SetPasswordForm token={token} email={inspection.user.email} dict={t} />
      </div>
    </div>
  );
}

function InvalidTokenView({
  reason,
  dict,
}: {
  reason: "TOKEN_NOT_FOUND" | "TOKEN_USED" | "TOKEN_EXPIRED";
  dict: Awaited<ReturnType<typeof getDict>>["setPassword"]["invalid"];
}) {
  const COPY: Record<typeof reason, { title: string; body: string }> = {
    TOKEN_NOT_FOUND: { title: dict.notFoundTitle, body: dict.notFoundBody },
    TOKEN_USED: { title: dict.usedTitle, body: dict.usedBody },
    TOKEN_EXPIRED: { title: dict.expiredTitle, body: dict.expiredBody },
  };
  const c = COPY[reason];
  return (
    <div className="mx-auto w-full max-w-md px-4 sm:px-6 pb-section">
      <BackLink fallback="/">{dict.back}</BackLink>
      <h1 className="font-sans mt-6 text-h1 text-navy">{c.title}</h1>
      <p className="mt-4 text-navy/75 leading-relaxed">{c.body}</p>
    </div>
  );
}
