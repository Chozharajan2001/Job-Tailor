import mongoose, { Schema, Document, Types } from 'mongoose';
import { IParsedJD } from '@jobtailor/shared-types';

export interface ICanonicalJobDocument extends Document {
  sourceId?: Types.ObjectId;
  sourceName: string;
  sourceUrl?: string;
  companyName: string;
  jobTitle: string;
  location: string;
  workType: 'remote' | 'hybrid' | 'onsite';
  employmentType?: 'full-time' | 'part-time' | 'contract' | 'internship';
  salaryRange?: { min: number; max: number; currency: string };
  postedDate?: Date;
  applyUrl?: string;
  description: string;
  structuredJD?: IParsedJD;
  rawHtmlSnapshot?: string;
  extractionConfidence: number;
  dedupeKey: string;
  descriptionHash?: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  expiredAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const parsedJDSchema = new Schema<IParsedJD>(
  {
    summary: { type: String, default: '' },
    seniorityLevel: { type: String, enum: ['entry', 'mid', 'senior', 'staff', 'principal'], default: 'mid' },
    focusWeights: {
      frontend: { type: Number, default: 0 },
      backend: { type: Number, default: 0 },
      devops: { type: Number, default: 0 },
      ai: { type: Number, default: 0 },
      mobile: { type: Number, default: 0 },
    },
    requiredSkills: [{ type: String }],
    preferredSkills: [{ type: String }],
    responsibilities: [{ type: String }],
    qualifications: [{ type: String }],
    niceToHaves: [{ type: String }],
    tone: { type: String, enum: ['formal', 'casual', 'technical', 'corporate'], default: 'technical' },
  },
  { _id: false }
);

const canonicalJobSchema = new Schema<ICanonicalJobDocument>(
  {
    sourceId: { type: Schema.Types.ObjectId, ref: 'SourceRegistry' },
    sourceName: { type: String, required: true, trim: true },
    sourceUrl: { type: String, trim: true },
    companyName: { type: String, required: true, trim: true },
    jobTitle: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true, default: 'remote' },
    workType: {
      type: String,
      enum: ['remote', 'hybrid', 'onsite'],
      required: true,
      default: 'remote',
    },
    employmentType: {
      type: String,
      enum: ['full-time', 'part-time', 'contract', 'internship'],
    },
    salaryRange: {
      min: Number,
      max: Number,
      currency: { type: String, default: 'USD' },
    },
    postedDate: Date,
    applyUrl: { type: String, trim: true },
    description: { type: String, required: true },
    structuredJD: parsedJDSchema,
    rawHtmlSnapshot: { type: String },
    extractionConfidence: { type: Number, default: 1.0 },
    dedupeKey: { type: String, required: true, unique: true, index: true },
    descriptionHash: { type: String, index: true },
    firstSeenAt: { type: Date, required: true, default: Date.now },
    lastSeenAt: { type: Date, required: true, default: Date.now },
    expiredAt: Date,
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  {
    timestamps: true,
  }
);

// Create compound and text indexes for search
canonicalJobSchema.index({ companyName: 1, jobTitle: 1, location: 1 });
canonicalJobSchema.index({ firstSeenAt: -1 });

// Create text index for scoring text searches
canonicalJobSchema.index(
  {
    jobTitle: 'text',
    companyName: 'text',
    location: 'text',
    description: 'text',
  },
  {
    weights: {
      jobTitle: 10,
      companyName: 5,
      location: 2,
      description: 1,
    },
    name: 'CanonicalJobTextSearch',
  }
);

export const CanonicalJob = mongoose.model<ICanonicalJobDocument>('CanonicalJob', canonicalJobSchema);
