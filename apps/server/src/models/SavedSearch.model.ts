import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISavedSearchDocument extends Document {
  userId: Types.ObjectId;
  name: string;
  query?: string;
  filters: {
    location?: string;
    workType?: string;
    companyName?: string;
  };
  alertSubscription: {
    emailEnabled: boolean;
    inAppEnabled: boolean;
  };
  lastRunAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const savedSearchSchema = new Schema<ISavedSearchDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Saved search name is required'],
      trim: true,
    },
    query: {
      type: String,
      trim: true,
    },
    filters: {
      location: String,
      workType: {
        type: String,
        enum: ['remote', 'hybrid', 'onsite'],
      },
      companyName: String,
    },
    alertSubscription: {
      emailEnabled: {
        type: Boolean,
        default: false,
      },
      inAppEnabled: {
        type: Boolean,
        default: true,
      },
    },
    lastRunAt: Date,
  },
  {
    timestamps: true,
  }
);

savedSearchSchema.index({ userId: 1, createdAt: -1 });

export const SavedSearch = mongoose.model<ISavedSearchDocument>('SavedSearch', savedSearchSchema);
