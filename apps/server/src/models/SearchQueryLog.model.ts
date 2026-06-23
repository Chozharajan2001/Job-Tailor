import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISearchQueryLogDocument extends Document {
  userId: Types.ObjectId;
  query: string;
  filters: Record<string, any>;
  resultsCount: number;
  clickedJobIds: Types.ObjectId[];
  createdAt: Date;
}

const searchQueryLogSchema = new Schema<ISearchQueryLogDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    query: {
      type: String,
      trim: true,
      default: '',
    },
    filters: {
      type: Schema.Types.Mixed,
      default: {},
    },
    resultsCount: {
      type: Number,
      default: 0,
    },
    clickedJobIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'CanonicalJob',
      },
    ],
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  }
);

searchQueryLogSchema.index({ createdAt: -1 });

export const SearchQueryLog = mongoose.model<ISearchQueryLogDocument>('SearchQueryLog', searchQueryLogSchema);
