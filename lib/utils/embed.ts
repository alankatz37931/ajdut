/**
 * Detecta YouTube / Vimeo en una URL y devuelve la URL de embed.
 * Si no es ninguna plataforma soportada, devuelve null y la UI debería caer a
 * un link "Ver video ↗".
 *
 * Acepta:
 *  - youtube.com/watch?v=<id>
 *  - youtube.com/shorts/<id>
 *  - youtu.be/<id>
 *  - vimeo.com/<id> (con o sin trailing path)
 */
export function embedUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const url = rawUrl.trim();
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

  // YouTube short link: youtu.be/<id>
  if (host === "youtu.be") {
    const id = parsed.pathname.replace(/^\/+/, "").split("/")[0];
    if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
    return null;
  }

  // YouTube watch: youtube.com/watch?v=<id>
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    if (parsed.pathname === "/watch") {
      const id = parsed.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
    }
    // youtube.com/shorts/<id> or youtube.com/embed/<id>
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && (parts[0] === "shorts" || parts[0] === "embed")) {
      const id = parts[1];
      if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
    }
    return null;
  }

  // Vimeo: vimeo.com/<id>
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const parts = parsed.pathname.split("/").filter(Boolean);
    // player.vimeo.com/video/<id> ya es embed; lo devolvemos tal cual.
    if (host === "player.vimeo.com" && parts[0] === "video" && parts[1]) {
      return `https://player.vimeo.com/video/${encodeURIComponent(parts[1])}`;
    }
    // vimeo.com/<id> donde <id> es numérico
    const id = parts.find((p) => /^\d+$/.test(p));
    if (id) return `https://player.vimeo.com/video/${encodeURIComponent(id)}`;
    return null;
  }

  return null;
}
