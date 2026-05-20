import type { Prisma, PrismaClient } from "@prisma/client";

type AnyTxClient = PrismaClient | Prisma.TransactionClient;

export type AuditAction =
  | "APPLICATION.SUBMITTED"
  | "APPLICATION.REVIEW_STARTED"
  | "APPLICATION.APPROVED"
  | "APPLICATION.REJECTED"
  | "USER.CREATED"
  | "USER.SUSPENDED"
  | "USER.REACTIVATED"
  | "PROJECT.CREATED"
  | "PROJECT.SUBMITTED_FOR_APPROVAL"
  | "PROJECT.APPROVED"
  | "PROJECT.SUSPENDED"
  | "PROJECT.CLOSED"
  | "PARTICIPATION.CREATED"
  | "PARTICIPATION.LEAD_CREATED"
  | "PARTICIPATION.LEAD_DISMISSED"
  | "PARTICIPATION.ASSIGNED"
  | "PARTICIPATION.RESALE_LISTED"
  | "PARTICIPATION.RESALE_CANCELLED"
  | "PARTICIPATION.RESALE_DEAL_CLOSED"
  | "PARTICIPATION.TRANSFER_VALIDATED"
  | "PARTICIPATION.TRANSFER_REJECTED"
  | "CERTIFICATE.ISSUED"
  | "CERTIFICATE.REVOKED"
  | "REPORT.PUBLISHED"
  | "METRIC.RECORDED"
  | "MILESTONE.STATUS_CHANGED"
  | "DISTRIBUTION.DRAFTED"
  | "DISTRIBUTION.ANNOUNCED"
  | "DISTRIBUTION.PAYMENT_SENT"
  | "DISTRIBUTION.PAYMENT_RECEIVED"
  | "DISTRIBUTION.PAYMENT_DISPUTED"
  | "DISTRIBUTION.PAYMENT_RESOLVED"
  | "DISTRIBUTION.COMPLETED"
  | "DISTRIBUTION.CANCELLED"
  | "EMAIL.FAILED"
  | "RATE_LIMIT.HIT"
  | "FOUNDER.UPSERTED"
  | "FOUNDER.REMOVED"
  | "MILESTONE.UPSERTED"
  | "MILESTONE.REMOVED"
  | "METRIC.REMOVED"
  | "INFO_REQUEST.CREATED"
  | "INFO_REQUEST.APPROVED"
  | "INFO_REQUEST.REJECTED";

export type AuditEntry = {
  actorId: string | null;
  projectId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function recordAudit(tx: AnyTxClient, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      projectId: entry.projectId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      payload: (entry.payload ?? {}) as Prisma.InputJsonValue,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    },
  });
}
