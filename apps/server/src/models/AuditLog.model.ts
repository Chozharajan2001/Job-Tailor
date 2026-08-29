import mongoose, { Schema } from "mongoose";

/**
 * Persisted security audit trail.
 * Every auth-related event (login, refresh, revocation, password changes)
 * is stored here for forensic review — console output alone is volatile.
 */
export interface IAuditLog {
  timestamp: Date;
  eventType: string;
  success: boolean;
  data: Record<string, unknown>;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    timestamp: { type: Date, required: true, index: true },
    eventType: { type: String, required: true, index: true },
    success: { type: Boolean, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { versionKey: false },
);

// Common lookups: per-user history and recent events
auditLogSchema.index({ "data.userId": 1, timestamp: -1 });

export const AuditLog = mongoose.model<IAuditLog>("AuditLog", auditLogSchema);
