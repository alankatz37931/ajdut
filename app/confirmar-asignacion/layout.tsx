import { PublicNav } from "@/components/landing/PublicNav";
import { PublicFooter } from "@/components/landing/PublicFooter";

/**
 * Layout público de la confirmación bilateral de asignaciones. El target NO
 * necesita estar logueado para confirmar — sólo tener el link de un solo uso
 * que llegó por mail. Misma estructura que el viejo `confirmar-vida` (Wave 2b
 * lo borró, ver pending-assignment.ts para el patrón).
 */
export default function ConfirmAsignacionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav />
      <main className="flex flex-1 items-center justify-center py-4">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
