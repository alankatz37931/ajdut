/**
 * ProjectVideo — embed 16:9 prominente justo debajo del hero.
 *
 * Marco hairline minimal, sin sombras ni gradientes (regla 09). Si la URL no
 * matchea un proveedor soportado, devolvemos un link discreto en lugar del
 * iframe — nunca forzamos un placeholder ruidoso.
 */

type Props = {
  embedSrc: string | null;
  rawUrl: string;
  titlePrefix: string;
  projectName: string;
  openLabel: string;
};

export function ProjectVideo({
  embedSrc,
  rawUrl,
  titlePrefix,
  projectName,
  openLabel,
}: Props) {
  if (embedSrc) {
    // max-w-2xl: el embed no ocupa el ancho completo de la ficha — queda
    // como una pieza acotada y prolija, no un banner gigante.
    return (
      <div className="mt-8 sm:mt-10 max-w-2xl">
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
      </div>
    );
  }
  return (
    <p className="mt-10">
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
