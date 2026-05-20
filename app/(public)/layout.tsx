import { PublicNav } from "@/components/landing/PublicNav";
import { PublicFooter } from "@/components/landing/PublicFooter";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav />
      {/* Main centrado vertical en su propio espacio. Footer sticky abajo,
          chico y al pie — el espacio vacío se reparte alrededor del main. */}
      <main className="flex-1 flex flex-col justify-center">{children}</main>
      <PublicFooter />
    </div>
  );
}
