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
  | "RESALE.BUYER_CONFIRMED"
  | "RESALE.OWNER_CONFIRMED"
  | "RESALE.ADMIN_OVERRIDE"
  | "PARTICIPATION.SPLIT"
  | "PARTICIPATION.TRANSFERRED"
  | "CERTIFICATE.ISSUED"
  | "CERTIFICATE.REVOKED"
  | "REPORT.PUBLISHED"
  | "DOCUMENT.UPLOADED"
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
  | "INFO_REQUEST.REJECTED"
  | "ADMIN_BROADCAST.SENT"
  | "PARTICIPATION.INVITED"
  | "PARTICIPATION.ASSIGN_PROPOSED"
  | "PARTICIPATION.ASSIGN_APPROVED"
  | "PARTICIPATION.ASSIGN_REJECTED"
  | "PARTICIPATION.ASSIGN_TARGET_CONFIRMED"
  | "PARTICIPATION.ASSIGN_TARGET_REMINDER_SENT"
  | "PARTICIPATION.ASSIGN_ADMIN_OVERRIDE"
  | "CHAT.MESSAGE_POSTED"
  | "CHAT.MESSAGE_DELETED"
  | "CHAT.POLL_CREATED"
  | "CHAT.POLL_VOTED"
  | "CHAT.POLL_CLOSED";

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
