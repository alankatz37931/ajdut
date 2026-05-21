/**
 * Reglas de validación por scope de upload — tamaño máximo y MIME types
 * permitidos. Compartido por la ruta /api/uploads/presign (que las aplica al
 * firmar el token de Vercel Blob) y, vía el tipo, por el componente FileUpload.
 */

export type UploadScope =
  | "profile-photo"
  | "id-photo"
  | "report-attachment"
  | "project-doc"
  | "chat-attachment";

export type ScopeRule = {
  maxBytes: number;
  /** MIME types permitidos. Array vacío = cualquier tipo. */
  mimeTypes: readonly string[];
};

const MB = 1024 * 1024;

const DOC_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc
  "image/png",
  "image/jpeg",
] as const;

export const SCOPE_RULES: Record<UploadScope, ScopeRule> = {
  "profile-photo": {
    maxBytes: 5 * MB,
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
  },
  "id-photo": {
    maxBytes: 5 * MB,
    mimeTypes: ["image/png", "image/jpeg", "application/pdf"],
  },
  "report-attachment": {
    maxBytes: 25 * MB,
    mimeTypes: DOC_MIME_TYPES,
  },
  "project-doc": {
    maxBytes: 25 * MB,
    mimeTypes: DOC_MIME_TYPES,
  },
  "chat-attachment": {
    maxBytes: 25 * MB,
    mimeTypes: [], // cualquier tipo
  },
};

export function isUploadScope(value: unknown): value is UploadScope {
  return typeof value === "string" && value in SCOPE_RULES;
}
