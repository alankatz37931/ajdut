import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { ProfileForm } from "./ProfileForm";

export const metadata = {
  title: "Perfil · AJDUT",
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  PROJECT_OWNER: "Founder",
  CO_ADMIN: "Co-admin",
  PARTNER: "Miembro",
};

export default async function ProfilePage() {
  const session = await requireSession();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
    select: { fullName: true, alias: true, role: true, createdAt: true },
  });

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Tu cuenta</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Mi perfil</h1>
        <p className="mt-3 text-navy/75 leading-relaxed">
          Rol: <span className="font-mono text-navy">{ROLE_LABEL[user.role] ?? user.role}</span>
          {" · "}
          Miembro desde{" "}
          <span className="font-mono text-navy">
            {user.createdAt.toLocaleDateString("es-MX")}
          </span>
        </p>
      </header>

      <ProfileForm initialName={user.fullName} initialAlias={user.alias ?? ""} />
    </div>
  );
}
