import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict, getLocale } from "@/lib/i18n";
import { getRoleLabel } from "@/components/app/nav-items";
import { ProfileForm } from "./ProfileForm";

export const metadata = {
  title: "Perfil · AJDUT",
};

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
      idPhotoUrl: true,
    },
  });
  const roleLabel = await getRoleLabel(user.role);

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">{t.title}</h1>
        <p className="mt-3 text-navy/75 leading-relaxed">
          {t.roleLine}{" "}
          <span className="font-mono text-navy">{roleLabel}</span>
          {" · "}
          {t.memberSince}{" "}
          <span className="font-mono text-navy">
            {user.createdAt.toLocaleDateString(locale)}
          </span>
        </p>
      </header>

      <ProfileForm
        initialName={user.fullName}
        initialAlias={user.alias ?? ""}
        initialAvatarUrl={user.avatarUrl ?? ""}
        initialIdPhotoUrl={user.idPhotoUrl ?? ""}
        dict={t}
      />
    </div>
  );
}
