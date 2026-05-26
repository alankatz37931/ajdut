import { PublicNav } from "@/components/landing/PublicNav";
import { PublicFooter } from "@/components/landing/PublicFooter";

/**
 * Layout público para /confirmar-vida/[token]. La ruta es accesible sin
 * sesión y la valida un token random hasheado (single-use, expira a los
 * LIFE_CONFIRM_TOKEN_TTL_DAYS días) — mismo patrón que
 * /establecer-contrasena. Usa el chrome público para que el email no
 * descargue al usuario a una pantalla rara.
 */
export default function ConfirmarVidaLayout({
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
