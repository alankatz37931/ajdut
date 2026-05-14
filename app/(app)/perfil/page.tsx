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
  PARTNER: "Socio",
};

export default async function ProfilePage() {
  const session = await requireSession();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
    select: { fullName: true, email: true, role: true, createdAt: true },
  });

  return (
    <div className="max-w-2xl">
      <h1 className="font-sans text-h1 text-navy">Mi perfil</h1>
      <p className="mt-3 text-navy/75 leading-relaxed">
        Rol: <span className="font-mono text-navy">{ROLE_LABEL[user.role] ?? user.role}</span>
        {" · "}
        Miembro desde{" "}
        <span className="font-mono text-navy">
          {user.createdAt.toLocaleDateString("es-MX")}
        </span>
      </p>

      <ProfileForm initialName={user.fullName} email={user.email} />
    </div>
  );
}
