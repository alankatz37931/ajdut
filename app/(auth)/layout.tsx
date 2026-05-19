import { PublicNav } from "@/components/landing/PublicNav";
import { PublicFooter } from "@/components/landing/PublicFooter";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav />
      <main className="flex flex-1 items-center justify-center py-4">{children}</main>
      <PublicFooter />
    </div>
  );
}
