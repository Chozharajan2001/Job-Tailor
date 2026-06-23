import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWatchDocument extends Document {
  userId: Types.ObjectId;
  type: 'company' | 'title';
  value: string;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const watchSchema = new Schema<IWatchDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['company', 'title'], required: true },
    value: { type: String, required: true, trim: true },
    isEnabled: { type: Boolean, required: true, default: true },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate watch configurations for the same user, type, and keyword
watchSchema.index({ userId: 1, type: 1, value: 1 }, { unique: true });

export const Watch = mongoose.model<IWatchDocument>('Watch', watchSchema);
