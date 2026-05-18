"use client";

import { useState, useEffect } from "react";

/**
 * Cuerpo del proyecto en scroll único (Opción A): el contenido fluye y la
 * página mide lo que mide el contenido — sin marco fijo que llenar, así se
 * ve bien cargue lo que cargue el founder.
 *
 * `hideOnHash`: modo foco. Cuando el form de compra está abierto (#comprar)
 * todo el cuerpo se oculta para no distraer. Reaparece al limpiarse el hash.
 */
export function ProjectBody({
  children,
  hideOnHash,
}: {
  children: React.ReactNode;
  hideOnHash?: string;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!hideOnHash) return;
    const sync = () => setHidden(window.location.hash === hideOnHash);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [hideOnHash]);

  if (hidden) return null;
  return <>{children}</>;
}
