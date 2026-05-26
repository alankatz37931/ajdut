"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { BrandMark } from "@/components/landing/BrandMark";
import { useFocusTrap } from "@/components/hooks/useFocusTrap";

export type NavItem = {
  label: string;
  href: Route;
  /** Icono opcional a la izquierda del label (SVG 16px, currentColor). */
  icon?: React.ReactNode;
  /** Número opcional a mostrar a la derecha (ej. pendientes) */
  badge?: number;
  /** Si true, el badge se pinta como cápsula gold para llamar la atención */
  badgeHighlight?: boolean;
  /** Etiqueta de sección. Se renderiza como header arriba del grupo. */
  group?: string;
  /** Si true, el item se ancla al fondo del nav (institucional, sin section header) */
  pinBottom?: boolean;
};

/** Sub-dict que el server component padre (AppShell) pasa como prop. */
export type SideNavLabels = {
  openMenu: string;
  closeMenu: string;
  logout: string;
  brandTagline: string;
  brandAriaLabel: string;
};

type Props = {
  user: {
    name: string;
    email: string;
    avatarUrl?: string | null;
    /** Etiqueta visible del rol (ej. "Admin", "Project owner"). Se muestra
     *  bajo el logo como contexto del viewer. */
    roleLabel?: string;
  };
  navItems: NavItem[];
  labels: SideNavLabels;
};

/** Iniciales en círculo cuando no hay avatarUrl. Usa máximo 2 caracteres. */
function initialsOf(name: string): string {
  const cleaned = name.trim();
  if (cleaned.length === 0) return "?";
  const parts = cleaned.split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    return (parts[0]?.[0] ?? "?").toUpperCase();
  }
  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  return (first + last).toUpperCase();
}

export function SideNav({ user, navItems, labels }: Props) {
  const [open, setOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const pathname = usePathname() ?? "";

  function toggleGroup(name: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function isActive(href: string): boolean {
    if (pathname === href) return true;
    return href !== "/" && pathname.startsWith(href + "/");
  }

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // Atrapa foco + Esc dentro del drawer cuando esta abierto en mobile.
  // En desktop `open` siempre es false (el aside vive via md:translate-x-0),
  // asi que el trap NUNCA se activa en desktop — el aside actua como landmark
  // de nav normal en desktop.
  const drawerRef = useFocusTrap<HTMLElement>(open, close);

  const displayName = user.name ?? user.email;
  const compactName = displayName.split("@")[0] ?? displayName;

  const topItems = navItems.filter((i) => !i.pinBottom);
  const bottomItems = navItems.filter((i) => i.pinBottom);

  const grouped = new Map<string, NavItem[]>();
  for (const item of topItems) {
    const key = item.group ?? "";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  function renderItem(item: NavItem, opts?: { faded?: boolean }) {
    const active = isActive(item.href);
    const faded = opts?.faded ?? false;

    // Color del label: inactivo neutro / hover más claro / activo paper bright.
    // Items "faded" (institucional) parten de un tono más bajo.
    // Sidebar fijo en navy — no se intercambia con tema.
    const idleClass = faded
      ? "!text-paper/35 hover:!text-paper/70"
      : "!text-paper/55 hover:!text-paper/85";
    const stateClass = active
      ? "!text-paper font-medium bg-paper/5"
      : idleClass;

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={close}
          aria-current={active ? "page" : undefined}
          className={`relative flex items-center justify-between gap-3 pl-6 pr-4 py-2.5 eyebrow leading-none transition-colors ${stateClass}`}
        >
          <span
            aria-hidden
            className={`absolute left-0 inset-y-0 w-[2px] bg-gold transition-opacity ${
              active ? "opacity-100" : "opacity-0"
            }`}
          />
          <span className="flex items-center gap-2.5 min-w-0">
            {item.icon && (
              <span aria-hidden className="shrink-0 inline-flex">
                {item.icon}
              </span>
            )}
            <span className="truncate">{item.label}</span>
          </span>
          {typeof item.badge === "number" && item.badge > 0 && (
            item.badgeHighlight ? (
              // Cápsula gold — llama la atención (pendientes admin).
              <span className="shrink-0 inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full bg-gold/15 text-gold font-mono text-[11px] leading-none">
                {item.badge}
              </span>
            ) : (
              <span className="shrink-0 font-mono text-xs !text-paper/40">
                {item.badge}
              </span>
            )
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
            aria-label={labels.openMenu}
            className="text-navy text-xl leading-none p-0 m-0 border-0 bg-transparent cursor-pointer"
          >
            ☰
          </button>
          <BrandMark tagline={labels.brandTagline} ariaLabel={labels.brandAriaLabel} />
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

      {/* ─── Sidebar — fijo en navy, no se intercambia con tema ────── */}
      <aside
        ref={drawerRef}
        {...(open
          ? {
              role: "dialog",
              "aria-modal": true,
              "aria-label": labels.openMenu,
            }
          : {})}
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-navy flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        {/* Logo + close (mobile). Variant paper porque el fondo es navy.
            Bajo el logo va el roleLabel como eyebrow para que el viewer
            tenga claro desde qué rol está navegando. */}
        <div className="px-6 py-5 border-b border-paper/10">
          <div className="flex items-baseline justify-between gap-3">
            <BrandMark
              variant="paper"
              tagline={labels.brandTagline}
              ariaLabel={labels.brandAriaLabel}
            />
            <button
              type="button"
              onClick={close}
              aria-label={labels.closeMenu}
              className="md:hidden text-paper text-lg leading-none p-0 m-0 border-0 bg-transparent cursor-pointer"
            >
              ✕
            </button>
          </div>
          {user.roleLabel && (
            <p className="mt-3 eyebrow !text-paper/40">{user.roleLabel}</p>
          )}
        </div>

        {/* Nav items.
            Estructura visual:
              [SECCIÓN A]
                · item
                · item
              [SECCIÓN B]
                · item
            (mt-auto empuja el bloque institucional al fondo del nav scroll)
              · sobre nosotros  (faded)
              · aviso legal     (faded)
            El bloque de usuario queda fuera de <nav>, fijo abajo. */}
        <nav
          className="flex-1 overflow-y-auto pt-4 pb-2 flex flex-col [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([groupName, items], idx) => {
              const collapsed = groupName ? collapsedGroups.has(groupName) : false;
              return (
                <div key={groupName || `g-${idx}`}>
                  {groupName && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(groupName)}
                      aria-expanded={!collapsed}
                      className="w-full flex items-center justify-between gap-2 px-6 mb-2 p-0 m-0 border-0 bg-transparent cursor-pointer"
                    >
                      <span className="font-sans font-bold text-[10px] tracking-[0.2em] uppercase !text-paper/40">
                        {groupName}
                      </span>
                      <span
                        aria-hidden
                        className={`!text-paper/40 leading-none font-mono text-[10px] transition-transform duration-150 ${
                          collapsed ? "" : "rotate-180"
                        }`}
                      >
                        ▾
                      </span>
                    </button>
                  )}
                  {!collapsed && <ul>{items.map((item) => renderItem(item))}</ul>}
                </div>
              );
            })}
          </div>

          {bottomItems.length > 0 && (
            <div className="mt-auto pt-6">
              <ul>
                {bottomItems.map((item) => renderItem(item, { faded: true }))}
              </ul>
            </div>
          )}
        </nav>

        {/* User + logout — clickeable al perfil */}
        <div className="border-t border-paper/10 px-6 py-4">
          <Link
            href={"/perfil" as Route}
            onClick={close}
            className="flex items-center gap-2.5 group cursor-pointer"
            aria-label={user.name ? `Ir al perfil de ${user.name}` : "Ir al perfil"}
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt=""
                className="rounded-full w-7 h-7 object-cover border-hairline border-paper/20 shrink-0"
              />
            ) : (
              <span
                aria-hidden
                className="rounded-full w-7 h-7 shrink-0 bg-paper/10 border-hairline border-paper/20 flex items-center justify-center font-mono text-[10px] text-paper"
              >
                {initialsOf(displayName)}
              </span>
            )}
            <p
              className="text-paper text-sm leading-tight truncate group-hover:text-gold transition-colors"
              title={displayName}
            >
              {displayName}
            </p>
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="mt-2 font-sans text-xs text-paper/40 hover:text-paper/70 p-0 m-0 border-0 bg-transparent cursor-pointer leading-none transition-colors"
          >
            {labels.logout.toLocaleLowerCase()}
          </button>
        </div>
      </aside>
    </>
  );
}
