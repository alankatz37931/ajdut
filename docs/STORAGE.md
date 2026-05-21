# Storage (Vercel Blob)

AJDUT usa **Vercel Blob** para alojar los archivos que suben los usuarios:

- Foto de perfil — `User.avatarUrl`
- Documentos de proyecto (pitch deck, data room, proyecciones, plan de
  negocios, etc.) — campos `*Url` del proyecto
- Adjuntos de reportes — `Report`

Las subidas son **solo de archivo**: elegir desde la computadora o
arrastrar-y-soltar. No hay opción de pegar una URL externa.

---

## Arquitectura

El componente `FileUpload` usa `upload()` de `@vercel/blob/client`, que sube el
archivo **directo del browser a Vercel Blob** — el binario nunca pasa por
nuestro servidor.

```
Browser  ──①──  POST /api/uploads/presign
                (handleUpload: valida sesión + scope + tamaño/MIME)
         ◄────  token de subida de un solo uso

Browser  ──②──  PUT directo a Vercel Blob
         ◄────  { url }  — URL pública del archivo
```

La URL pública resultante la persiste el caller (la server action del
formulario). El componente nunca persiste por sí solo.

Archivos clave:

- `lib/storage/scopes.ts` — reglas de validación por scope (tamaño + MIME).
- `app/api/uploads/presign/route.ts` — `handleUpload`: autoriza y firma el token.
- `components/ui/FileUpload.tsx` — componente cliente (drag & drop + progreso).

---

## Configuración

Vercel Blob no necesita cuenta externa, ni API tokens manuales, ni CORS. Se
activa desde el panel de Vercel:

1. **Crear el store.** Vercel → pestaña **Storage** → crear un store **Blob**.
   - Nombre: `ajdut-uploads`
   - Access: **Public** (los archivos se sirven directo por su URL).
2. **Conectar al proyecto.** Conectá el store al proyecto `ajdut` (entornos
   Production + Preview). Esto inyecta `BLOB_READ_WRITE_TOKEN` automáticamente
   en el proyecto de Vercel.
3. **Dev local.** Copiá el valor de `BLOB_READ_WRITE_TOKEN` (pestaña
   `.env.local` en la página del store) al archivo `.env` local.
4. Reiniciá `pnpm dev`.

El SDK `@vercel/blob` lee `BLOB_READ_WRITE_TOKEN` del entorno automáticamente.

---

## Scopes y límites

Definidos en `lib/storage/scopes.ts`. La ruta los aplica al firmar el token —
Vercel Blob rechaza la subida si el archivo excede el tamaño o el MIME no está
permitido.

| Scope               | Tamaño máx | Tipos permitidos                                  |
| ------------------- | ---------- | ------------------------------------------------- |
| `profile-photo`     | 5 MB       | PNG, JPEG, WebP                                   |
| `report-attachment` | 25 MB      | PDF, Excel (xlsx/xls), Word (docx/doc), PNG, JPEG |
| `project-doc`       | 25 MB      | Idem `report-attachment`                          |
| `id-photo`          | 5 MB       | PNG, JPEG, PDF — _definido, sin uso actual_        |
| `chat-attachment`   | 25 MB      | Cualquiera — _definido, sin uso actual_           |

El tamaño y el MIME se validan **en el server** (no solo en el cliente).

---

## Estructura de los blobs

El pathname que se sube es `<scope>/<nombre-slugificado>`, y Vercel Blob le
agrega un sufijo aleatorio (`addRandomSuffix: true`) para que sea único e
imposible de adivinar:

```
project-doc/plan-de-negocios-a7f3k9.pdf
profile-photo/retrato-9k2m4n.jpg
```

---

## Costos

Vercel Blob tiene un tier gratis incluido en el plan Hobby (≈1 GB de storage +
10 GB de transferencia / mes). Más allá de eso, es uso medido. Para la escala
actual de AJDUT, gratis.

---

## Seguridad

- Solo usuarios con sesión pueden obtener un token de subida — `requireSession()`
  corre dentro de `onBeforeGenerateToken`.
- Tamaño y MIME se validan en el server al firmar el token.
- Los blobs son públicos, pero la URL lleva un sufijo aleatorio largo: no es
  listable ni adivinable.
- Para documentos sensibles a futuro, se puede migrar a un store **privado** y
  servir esos archivos con URLs firmadas.
