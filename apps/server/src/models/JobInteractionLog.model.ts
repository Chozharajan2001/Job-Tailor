import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IJobInteractionLogDocument extends Document {
  userId: Types.ObjectId;
  canonicalJobId: Types.ObjectId;
  interactionType: 'click' | 'import' | 'flag_expired' | 'flag_spam' | 'dismiss';
  feedbackComment?: string;
  createdAt: Date;
}

const jobInteractionLogSchema = new Schema<IJobInteractionLogDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    canonicalJobId: {
      type: Schema.Types.ObjectId,
      ref: 'CanonicalJob',
      required: true,
      index: true,
    },
    interactionType: {
      type: String,
      enum: ['click', 'import', 'flag_expired', 'flag_spam', 'dismiss'],
      required: true,
    },
    feedbackComment: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  }
);

jobInteractionLogSchema.index({ createdAt: -1 });

export const JobInteractionLog = mongoose.model<IJobInteractionLogDocument>('JobInteractionLog', jobInteractionLogSchema);
