/**
 * ProjectVideo — embed 16:9 del proyecto.
 *
 * Marco hairline minimal, sin sombras ni gradientes (regla 09). Si la URL no
 * matchea un proveedor soportado, devolvemos un link discreto en lugar del
 * iframe — nunca forzamos un placeholder ruidoso.
 *
 * `bare`: modo embebido — sin margen superior ni max-width. Se usa cuando el
 * video vive dentro de otro contenedor (ej. la columna derecha del hero).
 */

type Props = {
  embedSrc: string | null;
  rawUrl: string;
  titlePrefix: string;
  projectName: string;
  openLabel: string;
  bare?: boolean;
};

export function ProjectVideo({
  embedSrc,
  rawUrl,
  titlePrefix,
  projectName,
  openLabel,
  bare,
}: Props) {
  if (embedSrc) {
    const box = (
      <div
        className="hairline relative bg-paper-dark"
        style={{ paddingTop: "56.25%" }}
      >
        <iframe
          src={embedSrc}
          title={`${titlePrefix} ${projectName}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </div>
    );
    if (bare) return box;
    return <div className="mt-8 sm:mt-10 max-w-2xl">{box}</div>;
  }
  return (
    <p className={bare ? "" : "mt-10"}>
      <a
        href={rawUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="eyebrow hover:!text-gold"
      >
        {openLabel}
      </a>
    </p>
  );
}
