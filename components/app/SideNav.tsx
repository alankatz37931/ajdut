"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { BrandMark } from "@/components/landing/BrandMark";

export type NavItem = {
  label: string;
  href: Route;
  /** Número opcional a mostrar a la derecha (ej. pendientes) */
  badge?: number;
  /** Si true, el badge se pinta en oro para llamar la atención */
  badgeHighlight?: boolean;
  /** Etiqueta de grupo opcional, para separar visualmente cuando crezca el menú */
  group?: string;
  /** Si true, el item se ancla al fondo del nav (arriba del bloque de usuario) */
  pinBottom?: boolean;
};

type Props = {
  user: { name: string; email: string };
  roleLabel: string;
  navItems: NavItem[];
};

export function SideNav({ user, roleLabel, navItems }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "";

  // Lock del scroll del body cuando el drawer mobile está abierto: sin esto,
  // el contenido detrás del overlay sigue scrolleando.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Si cambia la ruta con el drawer abierto, lo cerramos para no dejarlo abierto sobre la
  // página nueva. (Los Link ya llaman close(), pero esto cubre nav externa.)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function isActive(href: string): boolean {
    if (pathname === href) return true;
    return href !== "/" && pathname.startsWith(href + "/");
  }

  function close() {
    setOpen(false);
  }

  const displayName = user.name ?? user.email;
  const compactName = displayName.split("@")[0] ?? displayName;

  // Separar items que van arriba vs. anclados al fondo del nav
  const topItems = navItems.filter((i) => !i.pinBottom);
  const bottomItems = navItems.filter((i) => i.pinBottom);

  // Agrupar los top items si tienen `group`
  const grouped = new Map<string, NavItem[]>();
  for (const item of topItems) {
    const key = item.group ?? "";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  function renderItem(item: NavItem) {
    const active = isActive(item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={close}
          aria-current={active ? "page" : undefined}
          className={`relative flex items-center justify-between gap-3 pl-6 pr-6 py-3 eyebrow leading-none transition-colors ${
            active
              ? "!text-navy bg-paper-dark"
              : "hover:!text-navy hover:bg-paper-light"
          }`}
        >
          <span
            aria-hidden
            className={`absolute left-0 inset-y-0 w-[2px] bg-gold transition-opacity ${
              active ? "opacity-100" : "opacity-0"
            }`}
          />
          <span className="truncate">{item.label}</span>
          {typeof item.badge === "number" && item.badge > 0 && (
            <span
              className={`font-mono text-xs shrink-0 ${
                item.badgeHighlight ? "text-gold" : "!text-navy/40"
              }`}
            >
              {item.badge}
            </span>
          )}
        </Link>
      </li>
    );
  }

  return (
    <>
      {/* ─── Mobile top bar con hamburguesa ───────────────────────── */}
      <div className="md:hidden hairline-b sticky top-0 z-30 surface-paper">
        <div className="flex items-baseline justify-between gap-3 px-4 py-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            className="text-navy text-xl leading-none p-0 m-0 border-0 bg-transparent cursor-pointer"
          >
            ☰
          </button>
          <BrandMark />
          <span className="eyebrow truncate max-w-[100px] leading-none">{compactName}</span>
        </div>
      </div>

      {/* ─── Overlay mobile ─────────────────────────────────────── */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-navy/40"
          onClick={close}
          aria-hidden
        />
      )}

      {/* ─── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 surface-paper flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
        style={{ borderRight: "0.5px solid var(--ajdut-line, #E8E3D9)" }}
      >
        {/* Logo + close (mobile) */}
        <div className="flex items-baseline justify-between gap-3 px-6 py-5 hairline-b">
          <BrandMark />
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar menú"
            className="md:hidden text-navy text-lg leading-none p-0 m-0 border-0 bg-transparent cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Role badge */}
        <p className="eyebrow px-6 py-4 hairline-b leading-none">{roleLabel}</p>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2 flex flex-col">
          <div>
            {Array.from(grouped.entries()).map(([groupName, items], idx) => (
              <div
                key={groupName || `g-${idx}`}
                className={idx > 0 ? "mt-4 pt-4 hairline-t" : ""}
              >
                {groupName && (
                  <p className="eyebrow px-6 mb-2 !text-navy/40">{groupName}</p>
                )}
                <ul>{items.map(renderItem)}</ul>
              </div>
            ))}
          </div>

          {bottomItems.length > 0 && (
            <div className="mt-auto pt-4 hairline-t">
              <ul>{bottomItems.map(renderItem)}</ul>
            </div>
          )}
        </nav>

        {/* User + logout */}
        <div className="hairline-t px-6 py-4">
          <p
            className="text-navy text-sm leading-tight truncate"
            title={displayName}
          >
            {displayName}
          </p>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="mt-2 eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer leading-none"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
