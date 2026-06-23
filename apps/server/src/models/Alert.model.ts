import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAlertDocument extends Document {
  userId: Types.ObjectId;
  savedSearchId: Types.ObjectId;
  canonicalJobId: Types.ObjectId;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const alertSchema = new Schema<IAlertDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    savedSearchId: { type: Schema.Types.ObjectId, ref: 'SavedSearch', required: true },
    canonicalJobId: { type: Schema.Types.ObjectId, ref: 'CanonicalJob', required: true },
    isRead: { type: Boolean, required: true, default: false },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying a user's unread alerts efficiently
alertSchema.index({ userId: 1, isRead: 1 });

export const Alert = mongoose.model<IAlertDocument>('Alert', alertSchema);
