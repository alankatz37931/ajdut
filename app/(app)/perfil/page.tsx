import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict, getLocale } from "@/lib/i18n";
import { getRoleLabel } from "@/components/app/nav-items";
import { HeaderAvatar } from "./HeaderAvatar";
import { ProfileSurface } from "./ProfileSurface";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.profile.metaTitle };
}

export default async function ProfilePage() {
  const session = await requireSession();
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.profile;
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
    select: {
      fullName: true,
      alias: true,
      role: true,
      createdAt: true,
      avatarUrl: true,
      country: true,
      phone: true,
    },
  });
  const roleLabel = await getRoleLabel(user.role);

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7 flex items-center gap-5 sm:gap-6">
        <HeaderAvatar initialUrl={user.avatarUrl ?? ""} dict={t} />
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">
            {user.fullName}
          </h1>
          <p className="mt-3 text-navy/75 leading-relaxed">
            {t.roleLine}{" "}
            <span className="font-mono text-navy">{roleLabel}</span>
            {" · "}
            {t.memberSince}{" "}
            <span className="font-mono text-navy">
              {user.createdAt.toLocaleDateString(locale)}
            </span>
          </p>
        </div>
      </header>

      <ProfileSurface
        initialName={user.fullName}
        initialAlias={user.alias ?? ""}
        initialCountry={user.country ?? ""}
        initialPhone={user.phone ?? ""}
        dict={t}
      />
    </div>
  );
}
