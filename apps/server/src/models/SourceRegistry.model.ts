import mongoose, { Schema, Document } from 'mongoose';
import { SearchSourceType, SearchExtractionStrategy } from '@jobtailor/shared-types';

export interface ISourceRegistryDocument extends Document {
  name: string;
  sourceType: SearchSourceType;
  baseUrl: string;
  crawlFrequency: number; // in minutes
  extractionStrategy: SearchExtractionStrategy;
  robotsPolicy?: { allowCrawl: boolean; crawlDelay?: number };
  trustScore: number;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const sourceRegistrySchema = new Schema<ISourceRegistryDocument>(
  {
    name: {
      type: String,
      required: [true, 'Source name is required'],
      trim: true,
      unique: true,
    },
    sourceType: {
      type: String,
      enum: ['manual_paste', 'public_job_page'],
      required: [true, 'Source type is required'],
    },
    baseUrl: {
      type: String,
      required: [true, 'Base URL is required'],
      trim: true,
    },
    crawlFrequency: {
      type: Number,
      required: [true, 'Crawl frequency is required'],
      default: 1440, // 24 hours in minutes
    },
    extractionStrategy: {
      type: String,
      enum: ['html_metadata', 'json_ld', 'manual_input'],
      required: [true, 'Extraction strategy is required'],
    },
    robotsPolicy: {
      allowCrawl: { type: Boolean, default: true },
      crawlDelay: { type: Number, default: 1 },
    },
    trustScore: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.5,
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const SourceRegistry = mongoose.model<ISourceRegistryDocument>('SourceRegistry', sourceRegistrySchema);
