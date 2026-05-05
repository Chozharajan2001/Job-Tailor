import mongoose, { Schema, Types, Document } from 'mongoose';

export interface IParsedJD {
  summary: string;
  seniorityLevel: 'entry' | 'mid' | 'senior' | 'staff' | 'principal';
  focusWeights: {
    frontend: number;
    backend: number;
    devops: number;
    ai: number;
    mobile: number;
  };
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  qualifications: string[];
  niceToHaves: string[];
  tone: 'formal' | 'casual' | 'technical' | 'corporate';
}

export interface INote {
  id: string;
  content: string;
  createdAt: Date;
}

export interface IJob extends Document {
  userId: Types.ObjectId;
  companyName: string;
  jobTitle: string;
  jobLink?: string;
  location: string;
  workType: 'remote' | 'hybrid' | 'onsite';
  employmentType: 'full-time' | 'part-time' | 'contract' | 'internship';
  salaryRange?: { min: number; max: number; currency: string };
  postedDate?: Date;
  jdRawText: string;
  parsedJD: IParsedJD | null;
  status: 'saved' | 'applied' | 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn';
  notes: INote[];
  appliedDate?: Date;
  savedAt: Date;
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

const noteSchema = new Schema<INote>(
  {
    id: { type: String, required: true, default: () => new Types.ObjectId().toString() },
    content: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const jobSchema = new Schema<IJob>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Company info
    companyName: { type: String, required: true, trim: true },
    jobTitle: { type: String, required: true, trim: true },
    jobLink: { type: String },
    location: { type: String, required: true },
    workType: { type: String, enum: ['remote', 'hybrid', 'onsite'], required: true },
    employmentType: { type: String, enum: ['full-time', 'part-time', 'contract', 'internship'], required: true },
    salaryRange: {
      min: Number,
      max: Number,
      currency: { type: String, default: 'USD' },
    },
    postedDate: Date,

    // Job Description
    jdRawText: { type: String, required: true },
    parsedJD: parsedJDSchema,

    // Pipeline status
    status: {
      type: String,
      enum: ['saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'],
      default: 'saved',
      index: true,
    },
    notes: [noteSchema],
    appliedDate: Date,
  },
  {
    timestamps: true,
  }
);

// Compound index for user's filtered queries
jobSchema.index({ userId: 1, status: 1 });
jobSchema.index({ userId: 1, savedAt: -1 });

export const Job = mongoose.model<IJob>('Job', jobSchema);
