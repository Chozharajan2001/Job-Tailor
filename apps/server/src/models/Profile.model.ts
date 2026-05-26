import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISkill {
  _id?: Types.ObjectId;
  name: string;
  category: 'frontend' | 'backend' | 'devops' | 'ai' | 'mobile' | 'database' | 'other';
  yearsOfExperience: number;
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  isHighlighted: boolean;
}

export interface IBullet {
  id: string;
  text: string;
  tags: ('frontend' | 'backend' | 'devops' | 'ai' | 'testing' | 'leadership')[];
  usedInResumes: number;
}

export interface IExperienceBlock {
  _id?: Types.ObjectId;
  company: string;
  role: string;
  startDate: string;
  endDate: string | null;
  location: string;
  isCurrentRole: boolean;
  description: string;
  bullets: IBullet[];
}

export interface IProjectItem {
  _id?: Types.ObjectId;
  name: string;
  description: string;
  techStack: string[];
  tags: ('frontend' | 'backend' | 'devops' | 'ai' | 'mobile')[];
  link?: string;
  github?: string;
  startDate: string;
  endDate?: string;
  highlights: string[];
}

export interface IEducationItem {
  _id?: Types.ObjectId;
  institution: string;
  degree: string;
  field: string;
  startYear: number;
  endYear?: number;
  gpa?: string;
}

export interface ICertificationItem {
  _id?: Types.ObjectId;
  name: string;
  issuer: string;
  date: string;
  credentialUrl?: string;
}

export interface ILinks {
  github?: string;
  linkedin?: string;
  portfolio?: string;
  website?: string;
}

export interface IProfile extends Document {
  userId: Types.ObjectId;
  summary: string;
  skills: ISkill[];
  experience: IExperienceBlock[];
  projects: IProjectItem[];
  education: IEducationItem[];
  certifications: ICertificationItem[];
  links: ILinks;
  customSections: Array<{ title: string; content: string }>;
  createdAt: Date;
  updatedAt: Date;
}

const skillSchema = new Schema<ISkill>(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: ['frontend', 'backend', 'devops', 'ai', 'mobile', 'database', 'other'], required: true },
    yearsOfExperience: { type: Number, required: true, min: 0, max: 50 },
    proficiency: { type: String, enum: ['beginner', 'intermediate', 'advanced', 'expert'], required: true },
    isHighlighted: { type: Boolean, default: false },
  },
  { _id: true }
);

const bulletSchema = new Schema<IBullet>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true, trim: true },
    tags: [{ type: String, enum: ['frontend', 'backend', 'devops', 'ai', 'testing', 'leadership'] }],
    usedInResumes: { type: Number, default: 0 },
  },
  { _id: false }
);

const experienceSchema = new Schema<IExperienceBlock>(
  {
    company: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    startDate: { type: String, required: true },
    endDate: { type: String, default: null },
    location: { type: String, required: true },
    isCurrentRole: { type: Boolean, default: false },
    description: { type: String, trim: true },
    bullets: [bulletSchema],
  },
  { timestamps: false }
);

const projectSchema = new Schema<IProjectItem>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    techStack: [{ type: String }],
    tags: [{ type: String, enum: ['frontend', 'backend', 'devops', 'ai', 'mobile'] }],
    link: { type: String },
    github: { type: String },
    startDate: { type: String, required: true },
    endDate: { type: String },
    highlights: [{ type: String, trim: true }],
  },
  { timestamps: false }
);

const educationSchema = new Schema<IEducationItem>(
  {
    institution: { type: String, required: true, trim: true },
    degree: { type: String, required: true, trim: true },
    field: { type: String, required: true, trim: true },
    startYear: { type: Number, required: true, min: 1980, max: 2035 },
    endYear: { type: Number, min: 1980, max: 2035 },
    gpa: { type: String },
  },
  { timestamps: false }
);

const certificationSchema = new Schema<ICertificationItem>(
  {
    name: { type: String, required: true, trim: true },
    issuer: { type: String, required: true, trim: true },
    date: { type: String, required: true },
    credentialUrl: { type: String },
  },
  { timestamps: false }
);

const profileSchema = new Schema<IProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    summary: { type: String, default: '', maxlength: 500 },
    skills: [skillSchema],
    experience: [experienceSchema],
    projects: [projectSchema],
    education: [educationSchema],
    certifications: [certificationSchema],
    links: {
      github: String,
      linkedin: String,
      portfolio: String,
      website: String,
    },
    customSections: [
      {
        title: { type: String, required: true },
        content: { type: String, required: true },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Index for fast user lookup - REMOVED: userId already has unique: true which creates an index automatically
// profileSchema.index({ userId: 1 }); // Duplicate index removed

export const Profile = mongoose.model<IProfile>('Profile', profileSchema);
