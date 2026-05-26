import mongoose, { Schema, Types, Document } from 'mongoose';

export interface IMatchedSkill {
  skill: string;
  presentInResume: boolean;
  presentInJD: boolean;
  weight: number;
}

export interface IMissingSkill {
  skill: string;
  required: boolean;
  suggestion: string;
}

export interface IWeakSkill {
  skill: string;
  userYearsExp: number;
  requiredYearsExp: number;
  gap: number;
  suggestion: string;
}

export interface IATSScore {
  overallScore: number;
  keywordMatchScore: number;
  semanticMatchScore: number;
  sectionCompletenessScore: number;
  formatScore: number;
  breakdown: {
    matchedSkills: IMatchedSkill[];
    missingSkills: IMissingSkill[];
    weakSkills: IWeakSkill[];
    actionItems: string[];
  };
}

export interface IResume extends Document {
  userId: Types.ObjectId;
  jobId?: Types.ObjectId; // Optional - if null, it's a profile-based master resume
  isProfileResume?: boolean; // Flag to indicate this is the user's master/profile resume
  version: number;
  versionLabel: string;
  tailoredSummary: string;
  skills: Array<{
    name: string; category: string; yearsOfExperience: number; proficiency: string; isHighlighted: boolean;
  }>;
  experience: Array<{
    _id?: Types.ObjectId;
    company: string; role: string; startDate: string; endDate: string | null;
    location: string; isCurrentRole: boolean; bullets: Array<{ id: string; text: string; tags: string[] }>;
  }>;
  projects: Array<{
    name: string; description: string; techStack: string[]; tags: string[];
    highlights: string[];
  }>;
  sectionOrder: string[];
  atsScore: IATSScore;
  pdfUrl?: string;
  status: 'draft' | 'generated' | 'downloaded' | 'used';
  createdAt: Date;
  updatedAt: Date;
}

const atsSchema = new Schema<IATSScore>(
  {
    overallScore: { type: Number, default: 0 },
    keywordMatchScore: { type: Number, default: 0 },
    semanticMatchScore: { type: Number, default: 0 },
    sectionCompletenessScore: { type: Number, default: 0 },
    formatScore: { type: Number, default: 0 },
    breakdown: {
      matchedSkills: [
        { skill: String, presentInResume: Boolean, presentInJD: Boolean, weight: Number },
      ],
      missingSkills: [{ skill: String, required: Boolean, suggestion: String }],
      weakSkills: [
        { skill: String, userYearsExp: Number, requiredYearsExp: Number, gap: Number, suggestion: String },
      ],
      actionItems: [String],
    },
  },
  { _id: false }
);

const resumeSchema = new Schema<IResume>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // index: true removed - compound index below covers this
    jobId: { type: Schema.Types.ObjectId, ref: 'Job' }, // Optional - null for profile-based resumes
    isProfileResume: { type: Boolean, default: false }, // Flag to identify master/profile resume

    // Versioning
    version: { type: Number, required: true },
    versionLabel: { type: String, required: true },

    // Tailored content (snapshots from master profile)
    tailoredSummary: { type: String, default: '' },
    skills: [
      {
        name: String,
        category: String,
        yearsOfExperience: Number,
        proficiency: String,
        isHighlighted: Boolean,
      },
    ],
    experience: [
      new Schema(
        {
          company: String,
          role: String,
          startDate: String,
          endDate: String,
          location: String,
          isCurrentRole: Boolean,
          bullets: [{ id: String, text: String, tags: [String] }],
        },
        { _id: true }
      ),
    ],
    projects: [
      {
        name: String,
        description: String,
        techStack: [String],
        tags: [String],
        highlights: [String],
      },
    ],

    // Layout
    sectionOrder: { type: [String], default: ['skills', 'experience', 'projects', 'education'] },

    // ATS Analysis
    atsScore: atsSchema,

    // File
    pdfUrl: String,

    // Status
    status: {
      type: String,
      enum: ['draft', 'generated', 'downloaded', 'used'],
      default: 'draft',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for querying resumes
resumeSchema.index({ userId: 1, jobId: 1 }); // For job-specific resumes
resumeSchema.index({ userId: 1, isProfileResume: 1 }); // For profile-based resumes

export const Resume = mongoose.model<IResume>('Resume', resumeSchema);
